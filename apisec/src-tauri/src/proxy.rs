use std::sync::{Arc, atomic::{Ordering}};
use std::net::SocketAddr;
use hyper::{Body, Request, Response, Server, Client, Method, Uri};
use hyper::service::{make_service_fn, service_fn};
use hyper::upgrade::Upgraded;
use crate::{assets, analysis, db};
use tauri::AppHandle;
use tauri::Emitter;
use tokio::net::TcpStream;
use std::time::Duration;
use crate::{ProxyState, InterceptResult};
use hyper::body::to_bytes;
use std::collections::HashMap;
use serde_json::json;
use tokio_rustls::TlsAcceptor;
use hyper::server::conn::Http;

pub async fn start_proxy(app_handle: AppHandle, port: u16, state: Arc<ProxyState>) {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    
    let make_svc = make_service_fn(move |_conn| {
        let handle = app_handle.clone();
        let state_clone = state.clone();
        async move {
            Ok::<_, hyper::Error>(service_fn(move |req| {
                handle_request(handle.clone(), req, state_clone.clone(), false)
            }))
        }
    });

    let server = Server::bind(&addr).serve(make_svc);
    
    println!("Proxy listening on http://{}", addr);

    let graceful = server.with_graceful_shutdown(async move {
        while state.running.load(Ordering::Relaxed) {
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
        println!("Proxy stopping...");
    });

    if let Err(e) = graceful.await {
        eprintln!("Proxy server error: {}", e);
    }
}

async fn handle_request(
    app_handle: AppHandle, 
    mut req: Request<Body>, 
    state: Arc<ProxyState>,
    is_mitm: bool
) -> Result<Response<Body>, hyper::Error> {
    if req.method() == Method::CONNECT {
        return handle_connect(app_handle, req, state);
    }

    // Force HTTPS scheme if it's MITM but missing scheme in URI
    if is_mitm && req.uri().scheme().is_none() {
        if let Some(host) = req.headers().get("host").and_then(|h| h.to_str().ok()) {
            let mut parts = req.uri().clone().into_parts();
            parts.scheme = Some("https".parse().unwrap());
            parts.authority = Some(host.parse().unwrap());
            *req.uri_mut() = Uri::from_parts(parts).unwrap();
        }
    }

    let capture_body = state.capture_body.load(Ordering::Relaxed);
    let mut req_body_str = None;

    if capture_body || state.intercept_requests.load(Ordering::Relaxed) {
        let (parts, body) = req.into_parts();
        if let Ok(bytes) = to_bytes(body).await {
            let body_str = String::from_utf8(bytes.to_vec()).ok();
            
            if state.intercept_requests.load(Ordering::Relaxed) {
                let id = uuid::Uuid::new_v4().to_string();
                let (tx, rx) = tokio::sync::oneshot::channel();
                state.pending_requests.insert(id.clone(), tx);
                
                let mut headers = HashMap::new();
                for (name, value) in parts.headers.iter() {
                    headers.insert(name.to_string(), value.to_str().unwrap_or("").to_string());
                }
                
                let _ = app_handle.emit("proxy-intercept-request", json!({
                    "id": id,
                    "method": parts.method.to_string(),
                    "url": parts.uri.to_string(),
                    "headers": headers,
                    "body": body_str.clone()
                }));
                
                match rx.await {
                    Ok(InterceptResult::Forward) => {
                        req = Request::from_parts(parts, Body::from(bytes));
                    },
                    Ok(InterceptResult::Drop) => {
                        return Ok(Response::builder()
                            .status(403)
                            .body(Body::from("Request dropped by APISec Interceptor"))
                            .unwrap());
                    },
                    Ok(InterceptResult::ModifyRequest { method, url, headers: new_headers, body: new_body }) => {
                        let mut new_parts = parts;
                        if let Ok(m) = Method::from_bytes(method.as_bytes()) {
                            new_parts.method = m;
                        }
                        if let Ok(u) = url.parse() {
                            new_parts.uri = u;
                        }
                        new_parts.headers.clear();
                        for (k, v) in new_headers {
                            if let (Ok(name), Ok(val)) = (
                                hyper::header::HeaderName::from_bytes(k.as_bytes()),
                                hyper::header::HeaderValue::from_bytes(v.as_bytes())
                            ) {
                                new_parts.headers.insert(name, val);
                            }
                        }
                        req = Request::from_parts(new_parts, Body::from(new_body.unwrap_or_default()));
                    },
                    _ => {
                        req = Request::from_parts(parts, Body::from(bytes));
                    }
                }
            } else {
                req_body_str = body_str;
                req = Request::from_parts(parts, Body::from(bytes));
            }
        } else {
            req = Request::from_parts(parts, Body::empty());
        }
    }

    // Detect WebSocket upgrade
    let is_websocket = req.headers().get("upgrade").and_then(|v| v.to_str().ok()) == Some("websocket");

    let client = Client::new();
    
    // Capture metadata for Apisec
    let url = req.uri().to_string();
    let method = req.method().to_string();
    
    // Forward the request
    let mut response = client.request(req).await?;

    if state.intercept_responses.load(Ordering::Relaxed) && !is_websocket {
        let (res_parts, res_body) = response.into_parts();
        if let Ok(bytes) = to_bytes(res_body).await {
            let body_str = String::from_utf8(bytes.to_vec()).ok();
            
            let id = uuid::Uuid::new_v4().to_string();
            let (tx, rx) = tokio::sync::oneshot::channel();
            state.pending_responses.insert(id.clone(), tx);
            
            let mut headers = HashMap::new();
            for (name, value) in res_parts.headers.iter() {
                headers.insert(name.to_string(), value.to_str().unwrap_or("").to_string());
            }
            
            let _ = app_handle.emit("proxy-intercept-response", serde_json::json!({
                "id": id,
                "status": res_parts.status.as_u16(),
                "method": method,
                "url": url,
                "headers": headers,
                "body": body_str.clone()
            }));

            match rx.await {
                Ok(InterceptResult::ModifyResponse { status, headers: new_headers, body: new_body }) => {
                    let mut new_parts = res_parts;
                    if let Ok(s) = hyper::StatusCode::from_u16(status) {
                        new_parts.status = s;
                    }
                    new_parts.headers.clear();
                    for (k, v) in new_headers {
                        if let (Ok(name), Ok(val)) = (
                            hyper::header::HeaderName::from_bytes(k.as_bytes()),
                            hyper::header::HeaderValue::from_bytes(v.as_bytes())
                        ) {
                            new_parts.headers.insert(name, val);
                        }
                    }
                    response = Response::from_parts(new_parts, Body::from(new_body.unwrap_or_default()));
                },
                _ => {
                    response = Response::from_parts(res_parts, Body::from(bytes));
                }
            }
        }
    }
    
    let (res_parts, res_body) = response.into_parts();
    let status = res_parts.status.as_u16();
    let mut res_body_str = None;
    let mut final_res_body = res_body;

    if (capture_body || state.intercept_responses.load(Ordering::Relaxed)) && !is_websocket {
        if let Ok(bytes) = to_bytes(final_res_body).await {
            res_body_str = String::from_utf8(bytes.to_vec()).ok();
            final_res_body = Body::from(bytes);
        } else {
            final_res_body = Body::empty();
        }
    }

    let custom_rules = db::get_custom_rules().await.unwrap_or_default();
    let plugins = crate::plugins::load_plugins(&app_handle);
    let mut findings = Vec::new();

    // Scan URL, Req Body, Res Body
    findings.extend(analysis::Scanner::scan_text(&url, &custom_rules, &plugins));
    if let Some(ref b) = req_body_str {
        findings.extend(analysis::Scanner::scan_text(b, &custom_rules, &plugins));
    }
    if let Some(ref b) = res_body_str {
        findings.extend(analysis::Scanner::scan_text(b, &custom_rules, &plugins));
    }
    let findings_count = findings.len();

    // Emit event to UI
    let _ = app_handle.emit("proxy-traffic", serde_json::json!({
        "method": method,
        "url": url,
        "status": status,
        "is_websocket": is_websocket,
        "captured_vulnerabilities": findings_count
    }));

    let url_clone = url.clone();
    let method_clone = method.clone();
    let req_body_clone = req_body_str.clone();
    let res_body_clone = res_body_str.clone();

    // Passive Ingestion
    let _ = tauri::async_runtime::spawn(async move {
        let entry = assets::CreateAssetRequest {
            url: url_clone,
            method: Some(method_clone),
            status_code: Some(status as i64),
            source: if is_websocket { "Live Proxy (WS)".to_string() } else { "Live Proxy".to_string() },
            req_body: req_body_clone,
            res_body: res_body_clone,
            findings,
        };
        let _ = assets::add_asset(entry).await;
    });
    
    Ok(Response::from_parts(res_parts, final_res_body))
}

fn handle_connect(app_handle: AppHandle, req: Request<Body>, state: Arc<ProxyState>) -> Result<Response<Body>, hyper::Error> {
    if let Some(host_port) = req.uri().authority().map(|auth| auth.to_string()) {
        let host = host_port.split(':').next().unwrap_or(&host_port).to_string();
        
        tokio::task::spawn(async move {
            match hyper::upgrade::on(req).await {
                Ok(upgraded) => {
                    // Start MITM handshake
                    if let Err(e) = handle_mitm(app_handle, upgraded, host, state).await {
                        eprintln!("MITM error: {}", e);
                    }
                }
                Err(e) => eprintln!("Upgrade error: {}", e),
            }
        });
        Ok(Response::new(Body::empty()))
    } else {
        Ok(Response::builder()
            .status(400)
            .body(Body::from("CONNECT must be to a host:port"))
            .unwrap())
    }
}

async fn handle_mitm(app_handle: AppHandle, upgraded: Upgraded, host: String, state: Arc<ProxyState>) -> anyhow::Result<()> {
    let server_config = state.cert_manager.get_server_config(&host).await;
    let acceptor = TlsAcceptor::from(server_config);
    
    match acceptor.accept(upgraded).await {
        Ok(tls_stream) => {
            let service = service_fn(move |req| {
                handle_request(app_handle.clone(), req, state.clone(), true)
            });

            if let Err(e) = Http::new()
                .serve_connection(tls_stream, service)
                .await 
            {
                eprintln!("Error in MITM connection for {}: {}", host, e);
            }
        }
        Err(e) => {
            eprintln!("Failed to perform TLS handshake for {}: {}", host, e);
        }
    }
    Ok(())
}

