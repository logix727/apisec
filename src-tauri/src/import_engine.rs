use crate::analysis::{self, Finding};
use anyhow::Result;
use calamine::{open_workbook, DataType, Reader, Xlsx};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ImportEntry {
    pub url: String,
    pub method: String,
    pub status_code: Option<i64>,
    pub req_body: Option<String>,
    pub res_body: Option<String>,
    pub findings: Vec<Finding>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ImportResult {
    pub entries: Vec<ImportEntry>,
    pub source_type: String, // "text", "excel", "har"
}

pub struct Parser;

impl Parser {
    pub fn parse_text(
        content: &str,
        custom_rules: &[crate::db::CustomRule],
        plugins: &[crate::plugins::PluginPack],
    ) -> ImportResult {
        let url_regex = Regex::new(r"https?://[^\s/$.?#].[^\s]*").unwrap();
        let mut urls = HashSet::new();

        for mat in url_regex.find_iter(content) {
            urls.insert(mat.as_str().to_string());
        }

        let mut entries = Vec::new();
        for url in urls {
            // Scan each URL context? No, scan the whole content for findings,
            // but for "text" import we just treat findings as global or associated with first URL.
            // Actually, let's keep it simple: one entry per URL found.
            entries.push(ImportEntry {
                url,
                method: "GET".to_string(),
                status_code: None,
                req_body: None,
                res_body: None,
                findings: Vec::new(), // We'll add global findings later or leave empty
            });
        }

        // Global scan for the whole text
        let global_findings = analysis::Scanner::scan(content, custom_rules, plugins);
        if !entries.is_empty() {
            entries[0].findings = global_findings;
        }

        ImportResult {
            entries,
            source_type: "text".to_string(),
        }
    }

    pub fn parse_har(
        content: &str,
        custom_rules: &[crate::db::CustomRule],
        plugins: &[crate::plugins::PluginPack],
    ) -> Result<ImportResult> {
        let har: serde_json::Value = serde_json::from_str(content)?;
        let mut entries = Vec::new();

        if let Some(log) = har.get("log") {
            if let Some(har_entries) = log.get("entries").and_then(|e| e.as_array()) {
                for entry in har_entries {
                    let request = entry.get("request");
                    let response = entry.get("response");

                    if let (Some(req), Some(res)) = (request, response) {
                        let url = req
                            .get("url")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        let method = req
                            .get("method")
                            .and_then(|v| v.as_str())
                            .unwrap_or("GET")
                            .to_string();
                        let status_code = res.get("status").and_then(|v| v.as_i64());

                        let req_body = req
                            .get("postData")
                            .and_then(|p| p.get("text"))
                            .and_then(|t| t.as_str())
                            .map(|s| s.to_string());
                        let res_body = res
                            .get("content")
                            .and_then(|c| c.get("text"))
                            .and_then(|t| t.as_str())
                            .map(|s| s.to_string());

                        // Scan bodies for findings
                        let mut findings = Vec::new();
                        if let Some(ref b) = req_body {
                            findings.extend(analysis::Scanner::scan_text(b, custom_rules, plugins));
                        }
                        if let Some(ref b) = res_body {
                            findings.extend(analysis::Scanner::scan_text(b, custom_rules, plugins));
                        }
                        // Also scan URL just in case
                        findings.extend(analysis::Scanner::scan_text(&url, custom_rules, plugins));

                        entries.push(ImportEntry {
                            url,
                            method,
                            status_code,
                            req_body,
                            res_body,
                            findings,
                        });
                    }
                }
            }
        }

        Ok(ImportResult {
            entries,
            source_type: "har".to_string(),
        })
    }

    pub fn parse_excel(
        path: &str,
        custom_rules: &[crate::db::CustomRule],
        plugins: &[crate::plugins::PluginPack],
    ) -> Result<ImportResult> {
        let workbook: Xlsx<_> = open_workbook(path)?;
        Self::parse_workbook(workbook, custom_rules, plugins)
    }

    pub fn parse_excel_bytes(
        data: &[u8],
        custom_rules: &[crate::db::CustomRule],
        plugins: &[crate::plugins::PluginPack],
    ) -> Result<ImportResult> {
        let cursor = std::io::Cursor::new(data);
        let workbook: Xlsx<_> = calamine::Reader::new(cursor)?;
        Self::parse_workbook(workbook, custom_rules, plugins)
    }

    fn parse_workbook<R: std::io::Read + std::io::Seek>(
        mut workbook: Xlsx<R>,
        custom_rules: &[crate::db::CustomRule],
        plugins: &[crate::plugins::PluginPack],
    ) -> Result<ImportResult> {
        let mut content_buffer = String::new();

        if let Some(Ok(range)) = workbook.worksheet_range_at(0) {
            for row in range.rows() {
                for cell in row.iter() {
                    if let Some(s) = cell.get_string() {
                        content_buffer.push_str(s);
                        content_buffer.push(' ');
                    }
                }
            }
        }

        let mut result = Self::parse_text(&content_buffer, custom_rules, plugins);
        result.source_type = "excel".to_string();
        Ok(result)
    }

    pub fn parse_burp_xml(
        content: &str,
        custom_rules: &[crate::db::CustomRule],
        plugins: &[crate::plugins::PluginPack],
    ) -> Result<ImportResult> {
        let mut entries = Vec::new();
        let item_re = Regex::new(r"(?s)<item>(.*?)</item>")?;
        let url_re = Regex::new(r"<url><!\[CDATA\[(.*?)\]\]></url>")?;
        let host_re = Regex::new(r"<host.*?>(.*?)</host>")?;
        let path_re = Regex::new(r"<path><!\[CDATA\[(.*?)\]\]></path>")?;
        let method_re = Regex::new(r"<method><!\[CDATA\[(.*?)\]\]></method>")?;
        let status_re = Regex::new(r"<status>(.*?)</status>")?;
        let request_re =
            Regex::new(r#"(?s)<request base64="true"><!\[CDATA\[(.*?)\]\]></request>"#)?;
        let response_re =
            Regex::new(r#"(?s)<response base64="true"><!\[CDATA\[(.*?)\]\]></response>"#)?;

        for cap in item_re.captures_iter(content) {
            let inner = &cap[1];
            let host = host_re
                .captures(inner)
                .map(|c| c[1].to_string())
                .unwrap_or_default();
            let path = path_re
                .captures(inner)
                .map(|c| c[1].to_string())
                .unwrap_or_default();
            let url = url_re
                .captures(inner)
                .map(|c| c[1].to_string())
                .unwrap_or_else(|| format!("https://{}{}", host, path));
            let method = method_re
                .captures(inner)
                .map(|c| c[1].to_string())
                .unwrap_or_else(|| "GET".to_string());
            let status = status_re
                .captures(inner)
                .and_then(|c| c[1].parse::<i64>().ok());
            let req_base64 = request_re.captures(inner).map(|c| c[1].trim().to_string());
            let res_base64 = response_re.captures(inner).map(|c| c[1].trim().to_string());

            let mut req_body = None;
            let mut res_body = None;
            if let Some(r) = req_base64 {
                if let Ok(decoded) = base64_decode(&r) {
                    req_body = Some(decoded);
                }
            }
            if let Some(r) = res_base64 {
                if let Ok(decoded) = base64_decode(&r) {
                    res_body = Some(decoded);
                }
            }

            let mut findings = Vec::new();
            findings.extend(analysis::Scanner::scan_text(&url, custom_rules, plugins));
            if let Some(ref b) = req_body {
                findings.extend(analysis::Scanner::scan_text(b, custom_rules, plugins));
            }
            if let Some(ref b) = res_body {
                findings.extend(analysis::Scanner::scan_text(b, custom_rules, plugins));
            }

            entries.push(ImportEntry {
                url,
                method,
                status_code: status,
                req_body,
                res_body,
                findings,
            });
        }
        Ok(ImportResult {
            entries,
            source_type: "burp".to_string(),
        })
    }

    pub fn parse_postman(
        content: &str,
        custom_rules: &[crate::db::CustomRule],
        plugins: &[crate::plugins::PluginPack],
    ) -> Result<ImportResult> {
        let mut entries = Vec::new();
        let collection: serde_json::Value = serde_json::from_str(content)?;

        fn traverse_items(
            val: &serde_json::Value,
            entries: &mut Vec<ImportEntry>,
            custom_rules: &[crate::db::CustomRule],
            plugins: &[crate::plugins::PluginPack],
        ) {
            if let Some(items) = val.get("item").and_then(|v| v.as_array()) {
                for item in items {
                    if let Some(request) = item.get("request") {
                        let method = request
                            .get("method")
                            .and_then(|m| m.as_str())
                            .unwrap_or("GET")
                            .to_string();
                        let url = if let Some(url_obj) = request.get("url") {
                            if let Some(raw) = url_obj.get("raw").and_then(|r| r.as_str()) {
                                raw.to_string()
                            } else if let Some(href) = url_obj.as_str() {
                                href.to_string()
                            } else {
                                "unknown".to_string()
                            }
                        } else {
                            "unknown".to_string()
                        };

                        let req_body = request
                            .get("body")
                            .and_then(|b| b.get("raw"))
                            .and_then(|r| r.as_str())
                            .map(|s| s.to_string());

                        let mut findings = Vec::new();
                        findings.extend(analysis::Scanner::scan_text(&url, custom_rules, plugins));
                        if let Some(ref b) = req_body {
                            findings.extend(analysis::Scanner::scan_text(b, custom_rules, plugins));
                        }

                        entries.push(ImportEntry {
                            url,
                            method,
                            status_code: None,
                            req_body,
                            res_body: None,
                            findings,
                        });
                    }
                    // Recursive call for nested folders
                    traverse_items(item, entries, custom_rules, plugins);
                }
            }
        }

        traverse_items(&collection, &mut entries, custom_rules, plugins);

        Ok(ImportResult {
            entries,
            source_type: "postman".to_string(),
        })
    }
}

fn base64_decode(input: &str) -> Result<String> {
    use base64::{engine::general_purpose, Engine as _};
    let bytes = general_purpose::STANDARD.decode(input.replace("\n", "").replace("\r", ""))?;
    Ok(String::from_utf8_lossy(&bytes).to_string())
}
