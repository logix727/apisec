use serde::{Deserialize, Serialize};
use reqwest;

#[derive(Serialize, Deserialize, Debug)]
pub struct LLMRequest {
    pub model: String,
    pub prompt: String,
    pub stream: bool,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct LLMResponse {
    pub response: String,
    pub done: bool,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct TriageSuggestion {
    pub severity_assessment: String,
    pub false_positive_likelihood: String,
    pub owasp_category: String,
    pub remediation_hint: String,
    pub similar_cves: Vec<String>,
}

/// Query local LLM (Ollama/LM Studio) for finding triage suggestions
pub async fn get_triage_suggestion(
    finding_name: &str,
    finding_description: &str,
    evidence: &str,
    endpoint_url: &str,
) -> Result<TriageSuggestion, String> {
    let prompt = format!(
        r#"You are an expert API security analyst. Analyze this security finding and provide triage guidance.
        Specifically, identify which OWASP Top 10 API Security category it falls under (e.g., API1:2023 Broken Object Level Authorization).

**Finding:** {}
**Description:** {}
**Evidence:** {}
**Endpoint:** {}

Provide your analysis in the following JSON format:
{{
  "severity_assessment": "Critical/High/Medium/Low with justification",
  "false_positive_likelihood": "High/Medium/Low with reasoning",
  "owasp_category": "API X:2023 Category Name",
  "remediation_hint": "Specific actionable fix recommendation",
  "similar_cves": ["CVE-XXXX-XXXX", ...]
}}

Be concise and actionable. Focus on practical security impact."#,
        finding_name, finding_description, evidence, endpoint_url
    );

    // Try Ollama first (default port 11434)
    let ollama_url = "http://localhost:11434/api/generate";
    
    let request = LLMRequest {
        model: "llama3.2:latest".to_string(),
        prompt,
        stream: false,
    };

    let client = reqwest::Client::new();
    let response = client
        .post(ollama_url)
        .json(&request)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("LLM connection failed: {}. Is Ollama running?", e))?;

    if !response.status().is_success() {
        return Err(format!("LLM returned error: {}", response.status()));
    }

    let llm_response: LLMResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse LLM response: {}", e))?;

    // Parse JSON from LLM response
    let suggestion: TriageSuggestion = serde_json::from_str(&llm_response.response)
        .map_err(|e| format!("LLM returned invalid JSON: {}", e))?;

    Ok(suggestion)
}

#[tauri::command]
pub async fn ai_triage_finding(
    finding_id: i64,
    finding_name: String,
    description: String,
    evidence: String,
    url: String,
) -> Result<TriageSuggestion, String> {
    get_triage_suggestion(&finding_name, &description, &evidence, &url).await
}

#[tauri::command]
pub async fn check_llm_availability() -> Result<bool, String> {
    let client = reqwest::Client::new();
    let result = client
        .get("http://localhost:11434/api/tags")
        .timeout(std::time::Duration::from_secs(2))
        .send()
        .await;

    match result {
        Ok(response) => Ok(response.status().is_success()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
pub async fn get_available_models() -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let response = client
        .get("http://localhost:11434/api/tags")
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;

    #[derive(Deserialize)]
    struct ModelList {
        models: Vec<Model>,
    }

    #[derive(Deserialize)]
    struct Model {
        name: String,
    }

    let model_list: ModelList = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse models: {}", e))?;

    Ok(model_list.models.iter().map(|m| m.name.clone()).collect())
}
