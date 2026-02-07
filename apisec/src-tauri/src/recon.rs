use hickory_resolver::Resolver;
use hickory_resolver::config::*;
use serde::{Deserialize, Serialize};
use std::net::ToSocketAddrs;

#[derive(Serialize, Deserialize, Debug)]
pub struct ReconResult {
    pub subdomain: String,
    pub ip: Option<String>,
    pub status: String,
}

#[tauri::command]
pub async fn enumerate_subdomains(domain: String) -> Result<Vec<ReconResult>, String> {
    let resolver = Resolver::new(ResolverConfig::default(), ResolverOpts::default())
        .map_err(|e| e.to_string())?;

    let common_prefixes = vec![
        "www", "api", "dev", "staging", "test", "auth", "admin", "mail", "vpn", "corp",
        "git", "jenkins", "docker", "k8s", "prod", "beta", "demo", "app", "mobile"
    ];

    let mut results = Vec::new();

    for prefix in common_prefixes {
        let target = format!("{}.{}", prefix, domain);
        match resolver.lookup_ip(&target).await {
            Ok(lookup) => {
                let ip = lookup.iter().next().map(|i| i.to_string());
                results.push(ReconResult {
                    subdomain: target,
                    ip,
                    status: "Active".to_string(),
                });
            }
            Err(_) => {
                // Not found, skip
            }
        }
    }

    Ok(results)
}
