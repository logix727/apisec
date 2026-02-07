use std::sync::Arc;
use tokio::time::{Duration, Instant};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::Emitter;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RateLimitResult {
    pub url: String,
    pub total_requests: usize,
    pub success_count: usize,
    pub rate_limited_count: usize,
    pub avg_latency_ms: u64,
    pub is_vulnerable: bool,
}

pub async fn test_rate_limit(
    app_handle: tauri::AppHandle,
    url: String,
    target_rps: usize,
    duration_secs: u64
) -> Result<RateLimitResult, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(5))
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| e.to_string())?;

    let mut success_count = 0;
    let mut rate_limited_count = 0;
    let mut total_latency = 0;
    let start_time = Instant::now();
    let total_to_send = target_rps * duration_secs as usize;

    for i in 0..total_to_send {
        let req_start = Instant::now();
        let res = client.get(&url).send().await;
        
        match res {
            Ok(resp) => {
                if resp.status() == 429 {
                    rate_limited_count += 1;
                } else if resp.status().is_success() {
                    success_count += 1;
                }
                total_latency += req_start.elapsed().as_millis() as u64;
            }
            Err(_) => {}
        }

        // Progress update
        let _ = app_handle.emit("rate-limit-progress", json!({
            "current": i + 1,
            "total": total_to_send
        }));

        // Simple throttle to hit Target RPS
        let elapsed = start_time.elapsed().as_secs_f64();
        let expected = (i + 1) as f64 / target_rps as f64;
        if expected > elapsed {
            tokio::time::sleep(Duration::from_secs_f128((expected - elapsed) as f128)).await;
        }
    }

    let avg_latency = if total_to_send > 0 { total_latency / total_to_send as u64 } else { 0 };
    
    Ok(RateLimitResult {
        url,
        total_requests: total_to_send,
        success_count,
        rate_limited_count,
        avg_latency_ms: avg_latency,
        is_vulnerable: rate_limited_count == 0 && success_count > 10,
    })
}

use serde_json::json;
