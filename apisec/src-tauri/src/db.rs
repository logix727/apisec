use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite, migrate::MigrateDatabase, Row};
use std::fs;
use tauri::{AppHandle, Manager};
use std::sync::{RwLock, OnceLock};

static DB_POOL: OnceLock<RwLock<Option<Pool<Sqlite>>>> = OnceLock::new();
static CURRENT_WORKSPACE: OnceLock<RwLock<String>> = OnceLock::new();

fn get_pool_lock() -> &'static RwLock<Option<Pool<Sqlite>>> {
    DB_POOL.get_or_init(|| RwLock::new(None))
}

fn get_workspace_lock() -> &'static RwLock<String> {
    CURRENT_WORKSPACE.get_or_init(|| RwLock::new(String::new()))
}

pub async fn init_db(app_handle: &AppHandle, workspace_name: &str) -> Result<(), sqlx::Error> {
    let app_dir = app_handle.path().app_data_dir().unwrap();
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir).unwrap();
    }
    
    let safe_name = workspace_name.replace(|c: char| !c.is_alphanumeric(), "_");
    let db_path = app_dir.join(format!("{}.db", safe_name));
    let db_url = format!("sqlite://{}", db_path.to_string_lossy());

    if !Sqlite::database_exists(&db_url).await.unwrap_or(false) {
        Sqlite::create_database(&db_url).await?;
    }

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await?;

    // Create tables
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS assets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT NOT NULL,
            method TEXT,
            source TEXT,
            last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
            req_body TEXT,
            res_body TEXT
        );",
    )
    .execute(&pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS findings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            asset_id INTEGER,
            rule_id TEXT,
            name TEXT,
            description TEXT,
            severity TEXT,
            match_content TEXT,
            notes TEXT,
            is_false_positive INTEGER DEFAULT 0,
            severity_override TEXT,
            FOREIGN KEY(asset_id) REFERENCES assets(id)
        );",
    )
    .execute(&pool)
    .await?;

    // Tags table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            color TEXT
        );",
    )
    .execute(&pool)
    .await?;

    // Asset Tags mapping
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS asset_tags (
            asset_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (asset_id, tag_id),
            FOREIGN KEY (asset_id) REFERENCES assets(id),
            FOREIGN KEY (tag_id) REFERENCES tags(id)
        );",
    )
    .execute(&pool)
    .await?;

    // Manual migration for existing DBs
    let _ = sqlx::query("ALTER TABLE findings ADD COLUMN notes TEXT").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE findings ADD COLUMN is_false_positive INTEGER DEFAULT 0").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE findings ADD COLUMN severity_override TEXT").execute(&pool).await;

    // Folders table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            parent_id INTEGER
        );",
    )
    .execute(&pool)
    .await?;

    // Custom Rules Table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS custom_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            regex TEXT NOT NULL,
            severity TEXT NOT NULL,
            rule_id TEXT NOT NULL UNIQUE
        );",
    )
    .execute(&pool)
    .await?;

    // App Settings Table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );",
    )
    .execute(&pool)
    .await?;

    // OpenAPI Specs Table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS specs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            content TEXT NOT NULL,
            version TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );",
    )
    .execute(&pool)
    .await?;

    // Users Table (for multi-user support)
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'Analyst',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME
        );",
    )
    .execute(&pool)
    .await?;

    // Audit Log Table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id INTEGER,
            details TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );",
    )
    .execute(&pool)
    .await?;

    // Asset History table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS asset_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            asset_id INTEGER NOT NULL,
            status_code INTEGER,
            res_body TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (asset_id) REFERENCES assets(id)
        );",
    )
    .execute(&pool)
    .await?;

    // Finding Assignments Table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS finding_assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            finding_id INTEGER NOT NULL,
            assigned_to INTEGER NOT NULL,
            assigned_by INTEGER NOT NULL,
            assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'Open',
            FOREIGN KEY (finding_id) REFERENCES findings(id),
            FOREIGN KEY (assigned_to) REFERENCES users(id),
            FOREIGN KEY (assigned_by) REFERENCES users(id)
        );",
    )
    .execute(&pool)
    .await?;

    // Update global state
    {
        let mut pool_guard = get_pool_lock().write().unwrap();
        *pool_guard = Some(pool);
    }
    {
        let mut ws_guard = get_workspace_lock().write().unwrap();
        *ws_guard = workspace_name.to_string();
    }
    
    println!("Database initialized: {}", workspace_name);
    Ok(())
}

pub fn get_db() -> Pool<Sqlite> {
    get_pool_lock().read().unwrap().clone().expect("Database not initialized")
}

#[tauri::command]
pub async fn switch_workspace(app_handle: AppHandle, name: String) -> Result<(), String> {
    init_db(&app_handle, &name).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_current_workspace() -> String {
    get_workspace_lock().read().unwrap().clone()
}

#[tauri::command]
pub fn list_workspaces(app_handle: AppHandle) -> Vec<String> {
    let app_dir = app_handle.path().app_data_dir().unwrap();
    if !app_dir.exists() { return vec![]; }
    
    let mut workspaces = Vec::new();
    if let Ok(entries) = fs::read_dir(app_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("db") {
                if let Some(name) = path.file_stem().and_then(|s| s.to_str()) {
                    workspaces.push(name.to_string());
                }
            }
        }
    }
    workspaces
}

