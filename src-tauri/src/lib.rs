mod import_engine;
mod analysis;
mod db;
mod assets;
mod proxy;
mod audit;
mod ai;
mod recon;
mod certs;
mod active_scan;
mod drift;
mod fuzzer;
mod environments;
use crate::import_engine::Parser;
use tauri::Emitter;
use tauri_plugin_clipboard_manager::ClipboardExt;
use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use std::time::Duration;
use dashmap::DashMap;
use std::collections::HashMap;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub enum InterceptResult {
    Forward,
    Drop,
    ModifyRequest {
        method: String,
        url: String,
        headers: HashMap<String, String>,
        body: Option<String>,
    },
    ModifyResponse {
        status: u16,
        headers: HashMap<String, String>,
        body: Option<String>,
    }
}

pub struct ClipboardMonitorState {
    pub running: AtomicBool,
}

pub struct ProxyState {
    pub running: AtomicBool,
    pub port: u16,
    pub capture_body: AtomicBool,
    pub intercept_requests: AtomicBool,
    pub intercept_responses: AtomicBool,
    pub pending_requests: DashMap<String, tokio::sync::oneshot::Sender<InterceptResult>>,
    pub pending_responses: DashMap<String, tokio::sync::oneshot::Sender<InterceptResult>>,
    pub cert_manager: Arc<certs::CertManager>,
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
async fn parse_content(app: tauri::AppHandle, content: String, source_type: String) -> Result<import_engine::ImportResult, String> {
    let custom_rules = db::get_custom_rules().await?;
    let plugins = crate::plugins::load_plugins(&app);
    if source_type == "text" {
        Ok(Parser::parse_text(&content, &custom_rules, &plugins))
    } else if source_type == "excel" {
       Parser::parse_excel(&content, &custom_rules, &plugins).map_err(|e| e.to_string())
    } else if source_type == "har" {
        Parser::parse_har(&content, &custom_rules, &plugins).map_err(|e| e.to_string())
    } else if source_type == "burp" {
        Parser::parse_burp_xml(&content, &custom_rules, &plugins).map_err(|e| e.to_string())
    } else if source_type == "postman" {
        Parser::parse_postman(&content, &custom_rules, &plugins).map_err(|e| e.to_string())
    } else {
        Err("Unsupported source type".to_string())
    }
}

#[tauri::command]
async fn parse_binary_content(app: tauri::AppHandle, content: Vec<u8>, source_type: String) -> Result<import_engine::ImportResult, String> {
    let custom_rules = db::get_custom_rules().await?;
    let plugins = crate::plugins::load_plugins(&app);
    if source_type == "excel" {
       Parser::parse_excel_bytes(&content, &custom_rules, &plugins).map_err(|e| e.to_string())
    } else {
        Err("Unsupported source type for binary parsing".to_string())
    }
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn set_clipboard_monitor(state: tauri::State<'_, Arc<ClipboardMonitorState>>, enable: bool) {
    state.running.store(enable, Ordering::Relaxed);
}

#[tauri::command]
async fn start_proxy_server(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<ProxyState>>
) -> Result<(), String> {
    if state.running.load(Ordering::Relaxed) {
        return Err("Proxy is already running".to_string());
    }
    state.running.store(true, Ordering::Relaxed);
    let running_flag = Arc::clone(state.inner());
    let port = state.port;
    
    tauri::async_runtime::spawn(async move {
        proxy::start_proxy(app, port, running_flag).await;
    });
    
    Ok(())
}

#[tauri::command]
fn stop_proxy_server(state: tauri::State<'_, Arc<ProxyState>>) {
    state.running.store(false, Ordering::Relaxed);
}

#[tauri::command]
fn set_proxy_interception_config(
    state: tauri::State<'_, Arc<ProxyState>>, 
    capture_body: bool, 
    intercept_requests: bool, 
    intercept_responses: bool
) {
    state.capture_body.store(capture_body, Ordering::Relaxed);
    state.intercept_requests.store(intercept_requests, Ordering::Relaxed);
    state.intercept_responses.store(intercept_responses, Ordering::Relaxed);
}

#[tauri::command]
async fn resolve_interception(
    state: tauri::State<'_, Arc<ProxyState>>,
    id: String,
    action: InterceptResult
) -> Result<(), String> {
    if let Some((_, sender)) = state.pending_requests.remove(&id) {
        let _ = sender.send(action);
        Ok(())
    } else if let Some((_, sender)) = state.pending_responses.remove(&id) {
        let _ = sender.send(action);
        Ok(())
    } else {
        Err("Pending interception (request or response) not found".to_string())
    }
}

#[tauri::command]
async fn run_rate_limit_test(
    app: tauri::AppHandle,
    url: String,
    rps: usize,
    duration: u64
) -> Result<active_scan::RateLimitResult, String> {
    active_scan::test_rate_limit(app, url, rps, duration).await
}

#[tauri::command]
async fn export_as_curl(asset_id: i64) -> Result<String, String> {
    use crate::db::get_db;
    let pool = get_db();
    
    let asset = sqlx::query_as::<_, (String, Option<String>, Option<String>, Option<String>)>(
        "SELECT url, method, req_headers, req_body FROM assets WHERE id = ?"
    )
    .bind(asset_id)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let (url, method, headers, body) = asset;
    let method = method.unwrap_or("GET".to_string());
    
    let mut curl = format!("curl -X {} '{}'", method, url);
    
    if let Some(h) = headers {
        if let Ok(headers_map) = serde_json::from_str::<std::collections::HashMap<String, String>>(&h) {
            for (k, v) in headers_map {
                curl.push_str(&format!(" \\\n  -H '{}: {}'", k, v));
            }
        }
    }
    
    if let Some(b) = body {
        curl.push_str(&format!(" \\\n  -d '{}'", b.replace("'", "'\\''")));
    }
    
    Ok(curl)
}

#[tauri::command]
async fn export_as_postman_link(asset_id: i64) -> Result<String, String> {
    use crate::db::get_db;
    let pool = get_db();
    
    let asset = sqlx::query_as::<_, (String, Option<String>)>(
        "SELECT url, method FROM assets WHERE id = ?"
    )
    .bind(asset_id)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let (url, method) = asset;
    let method = method.unwrap_or("GET".to_string());
    
    // Postman deep link format
    let encoded_url = urlencoding::encode(&url);
    Ok(format!("https://www.postman.com/api-request?method={}&url={}", method, encoded_url))
}

#[tauri::command]
fn get_root_ca(state: tauri::State<'_, Arc<ProxyState>>) -> String {
    state.cert_manager.get_ca_pem()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let monitor_state = Arc::new(ClipboardMonitorState {
        running: AtomicBool::new(false), // Start paused by default
    });

    let proxy_state = Arc::new(ProxyState {
        running: AtomicBool::new(false),
        port: 8080, // Default proxy port
        capture_body: AtomicBool::new(false),
        intercept_requests: AtomicBool::new(false),
        intercept_responses: AtomicBool::new(false),
        pending_requests: DashMap::new(),
        pending_responses: DashMap::new(),
        cert_manager: Arc::new(certs::CertManager::new()),
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(monitor_state.clone())
        .manage(proxy_state.clone())
        .setup(move |app| {
            let handle = app.handle().clone();
            
            // Initialize Database
            tauri::async_runtime::block_on(async {
                db::init_db(&handle, "Main Workspace").await.unwrap();
                environments::init_environments_table().await.unwrap();
            });

            let state = monitor_state.clone();
            
            tauri::async_runtime::spawn(async move {
                let mut last_content = String::new();
                
                loop {
                    tokio::time::sleep(Duration::from_secs(2)).await;
                    
                    if state.running.load(Ordering::Relaxed) {
                        if let Ok(content) = handle.clipboard().read_text() {
                           if content != last_content && !content.trim().is_empty() {
                               last_content = content.clone();
                               // Emit event to frontend
                               let _ = handle.emit("clipboard-update", content);
                           }
                        }
                    }
                }
            });
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet, 
            parse_content, 
            parse_binary_content, 
            set_clipboard_monitor,
            assets::add_asset,
            assets::get_assets,
            assets::batch_add_assets,
            assets::batch_import_full,
            assets::get_findings,
            assets::update_finding_annotation,
            assets::global_search,
            assets::delete_asset,
            assets::clear_inventory,
            assets::get_all_findings_full,
            db::switch_workspace,
            db::get_current_workspace,
            db::list_workspaces,
            db::add_asset_tag,
            db::remove_asset_tag,
            db::get_asset_tags,
            db::get_custom_rules,
            db::add_custom_rule,
            db::delete_custom_rule,
            assets::tamper_request,
            db::get_webhook,
            db::set_webhook,
            db::send_notification,
            db::add_api_spec,
            db::get_api_specs,
            db::delete_api_spec,
            fuzzer::run_active_fuzz,
            start_proxy_server,
            stop_proxy_server,
            audit::get_audit_log,
            audit::log_action,
            ai::ai_triage_finding,
            ai::check_llm_availability,
            ai::get_available_models,
            recon::enumerate_subdomains,
            set_proxy_interception_config,
            resolve_interception,
            get_root_ca,
            run_rate_limit_test,
            export_as_curl,
            export_as_postman_link,
            environments::get_environments,
            environments::get_active_environment,
            environments::create_environment,
            environments::set_active_environment,
            environments::delete_environment,
            environments::update_environment
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
