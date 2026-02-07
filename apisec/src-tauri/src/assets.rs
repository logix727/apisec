use serde::{Deserialize, Serialize};
use crate::db::get_db;
use std::time::Duration;
use sqlx::{Row, FromRow};
use crate::analysis::Finding;
use crate::import_engine::ImportEntry;

#[derive(Serialize, Deserialize, Debug, FromRow)]
pub struct Asset {
    pub id: i64,
    pub url: String,
    pub method: Option<String>,
    pub status_code: Option<i64>, 
    pub source: String,
    pub folder_id: Option<i64>,
    pub last_seen: String, 
    pub req_body: Option<String>,
    pub res_body: Option<String>,
    pub notes: Option<String>,
    pub findings_count: Option<i64>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct CreateAssetRequest {
    pub url: String,
    pub source: String,
    pub method: Option<String>,
    pub status_code: Option<i64>,
    pub req_body: Option<String>,
    pub res_body: Option<String>,
    pub findings: Vec<Finding>,
}

#[tauri::command]
pub async fn add_asset(mut asset: CreateAssetRequest) -> Result<i64, String> {
    let pool = get_db();

    // Drift Detection
    let specs = crate::db::get_api_specs().await.unwrap_or_default();
    if !specs.is_empty() {
        let drift_findings = crate::drift::detect_drift(
            &asset.url, 
            asset.method.as_deref().unwrap_or("GET"),
            asset.res_body.as_deref(),
            specs
        );
        asset.findings.extend(drift_findings);
    }
    
    // Check if exists
    let existing_id: Option<i64> = sqlx::query("SELECT id FROM assets WHERE url = ?")
        .bind(&asset.url)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?
        .map(|row| row.get(0));

    let asset_id = if let Some(id) = existing_id {
        // Check if content changed
        let existing_res: (Option<i64>, Option<String>) = sqlx::query_as("SELECT status_code, res_body FROM assets WHERE id = ?")
            .bind(id)
            .fetch_one(&pool)
            .await
            .map_err(|e| e.to_string())?;

        let changed = asset.status_code != existing_res.0 || asset.res_body != existing_res.1;

        if changed {
            // Save current to history before updating (if not empty)
            if existing_res.1.is_some() {
                let _ = sqlx::query("INSERT INTO asset_history (asset_id, status_code, res_body) VALUES (?, ?, ?)")
                    .bind(id)
                    .bind(existing_res.0)
                    .bind(existing_res.1)
                    .execute(&pool)
                    .await;
            }

            // Update asset
            let _ = sqlx::query("UPDATE assets SET status_code = ?, res_body = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?")
                .bind(asset.status_code)
                .bind(&asset.res_body)
                .bind(id)
                .execute(&pool)
                .await
                .map_err(|e| e.to_string())?;
        } else {
             let _ = sqlx::query("UPDATE assets SET last_seen = CURRENT_TIMESTAMP WHERE id = ?")
                .bind(id)
                .execute(&pool)
                .await
                .map_err(|e| e.to_string())?;
        }
        id
    } else {
        // Insert new
        let res = sqlx::query("INSERT INTO assets (url, method, source, status_code, req_body, res_body) VALUES (?, ?, ?, ?, ?, ?)")
            .bind(&asset.url)
            .bind(&asset.method)
            .bind(&asset.source)
            .bind(asset.status_code)
            .bind(&asset.req_body)
            .bind(&asset.res_body)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;
        res.last_insert_rowid()
    };

    // Insert Findings
    for f in asset.findings {
        let _ = sqlx::query("INSERT INTO findings (asset_id, rule_id, name, severity, description, match_content, notes, is_false_positive, severity_override) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(asset_id)
            .bind(f.rule_id)
            .bind(f.name)
            .bind(f.severity)
            .bind(f.description)
            .bind(f.match_content)
            .bind(f.notes)
            .bind(f.is_false_positive.unwrap_or(false))
            .bind(f.severity_override)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;
    }

    Ok(asset_id)
}

#[tauri::command]
pub async fn get_assets() -> Result<Vec<Asset>, String> {
    let pool = get_db();
    let assets = sqlx::query_as::<_, Asset>(
        "SELECT a.id, a.url, a.method, a.status_code, a.source, a.folder_id, a.last_seen, a.req_body, a.res_body, a.notes, COUNT(f.id) as findings_count \
         FROM assets a \
         LEFT JOIN findings f ON a.id = f.asset_id \
         GROUP BY a.id \
         ORDER BY last_seen DESC"
    )
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(assets)
}

#[derive(Serialize, Deserialize, Debug)]
pub struct BatchImportRequest {
    pub urls: Vec<String>,
    pub source: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct BatchImportResult {
    pub added: i32,
    pub skipped: i32,
}

#[tauri::command]
pub async fn batch_add_assets(request: BatchImportRequest) -> Result<BatchImportResult, String> {
    let pool = get_db();
    let mut added = 0;
    let mut skipped = 0;

    for url in request.urls {
        // Check if exists
        let exists: Option<i64> = sqlx::query("SELECT id FROM assets WHERE url = ?")
            .bind(&url)
            .fetch_optional(&pool)
            .await
            .map_err(|e| e.to_string())?
            .map(|row| row.get(0));

        if exists.is_some() {
            // Update last_seen
            let _ = sqlx::query("UPDATE assets SET last_seen = CURRENT_TIMESTAMP WHERE url = ?")
                .bind(&url)
                .execute(&pool)
                .await;
            skipped += 1;
        } else {
            // Insert new
            let _ = sqlx::query("INSERT INTO assets (url, method, source) VALUES (?, 'GET', ?)")
                .bind(&url)
                .bind(&request.source)
                .execute(&pool)
                .await
                .map_err(|e| e.to_string())?;
            added += 1;
        }
    }

    Ok(BatchImportResult { added, skipped })
}
#[derive(Serialize, Deserialize, Debug)]
pub struct SearchResult {
    pub assets: Vec<Asset>,
    pub findings: Vec<Finding>,
}

#[tauri::command]
pub async fn global_search(query: String) -> Result<SearchResult, String> {
    let pool = get_db();
    let q = format!("%{}%", query);
    
    let assets = sqlx::query_as::<_, Asset>(
        "SELECT a.id, a.url, a.method, a.status_code, a.source, a.folder_id, a.last_seen, a.req_body, a.res_body, a.notes, 0 as findings_count \
         FROM assets a \
         WHERE a.url LIKE ? OR a.req_body LIKE ? OR a.res_body LIKE ? OR a.notes LIKE ?"
    )
    .bind(&q)
    .bind(&q)
    .bind(&q)
    .bind(&q)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let findings = sqlx::query_as::<_, Finding>(
        "SELECT id, rule_id, name, description, severity, match_content, notes, is_false_positive, severity_override FROM findings \
         WHERE name LIKE ? OR description LIKE ? OR match_content LIKE ?"
    )
    .bind(&q)
    .bind(&q)
    .bind(&q)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(SearchResult { assets, findings })
}

#[tauri::command]
pub async fn batch_import_full(entries: Vec<ImportEntry>, source: String) -> Result<BatchImportResult, String> {
    let mut added = 0;
    let mut skipped = 0;

    for entry in entries {
        let asset = CreateAssetRequest {
            url: entry.url,
            source: source.clone(),
            method: Some(entry.method),
            status_code: entry.status_code,
            req_body: entry.req_body,
            res_body: entry.res_body,
            findings: entry.findings,
        };
        
        match add_asset(asset).await {
            Ok(_) => added += 1,
            Err(_) => skipped += 1,
        }
    }

    Ok(BatchImportResult { added, skipped })
}

#[derive(Serialize, Deserialize, Debug, FromRow)]
pub struct HistoryItem {
    pub id: i64,
    pub status_code: Option<i64>,
    pub res_body: Option<String>,
    pub timestamp: String,
}

#[tauri::command]
pub async fn get_asset_history(asset_id: i64) -> Result<Vec<HistoryItem>, String> {
    let pool = get_db();
    let history = sqlx::query_as::<_, HistoryItem>(
        "SELECT id, status_code, res_body, timestamp FROM asset_history WHERE asset_id = ? ORDER BY timestamp DESC"
    )
    .bind(asset_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(history)
}

#[tauri::command]
pub async fn get_findings(asset_id: i64) -> Result<Vec<Finding>, String> {
    let pool = get_db();
    let findings = sqlx::query_as::<_, Finding>(
        "SELECT id, rule_id, name, description, severity, match_content, notes, is_false_positive, severity_override FROM findings WHERE asset_id = ?"
    )
    .bind(asset_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(findings)
}

#[derive(Serialize, Deserialize, Debug)]
pub struct UpdateFindingRequest {
    pub id: i64,
    pub notes: Option<String>,
    pub is_false_positive: Option<bool>,
    pub severity_override: Option<crate::analysis::FindingSeverity>,
}

#[tauri::command]
pub async fn update_finding_annotation(request: UpdateFindingRequest) -> Result<(), String> {
    let pool = get_db();
    sqlx::query("UPDATE findings SET notes = ?, is_false_positive = ?, severity_override = ? WHERE id = ?")
        .bind(request.notes)
        .bind(request.is_false_positive.unwrap_or(false))
        .bind(request.severity_override)
        .bind(request.id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(())
}
#[derive(serde::Deserialize)]
pub struct ReplayRequest {
    pub url: String,
    pub method: String,
    pub headers: std::collections::HashMap<String, String>,
    pub body: Option<String>,
}

#[derive(serde::Serialize)]
pub struct ReplayResponse {
    pub status: u16,
    pub headers: std::collections::HashMap<String, String>,
    pub body: String,
    pub time_ms: u64,
}

#[tauri::command]
pub async fn tamper_request(req: ReplayRequest) -> Result<ReplayResponse, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| e.to_string())?;

    let method = reqwest::Method::from_bytes(req.method.as_bytes()).map_err(|e| e.to_string())?;
    
    let mut request_builder = client.request(method, &req.url);
    
    for (key, value) in req.headers {
        request_builder = request_builder.header(key, value);
    }
    
    if let Some(body) = req.body {
        request_builder = request_builder.body(body);
    }

    let start = std::time::Instant::now();
    let response = request_builder.send().await.map_err(|e| e.to_string())?;
    let duration = start.elapsed().as_millis() as u64;

    let status = response.status().as_u16();
    let mut headers = std::collections::HashMap::new();
    for (name, value) in response.headers() {
        headers.insert(
            name.to_string(),
            value.to_str().unwrap_or("").to_string()
        );
    }
    
    let body = response.text().await.map_err(|e| e.to_string())?;

    Ok(ReplayResponse {
        status,
        headers,
        body,
        time_ms: duration,
    })
}

#[tauri::command]
pub async fn delete_asset(id: i64) -> Result<(), String> {
    let pool = get_db();
    
    // Findings are deleted automatically if ON DELETE CASCADE is set, 
    // but we'll do it manually just in case.
    let _ = sqlx::query("DELETE FROM findings WHERE asset_id = ?")
        .bind(id)
        .execute(&pool)
        .await;

    sqlx::query("DELETE FROM assets WHERE id = ?")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[derive(Serialize, Deserialize, Debug, FromRow)]
pub struct FullFinding {
    pub id: i64,
    pub asset_id: i64,
    pub url: String,
    pub rule_id: String,
    pub name: String,
    pub description: String,
    pub severity: String,
    pub match_content: String,
    pub notes: Option<String>,
    pub is_false_positive: bool,
    pub severity_override: Option<String>,
}

#[tauri::command]
pub async fn get_all_findings_full() -> Result<Vec<FullFinding>, String> {
    let pool = get_db();
    let findings = sqlx::query_as::<_, FullFinding>(
        "SELECT f.id, f.asset_id, a.url, f.rule_id, f.name, f.description, f.severity, f.match_content, f.notes, f.is_false_positive, f.severity_override \
         FROM findings f \
         JOIN assets a ON f.asset_id = a.id"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(findings)
}

#[tauri::command]
pub async fn clear_inventory() -> Result<(), String> {
    let pool = get_db();
    
    let _ = sqlx::query("DELETE FROM findings")
        .execute(&pool)
        .await;

    sqlx::query("DELETE FROM assets")
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}