#[tauri::command]
pub async fn add_asset_tag(asset_id: i64, tag_name: String) -> Result<(), String> {
    let pool = get_db();
    
    // Ensure tag exists
    let _ = sqlx::query("INSERT OR IGNORE INTO tags (name, color) VALUES (?, ?)")
        .bind(&tag_name)
        .bind("#3b82f6") // Default blue
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
        
    let tag_id: i64 = sqlx::query("SELECT id FROM tags WHERE name = ?")
        .bind(&tag_name)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?
        .get(0);
        
    // Associate with asset
    let _ = sqlx::query("INSERT OR IGNORE INTO asset_tags (asset_id, tag_id) VALUES (?, ?)")
        .bind(asset_id)
        .bind(tag_id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
        
    Ok(())
}

#[tauri::command]
pub async fn remove_asset_tag(asset_id: i64, tag_name: String) -> Result<(), String> {
    let pool = get_db();
    
    let tag_id: Option<i64> = sqlx::query("SELECT id FROM tags WHERE name = ?")
        .bind(&tag_name)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?
        .map(|r| r.get(0));
        
    if let Some(tid) = tag_id {
        let _ = sqlx::query("DELETE FROM asset_tags WHERE asset_id = ? AND tag_id = ?")
            .bind(asset_id)
            .bind(tid)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

#[tauri::command]
pub async fn get_asset_tags(asset_id: i64) -> Result<Vec<String>, String> {
    let pool = get_db();
    let rows = sqlx::query("SELECT t.name FROM tags t JOIN asset_tags at ON t.id = at.tag_id WHERE at.asset_id = ?")
        .bind(asset_id)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;
        
    let tags = rows.into_iter().map(|r| r.get(0)).collect();
    Ok(tags)
}

#[derive(serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct CustomRule {
    pub id: Option<i64>,
    pub name: String,
    pub description: String,
    pub regex: String,
    pub severity: String,
    pub rule_id: String,
}

#[tauri::command]
pub async fn get_custom_rules() -> Result<Vec<CustomRule>, String> {
    let pool = get_db();
    let rules = sqlx::query_as::<_, CustomRule>("SELECT * FROM custom_rules")
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(rules)
}

#[tauri::command]
pub async fn add_custom_rule(rule: CustomRule) -> Result<i64, String> {
    let pool = get_db();
    let res = sqlx::query("INSERT INTO custom_rules (name, description, regex, severity, rule_id) VALUES (?, ?, ?, ?, ?)")
        .bind(rule.name)
        .bind(rule.description)
        .bind(rule.regex)
        .bind(rule.severity)
        .bind(rule.rule_id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(res.last_insert_rowid())
}

#[tauri::command]
pub async fn delete_custom_rule(id: i64) -> Result<(), String> {
    let pool = get_db();
    sqlx::query("DELETE FROM custom_rules WHERE id = ?")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct ApiSpec {
    pub id: Option<i64>,
    pub name: String,
    pub content: String,
    pub version: Option<String>,
}

#[tauri::command]
pub async fn add_api_spec(name: String, content: String, version: Option<String>) -> Result<i64, String> {
    let pool = get_db();
    let res = sqlx::query("INSERT INTO specs (name, content, version) VALUES (?, ?, ?)")
        .bind(name)
        .bind(content)
        .bind(version)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(res.last_insert_rowid())
}

#[tauri::command]
pub async fn get_api_specs() -> Result<Vec<ApiSpec>, String> {
    let pool = get_db();
    let specs = sqlx::query_as::<_, ApiSpec>("SELECT id, name, content, version FROM specs")
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(specs)
}

#[tauri::command]
pub async fn delete_api_spec(id: i64) -> Result<(), String> {
    let pool = get_db();
    sqlx::query("DELETE FROM specs WHERE id = ?")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_webhook() -> Result<Option<String>, String> {
    let pool = get_db();
    let row: Option<(String,)> = sqlx::query_as("SELECT value FROM app_settings WHERE key = 'webhook'")
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(row.map(|r| r.0))
}

#[tauri::command]
pub async fn set_webhook(url: String) -> Result<(), String> {
    let pool = get_db();
    sqlx::query("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('webhook', ?)")
        .bind(url)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
pub async fn send_notification(title: String, message: String) -> Result<(), String> {
    let pool = get_db();
    let row: Option<(String,)> = sqlx::query_as("SELECT value FROM app_settings WHERE key = 'webhook'")
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;
    
    let webhook_url = match row {
        Some(r) => r.0,
        None => return Err("Webhook URL not configured in settings".to_string()),
    };

    let client = reqwest::Client::new();
    let payload = serde_json::json!({
        "text": format!("*{}*\n{}", title, message)
    });

    client.post(webhook_url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}
