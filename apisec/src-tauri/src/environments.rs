use serde::{Deserialize, Serialize};
use crate::db::get_db;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Environment {
    pub id: Option<i64>,
    pub name: String,
    pub base_url: String,
    pub variables: String, // JSON string of key-value pairs
    pub is_active: bool,
}

pub async fn init_environments_table() -> Result<(), String> {
    let pool = get_db();
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS environments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            base_url TEXT NOT NULL,
            variables TEXT NOT NULL DEFAULT '{}',
            is_active BOOLEAN NOT NULL DEFAULT 0
        )
        "#,
    )
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_environments() -> Result<Vec<Environment>, String> {
    let pool = get_db();
    let rows = sqlx::query_as::<_, (i64, String, String, String, bool)>(
        "SELECT id, name, base_url, variables, is_active FROM environments ORDER BY name"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|(id, name, base_url, variables, is_active)| Environment {
            id: Some(id),
            name,
            base_url,
            variables,
            is_active,
        })
        .collect())
}

#[tauri::command]
pub async fn get_active_environment() -> Result<Option<Environment>, String> {
    let pool = get_db();
    let row = sqlx::query_as::<_, (i64, String, String, String, bool)>(
        "SELECT id, name, base_url, variables, is_active FROM environments WHERE is_active = 1 LIMIT 1"
    )
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(row.map(|(id, name, base_url, variables, is_active)| Environment {
        id: Some(id),
        name,
        base_url,
        variables,
        is_active,
    }))
}

#[tauri::command]
pub async fn create_environment(name: String, base_url: String, variables: String) -> Result<i64, String> {
    let pool = get_db();
    let result = sqlx::query(
        "INSERT INTO environments (name, base_url, variables, is_active) VALUES (?, ?, ?, 0)"
    )
    .bind(&name)
    .bind(&base_url)
    .bind(&variables)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(result.last_insert_rowid())
}

#[tauri::command]
pub async fn set_active_environment(id: i64) -> Result<(), String> {
    let pool = get_db();
    
    // Deactivate all environments
    sqlx::query("UPDATE environments SET is_active = 0")
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    // Activate the selected one
    sqlx::query("UPDATE environments SET is_active = 1 WHERE id = ?")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_environment(id: i64) -> Result<(), String> {
    let pool = get_db();
    sqlx::query("DELETE FROM environments WHERE id = ?")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn update_environment(id: i64, name: String, base_url: String, variables: String) -> Result<(), String> {
    let pool = get_db();
    sqlx::query("UPDATE environments SET name = ?, base_url = ?, variables = ? WHERE id = ?")
        .bind(&name)
        .bind(&base_url)
        .bind(&variables)
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}
