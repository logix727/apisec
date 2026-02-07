use crate::db::get_db;
use sqlx::Row;

#[tauri::command]
pub async fn get_audit_log(limit: Option<i64>) -> Result<Vec<serde_json::Value>, String> {
    let pool = get_db();
    let limit_val = limit.unwrap_or(100);
    
    let rows = sqlx::query(
        "SELECT 
            a.id, a.action, a.entity_type, a.entity_id, a.details, a.timestamp,
            u.name as user_name, u.email as user_email
         FROM audit_log a
         LEFT JOIN users u ON a.user_id = u.id
         ORDER BY a.timestamp DESC
         LIMIT ?"
    )
    .bind(limit_val)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let logs: Vec<serde_json::Value> = rows.iter().map(|row| {
        serde_json::json!({
            "id": row.get::<i64, _>("id"),
            "action": row.get::<String, _>("action"),
            "entity_type": row.get::<String, _>("entity_type"),
            "entity_id": row.get::<Option<i64>, _>("entity_id"),
            "details": row.get::<Option<String>, _>("details"),
            "timestamp": row.get::<String, _>("timestamp"),
            "user_name": row.get::<Option<String>, _>("user_name"),
            "user_email": row.get::<Option<String>, _>("user_email")
        })
    }).collect();

    Ok(logs)
}

#[tauri::command]
pub async fn log_action(
    user_id: Option<i64>,
    action: String,
    entity_type: String,
    entity_id: Option<i64>,
    details: Option<String>
) -> Result<(), String> {
    let pool = get_db();
    sqlx::query(
        "INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(user_id)
    .bind(action)
    .bind(entity_type)
    .bind(entity_id)
    .bind(details)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}
