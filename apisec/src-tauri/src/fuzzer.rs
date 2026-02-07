use serde::{Deserialize, Serialize};
use crate::analysis::{Finding, FindingSeverity};
use std::time::Duration;
use tauri::Emitter;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FuzzTask {
    pub url: String,
    pub method: String,
    pub headers: std::collections::HashMap<String, String>,
    pub body: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct FuzzResult {
    pub payload: String,
    pub status: u16,
    pub time_ms: u64,
    pub finding: Option<Finding>,
}

pub const SQLI_PAYLOADS: &[&str] = &[
    "' OR '1'='1",
    "'; DROP TABLE users; --",
    "1' ORDER BY 10--",
    "admin'--",
];

pub const XSS_PAYLOADS: &[&str] = &[
    "<script>alert(1)</script>",
    "'\"><img src=x onerror=alert(1)>",
    "javascript:alert(1)",
];

pub async fn run_fuzz_test(
    app_handle: tauri::AppHandle,
    task: FuzzTask,
    attack_type: &str,
) -> Result<Vec<FuzzResult>, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| e.to_string())?;

    let payloads = match attack_type {
        "sql_injection" => SQLI_PAYLOADS,
        "xss" => XSS_PAYLOADS,
        _ => &["test"],
    };

    let mut results = Vec::new();
    let total = payloads.len();

    for (i, payload) in payloads.iter().enumerate() {
        let f_payload = payload.to_string();
        
        // Simple parameter injection for URL-encoded params or URL path
        let target_url = if task.url.contains('?') {
            format!("{}&fuzz={}", task.url, urlencoding::encode(&f_payload))
        } else {
            format!("{}?fuzz={}", task.url, urlencoding::encode(&f_payload))
        };

        let start = std::time::Instant::now();
        let method = reqwest::Method::from_bytes(task.method.as_bytes()).unwrap_or(reqwest::Method::GET);
        
        let mut req = client.request(method, &target_url);
        for (k, v) in &task.headers {
            req = req.header(k, v);
        }

        if let Some(body) = &task.body {
             // Basic body fuzzing: if body is JSON, try to inject into first string value
             let f_body = body.replace("\"\"", &format!("\"{}\"", f_payload));
             req = req.body(f_body);
        }

        let response = match req.send().await {
            Ok(r) => r,
            Err(e) => {
                results.push(FuzzResult {
                    payload: f_payload.clone(),
                    status: 0,
                    time_ms: 0,
                    finding: None,
                });
                continue;
            }
        };

        let status = response.status().as_u16();
        let duration = start.elapsed().as_millis() as u64;
        let body_text = response.text().await.unwrap_or_default();

        let mut finding = None;

        // Detection logic
        if attack_type == "sql_injection" {
            if body_text.contains("SQL syntax") || body_text.contains("mysql_fetch") || body_text.contains("sqlite3") {
                 finding = Some(Finding {
                    id: None,
                    rule_id: "ACTIVE-SQLI".to_string(),
                    name: "Active SQL Injection Confirmed".to_string(),
                    description: format!("Target returned a database error when injected with payload: {}", f_payload),
                    severity: FindingSeverity::High,
                    match_content: f_payload.clone(),
                    notes: Some(format!("Error found in response body. Status: {}", status)),
                    is_false_positive: Some(false),
                    severity_override: None,
                });
            }
        } else if attack_type == "xss" {
             if body_text.contains(&f_payload) {
                  finding = Some(Finding {
                    id: None,
                    rule_id: "ACTIVE-XSS".to_string(),
                    name: "Reflected XSS Confirmed".to_string(),
                    description: format!("Active payload was reflected in the response body: {}", f_payload),
                    severity: FindingSeverity::High,
                    match_content: f_payload.clone(),
                    notes: Some("Payload was echoed in response without escaping.".to_string()),
                    is_false_positive: Some(false),
                    severity_override: None,
                });
             }
        }

        let res = FuzzResult {
            payload: f_payload,
            status,
            time_ms: duration,
            finding,
        };

        results.push(res.clone());
        
        // Emit progress
        let _ = app_handle.emit("fuzz-progress", (i + 1, total, res));
    }

    Ok(results)
}

#[tauri::command]
pub async fn run_active_fuzz(
    app_handle: tauri::AppHandle,
    task: FuzzTask,
    attack_type: String
) -> Result<Vec<FuzzResult>, String> {
    run_fuzz_test(app_handle, task, &attack_type).await
}
