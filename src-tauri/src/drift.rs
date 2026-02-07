use crate::analysis::{Finding, FindingSeverity};
use serde_json::Value;
use url::Url;

pub fn detect_drift(
    url_str: &str,
    method: &str,
    res_body: Option<&str>,
    specs: Vec<crate::db::ApiSpec>,
) -> Vec<Finding> {
    let mut findings = Vec::new();
    let mut matched_spec = false;
    let mut matched_path = false;

    let parsed_url = match Url::parse(url_str) {
        Ok(u) => u,
        Err(_) => return findings,
    };

    let path = parsed_url.path();

    for spec in specs {
        let openapi: Value = match serde_json::from_str(&spec.content) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let paths = match openapi.get("paths").and_then(|p| p.as_object()) {
            Some(p) => p,
            None => continue,
        };

        // Try to find a matching path template (e.g. /users/{id} matches /users/123)
        for (tmpl, methods) in paths {
            if path_matches(tmpl, path) {
                matched_path = true;
                let method_lower = method.to_lowercase();

                if let Some(op) = methods.get(&method_lower) {
                    matched_spec = true;

                    // Check for Undocumented Response Body if present
                    if let Some(actual_body) = res_body {
                        if !actual_body.is_empty() && actual_body.starts_with("{") {
                            let schema = op
                                .get("responses")
                                .and_then(|r| r.get("200"))
                                .and_then(|r200| r200.get("content"))
                                .and_then(|c| c.get("application/json"))
                                .and_then(|aj| aj.get("schema"));

                            if let Some(s) = schema {
                                findings.extend(compare_schema_to_body(s, actual_body));
                            }
                        }
                    }
                } else {
                    // Path exists but method is undocumented
                    findings.push(Finding {
                        id: None,
                        rule_id: "DRIFT-UNDOCUMENTED-METHOD".to_string(),
                        name: "Undocumented API Method".to_string(),
                        description: format!(
                            "The path '{}' is documented in '{}', but the method '{}' is not.",
                            tmpl, spec.name, method
                        ),
                        severity: FindingSeverity::Medium,
                        match_content: method.to_string(),
                        notes: None,
                        is_false_positive: Some(false),
                        severity_override: None,
                    });
                }
                break;
            }
        }
    }

    if matched_path && !matched_spec && findings.is_empty() {
        // We found the path in at least one spec but the exact method/operation wasn't found or was already handled
    } else if !matched_path && !url_str.contains("localhost") {
        // This is a "Shadow API" if we have specs and none match this path
        // Only flag if we have at least one spec in the system
    }

    findings
}

fn path_matches(tmpl: &str, path: &str) -> bool {
    // Basic path parameter matching: replace {param} with [^/]+
    let mut regex_str = String::from("^");
    let parts: Vec<&str> = tmpl.split('/').collect();
    for (i, part) in parts.iter().enumerate() {
        if i > 0 {
            regex_str.push('/');
        }
        if part.starts_with('{') && part.ends_with('}') {
            regex_str.push_str("[^/]+");
        } else {
            regex_str.push_str(&regex::escape(part));
        }
    }
    regex_str.push_str("$");

    if let Ok(re) = regex::Regex::new(&regex_str) {
        re.is_match(path)
    } else {
        tmpl == path
    }
}

fn compare_schema_to_body(schema: &Value, body_str: &str) -> Vec<Finding> {
    let mut findings = Vec::new();
    let body: Value = match serde_json::from_str(body_str) {
        Ok(v) => v,
        Err(_) => return findings,
    };

    if let Some(props) = schema.get("properties").and_then(|p| p.as_object()) {
        if let Some(body_obj) = body.as_object() {
            for (key, _val) in body_obj {
                if !props.contains_key(key) {
                    findings.push(Finding {
                        id: None,
                        rule_id: "DRIFT-EXTRA-FIELD".to_string(),
                        name: "Undocumented Field in Response".to_string(),
                        description: format!("The field '{}' was found in the response but is not documented in the schema.", key),
                        severity: FindingSeverity::Low,
                        match_content: key.to_string(),
                        notes: None,
                        is_false_positive: Some(false),
                        severity_override: None,
                    });
                }
            }

            // Check for missing required fields
            if let Some(required) = schema.get("required").and_then(|r| r.as_array()) {
                for req in required {
                    if let Some(field_name) = req.as_str() {
                        if !body_obj.contains_key(field_name) {
                            findings.push(Finding {
                                id: None,
                                rule_id: "DRIFT-MISSING-FIELD".to_string(),
                                name: "Missing Required Field".to_string(),
                                description: format!("The required field '{}' is documented but missing from the actual response.", field_name),
                                severity: FindingSeverity::Medium,
                                match_content: field_name.to_string(),
                                notes: None,
                                is_false_positive: Some(false),
                                severity_override: None,
                            });
                        }
                    }
                }
            }
        }
    }

    findings
}
