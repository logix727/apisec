use crate::analysis::{Finding, FindingSeverity};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct RulePlugin {
    pub id: String,
    pub name: String,
    pub severity: String,
    pub regex: String,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct PluginPack {
    pub name: String,
    pub author: Option<String>,
    pub version: String,
    pub rules: Vec<RulePlugin>,
}

pub fn load_plugins(app_handle: &tauri::AppHandle) -> Vec<PluginPack> {
    let mut packs = Vec::new();

    // Use app data directory or resource directory
    let plugin_dir = app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("plugins");

    if !plugin_dir.exists() {
        let _ = fs::create_dir_all(&plugin_dir);
        // Create a sample plugin
        let sample = PluginPack {
            name: "Cloud Infra Discovery".to_string(),
            author: Some("APISec Team".to_string()),
            version: "1.0.0".to_string(),
            rules: vec![RulePlugin {
                id: "PLG-S3-BUCKET".to_string(),
                name: "S3 Bucket Detected".to_string(),
                severity: "Info".to_string(),
                regex: r"(?i)[a-z0-9.-]+\.s3\.amazonaws\.com".to_string(),
                description: Some("Discovered a reference to an AWS S3 bucket.".to_string()),
            }],
        };
        let yaml = serde_yml::to_string(&sample).unwrap_or_default();
        let _ = fs::write(plugin_dir.join("cloud_infra.yaml"), yaml);
    }

    if let Ok(entries) = fs::read_dir(plugin_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("yaml") {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(pack) = serde_yml::from_str::<PluginPack>(&content) {
                        packs.push(pack);
                    }
                }
            }
        }
    }

    packs
}

pub fn scan_with_plugins(content: &str, plugins: &[PluginPack]) -> Vec<Finding> {
    let mut findings = Vec::new();

    for pack in plugins {
        for rule in &pack.rules {
            if let Ok(re) = Regex::new(&rule.regex) {
                for mat in re.find_iter(content) {
                    let severity = match rule.severity.to_lowercase().as_str() {
                        "critical" | "high" => FindingSeverity::High,
                        "medium" => FindingSeverity::Medium,
                        "low" => FindingSeverity::Low,
                        _ => FindingSeverity::Info,
                    };

                    findings.push(Finding {
                        id: None,
                        rule_id: rule.id.clone(),
                        name: rule.name.clone(),
                        description: rule
                            .description
                            .clone()
                            .unwrap_or_else(|| rule.name.clone()),
                        severity,
                        match_content: mat.as_str().to_string(),
                        notes: Some(format!("Pack: {} v{}", pack.name, pack.version)),
                        is_false_positive: Some(false),
                        severity_override: None,
                    });
                }
            }
        }
    }

    findings
}
