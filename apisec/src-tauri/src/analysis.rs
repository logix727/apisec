use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, sqlx::Type)]
#[sqlx(rename_all = "PascalCase")]
pub enum FindingSeverity {
    High,
    Medium,
    Low,
    Info,
}

impl FindingSeverity {
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "high" | "critical" => Self::High,
            "medium" => Self::Medium,
            "low" => Self::Low,
            _ => Self::Info,
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, sqlx::FromRow)]
pub struct Finding {
    pub id: Option<i64>,
    pub rule_id: String,
    pub name: String,
    pub description: String,
    pub severity: FindingSeverity,
    pub match_content: String,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub is_false_positive: Option<bool>,
    #[serde(default)]
    pub severity_override: Option<FindingSeverity>,
}

pub struct Scanner;

impl Scanner {
    pub fn scan(
        content: &str,
        custom_rules: &[crate::db::CustomRule],
        plugins: &[crate::plugins::PluginPack],
    ) -> Vec<Finding> {
        Self::scan_text(content, custom_rules, plugins)
    }

    pub fn scan_text(
        content: &str,
        custom_rules: &[crate::db::CustomRule],
        plugins: &[crate::plugins::PluginPack],
    ) -> Vec<Finding> {
        let mut findings = Vec::new();
        findings.extend(Self::scan_pii(content));
        findings.extend(Self::scan_auth(content));
        findings.extend(Self::scan_pci(content));
        findings.extend(Self::scan_vin(content));
        findings.extend(Self::scan_compliance(content));
        findings.extend(Self::scan_infrastructure(content));
        findings.extend(Self::scan_injection(content));
        findings.extend(Self::scan_misconfig(content));
        findings.extend(Self::scan_bola(content));
        findings.extend(Self::scan_leaks(content));
        findings.extend(Self::scan_graphql(content));
        findings.extend(Self::scan_rate_limiting(content));
        findings.extend(Self::scan_mass_assignment(content));
        findings.extend(Self::scan_ssrf(content));
        findings.extend(Self::scan_nosql(content));
        findings.extend(Self::scan_assets_mgmt(content));
        findings.extend(Self::scan_entropy(content));
        findings.extend(Self::scan_grpc(content));
        findings.extend(crate::plugins::scan_with_plugins(content, plugins));
        findings.extend(Self::scan_custom(content, custom_rules));
        findings
    }

    fn scan_auth(content: &str) -> Vec<Finding> {
        let mut findings = Vec::new();
        use base64::{engine::general_purpose, Engine as _};

        // JWT Regex
        let jwt_regex =
            Regex::new(r"ey[A-Za-z0-9\-_]+\.ey[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+").unwrap();
        for mat in jwt_regex.find_iter(content) {
            let token = mat.as_str();
            let parts: Vec<&str> = token.split('.').collect();
            if parts.len() == 3 {
                let payload_b64 = parts[1];
                let decoded_payload = general_purpose::URL_SAFE_NO_PAD
                    .decode(payload_b64)
                    .or_else(|_| general_purpose::URL_SAFE.decode(payload_b64));

                if let Ok(decoded_bytes) = decoded_payload {
                    if let Ok(json_str) = String::from_utf8(decoded_bytes) {
                        findings.push(Finding {
                            id: None,
                            rule_id: "AUTH-JWT".to_string(),
                            name: "JWT Token".to_string(),
                            description: format!("Exposed JWT. Payload: {}", json_str),
                            severity: FindingSeverity::High,
                            match_content: token.chars().take(80).collect::<String>(),
                            notes: None,
                            is_false_positive: Some(false),
                            severity_override: None,
                        });
                    }
                }
            }
        }

        // Basic Auth
        let basic_regex = Regex::new(r"(?i)Basic\s+([a-zA-Z0-9+/=]+)").unwrap();
        for caps in basic_regex.captures_iter(content) {
            if let Some(val) = caps.get(1) {
                let b64 = val.as_str();
                if let Ok(decoded) = general_purpose::STANDARD.decode(b64) {
                    if let Ok(creds) = String::from_utf8(decoded) {
                        if creds.contains(':') {
                            findings.push(Finding {
                                id: None,
                                rule_id: "AUTH-BASIC".to_string(),
                                name: "Basic Auth credentials".to_string(),
                                description: format!("Exposed credentials: {}", creds),
                                severity: FindingSeverity::High,
                                match_content: val.as_str().to_string(),
                                notes: None,
                                is_false_positive: Some(false),
                                severity_override: None,
                            });
                        }
                    }
                }
            }
        }

        findings
    }

    fn scan_pci(content: &str) -> Vec<Finding> {
        let mut findings = Vec::new();
        // Visa, Mastercard, AMEX, Discover, Diners, JCB
        let card_regex = Regex::new(r"\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12}|(?:2131|1800|35[0-9]{3})[0-9]{11})\b").unwrap();

        for mat in card_regex.find_iter(content) {
            findings.push(Finding {
                id: None,
                rule_id: "PCI-CARD".to_string(),
                name: "Unmasked Payment Card".to_string(),
                description:
                    "Plaintext credit card data detected. This is a severe PCI DSS violation."
                        .to_string(),
                severity: FindingSeverity::High,
                match_content: mat.as_str().to_string(),
                notes: Some("Card pattern matched industry standard BIN ranges.".to_string()),
                is_false_positive: Some(false),
                severity_override: None,
            });
        }
        findings
    }

    fn scan_vin(content: &str) -> Vec<Finding> {
        let mut findings = Vec::new();
        // VIN: 17 chars, no I, O, Q, must end in digits
        let vin_regex = Regex::new(r"\b[A-HJ-NPR-Z0-9]{13}[0-9]{4}\b").unwrap();
        for mat in vin_regex.find_iter(content) {
            findings.push(Finding {
                id: None,
                rule_id: "DATA-VIN".to_string(),
                name: "Vehicle Identification Number (VIN)".to_string(),
                description: "Discovery of a 17-character VIN in request/response data. This is often processed as PII/Asset data.".to_string(),
                severity: FindingSeverity::Low,
                match_content: mat.as_str().to_string(),
                notes: Some("Standard 17-digit ISO 3779 compliant pattern.".to_string()),
                is_false_positive: Some(false),
                severity_override: None,
            });
        }
        findings
    }

    fn scan_compliance(content: &str) -> Vec<Finding> {
        let mut findings = Vec::new();

        let compliance_rules = [
            ("COMP-HIPAA", "HIPAA Data Marker", "Potentially protected health information (ePHI) or healthcare-specific terminology detected.", ["Patient ID", "medical record", "health plan", "diagnosis code", "ePHI"]),
            ("COMP-SOC2", "SOC2 Compliance Keyword", "Sensitive internal operational or security terminology associated with SOC 2 requirements.", ["audit log", "access control list", "confidentiality policy", "availability report"]),
            ("COMP-ISO27001", "ISO 27001 Marker", "Reference to ISO 27001 security standards or documentation requirements.", ["ISMS", "Statement of Applicability", "Annex A", "security objective", "risk assessment"]),
            ("COMP-GDPR", "GDPR Data Subject Info", "References to data subject rights or terminology regulated by GDPR.", ["data subject", "right to be forgotten", "consent withdrawal", "processing purpose", "data controller"]),
        ];

        for (id, name, desc, keywords) in compliance_rules {
            for kw in keywords {
                if content.contains(kw) {
                    findings.push(Finding {
                        id: None,
                        rule_id: id.to_string(),
                        name: name.to_string(),
                        description: desc.to_string(),
                        severity: FindingSeverity::Info,
                        match_content: kw.to_string(),
                        notes: Some(format!("Found compliance keyword: {}", kw)),
                        is_false_positive: Some(false),
                        severity_override: None,
                    });
                }
            }
        }

        // SWIFT/BIC (Financial)
        let swift_regex = Regex::new(r"\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?\b").unwrap();
        for mat in swift_regex.find_iter(content) {
            findings.push(Finding {
                id: None,
                rule_id: "COMP-FIN-SWIFT".to_string(),
                name: "SWIFT/BIC Code".to_string(),
                description:
                    "Financial institution identifier detected (Potential PCI/Financial leak)."
                        .to_string(),
                severity: FindingSeverity::Medium,
                match_content: mat.as_str().to_string(),
                notes: None,
                is_false_positive: Some(false),
                severity_override: None,
            });
        }

        findings
    }

    fn scan_infrastructure(content: &str) -> Vec<Finding> {
        let mut findings = Vec::new();

        // AWS Access Key ID
        let aws_key_regex = Regex::new(r"\b(AKIA|ASIA)[0-9A-Z]{16}\b").unwrap();
        for mat in aws_key_regex.find_iter(content) {
            findings.push(Finding {
                id: None,
                rule_id: "INFRA-AWS-KEY".to_string(),
                name: "AWS Access Key".to_string(),
                description: "AWS Access Key ID detected. Potential full cloud account access."
                    .to_string(),
                severity: FindingSeverity::High,
                match_content: mat.as_str().to_string(),
                notes: None,
                is_false_positive: Some(false),
                severity_override: None,
            });
        }

        // AWS Secret Access Key
        let aws_secret_regex =
            Regex::new(r"(?i)aws_secret_access_key[\s=:]+([a-zA-Z0-9+/]{40})").unwrap();
        for caps in aws_secret_regex.captures_iter(content) {
            if let Some(val) = caps.get(1) {
                findings.push(Finding {
                    id: None,
                    rule_id: "INFRA-AWS-SECRET".to_string(),
                    name: "AWS Secret Key".to_string(),
                    description: "AWS Secret Access Key found. Immediate high risk.".to_string(),
                    severity: FindingSeverity::High,
                    match_content: val.as_str().to_string(),
                    notes: None,
                    is_false_positive: Some(false),
                    severity_override: None,
                });
            }
        }

        // GCP API Key
        let gcp_key_regex = Regex::new(r"\bAIza[0-9A-Za-z\\-_]{35}\b").unwrap();
        for mat in gcp_key_regex.find_iter(content) {
            findings.push(Finding {
                id: None,
                rule_id: "INFRA-GCP-KEY".to_string(),
                name: "GCP API Key".to_string(),
                description: "Google Cloud Platform API Key detected.".to_string(),
                severity: FindingSeverity::Medium,
                match_content: mat.as_str().to_string(),
                notes: None,
                is_false_positive: Some(false),
                severity_override: None,
            });
        }

        // Stripe Live Token
        let stripe_regex = Regex::new(r"sk_live_[0-9a-zA-Z]{24}").unwrap();
        for mat in stripe_regex.find_iter(content) {
            findings.push(Finding {
                id: None,
                rule_id: "INFRA-STRIPE-KEY".to_string(),
                name: "Stripe Secret Key".to_string(),
                description: "Active Stripe Secret Key found. Processing risk.".to_string(),
                severity: FindingSeverity::High,
                match_content: mat.as_str().to_string(),
                notes: None,
                is_false_positive: Some(false),
                severity_override: None,
            });
        }

        // Slack Webhook
        let slack_webhook_regex = Regex::new(
            r"https://hooks.slack.com/services/T[a-zA-Z0-9_]+/B[a-zA-Z0-9_]+/[a-zA-Z0-9_]+",
        )
        .unwrap();
        for mat in slack_webhook_regex.find_iter(content) {
            findings.push(Finding {
                id: None,
                rule_id: "SaaS-SLACK-WEBHOOK".to_string(),
                name: "Slack Incoming Webhook".to_string(),
                description: "Slack webhook URL found. Can be used for message spoofing."
                    .to_string(),
                severity: FindingSeverity::Medium,
                match_content: mat.as_str().to_string(),
                notes: None,
                is_false_positive: Some(false),
                severity_override: None,
            });
        }

        // GitHub PAT
        let github_pat_regex = Regex::new(r"ghp_[a-zA-Z0-9]{36}").unwrap();
        for mat in github_pat_regex.find_iter(content) {
            findings.push(Finding {
                id: None,
                rule_id: "SaaS-GITHUB-PAT".to_string(),
                name: "GitHub Personal Access Token".to_string(),
                description: "GitHub PAT detected. Potential repository access.".to_string(),
                severity: FindingSeverity::High,
                match_content: mat.as_str().to_string(),
                notes: None,
                is_false_positive: Some(false),
                severity_override: None,
            });
        }

        // Heroku API Key
        let heroku_regex = Regex::new(r"\b[h|H][e|E][r|R][o|O][k|K][u|U].*[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\b").unwrap();
        for mat in heroku_regex.find_iter(content) {
            findings.push(Finding {
                id: None,
                rule_id: "INFRA-HEROKU-KEY".to_string(),
                name: "Heroku API Key".to_string(),
                description: "Heroku Platform API Key found.".to_string(),
                severity: FindingSeverity::High,
                match_content: mat.as_str().to_string(),
                notes: None,
                is_false_positive: Some(false),
                severity_override: None,
            });
        }

        // Firebase API Key
        let firebase_regex = Regex::new(r"AIzaSy[A-Za-z0-9\-_]{33}").unwrap();
        for mat in firebase_regex.find_iter(content) {
            findings.push(Finding {
                id: None,
                rule_id: "SaaS-FIREBASE-KEY".to_string(),
                name: "Firebase API Key".to_string(),
                description: "Firebase API key discovered. Check for permissive database rules."
                    .to_string(),
                severity: FindingSeverity::Medium,
                match_content: mat.as_str().to_string(),
                notes: None,
                is_false_positive: Some(false),
                severity_override: None,
            });
        }

        // SendGrid API Key
        let sendgrid_regex = Regex::new(r"SG\.[a-zA-Z0-9\-_]{22}\.[a-zA-Z0-9\-_]{43}").unwrap();
        for mat in sendgrid_regex.find_iter(content) {
            findings.push(Finding {
                id: None,
                rule_id: "SaaS-SENDGRID-KEY".to_string(),
                name: "SendGrid API Key".to_string(),
                description: "SendGrid API key detected. Can be used for email spoofing."
                    .to_string(),
                severity: FindingSeverity::High,
                match_content: mat.as_str().to_string(),
                notes: None,
                is_false_positive: Some(false),
                severity_override: None,
            });
        }

        findings
    }

    fn scan_bola(content: &str) -> Vec<Finding> {
        let mut findings = Vec::new();
        // Broken Object Level Authorization (BOLA) - ID in URL
        let bola_regex = Regex::new(r"/(?:user|account|order|invoice)s?/(?:[0-9]{3,}|[a-f0-9]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b").unwrap();
        for mat in bola_regex.find_iter(content) {
            findings.push(Finding {
                id: None,
                rule_id: "VULN-BOLA-ID".to_string(),
                name: "Potential BOLA Pattern".to_string(),
                description: "Direct reference to an object ID in URL. Ensure authorization checks are applied.".to_string(),
                severity: FindingSeverity::Medium,
                match_content: mat.as_str().to_string(),
                notes: None,
                is_false_positive: Some(false),
                severity_override: None,
            });
        }
        findings
    }

    fn scan_leaks(content: &str) -> Vec<Finding> {
        let mut findings = Vec::new();
        // Internal IP Leak
        let ip_regex = Regex::new(r"\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})\b").unwrap();
        for mat in ip_regex.find_iter(content) {
            findings.push(Finding {
                id: None,
                rule_id: "LEAK-INTERNAL-IP".to_string(),
                name: "Internal IP Address Disclosure".to_string(),
                description:
                    "Private network IP address found in response. Reveals internal infrastructure."
                        .to_string(),
                severity: FindingSeverity::Low,
                match_content: mat.as_str().to_string(),
                notes: None,
                is_false_positive: Some(false),
                severity_override: None,
            });
        }

        // Stack Trace Leak
        let stack_regex = Regex::new(r"(?i)(at\s+[a-zA-Z0-9$_.]+\([a-zA-Z0-9$_.]+\.java:\d+\)|stack\s+trace|Exception\s+in\s+thread)").unwrap();
        for mat in stack_regex.find_iter(content) {
            findings.push(Finding {
                id: None,
                rule_id: "LEAK-STACK-TRACE".to_string(),
                name: "Stack Trace Disclosure".to_string(),
                description: "Detailed application stack trace detected. Reveals internal codebase structure.".to_string(),
                severity: FindingSeverity::Medium,
                match_content: mat.as_str().to_string(),
                notes: None,
                is_false_positive: Some(false),
                severity_override: None,
            });
        }
        findings
    }

    fn scan_pii(content: &str) -> Vec<Finding> {
        let mut findings = Vec::new();

        // Email
        let email_regex = Regex::new(r"(?i)[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}").unwrap();
        for mat in email_regex.find_iter(content) {
            findings.push(Finding {
                id: None,
                rule_id: "PII-EMAIL".to_string(),
                name: "Email address".to_string(),
                description: "Exposed email address".to_string(),
                severity: FindingSeverity::Low,
                match_content: mat.as_str().to_string(),
                notes: None,
                is_false_positive: Some(false),
                severity_override: None,
            });
        }

        // Phone Number (US/General)
        let phone_regex =
            Regex::new(r"\b(?:\+?1[-. ]?)?\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})\b")
                .unwrap();
        for mat in phone_regex.find_iter(content) {
            findings.push(Finding {
                id: None,
                rule_id: "PII-PHONE".to_string(),
                name: "Phone number".to_string(),
                description: "Exposed phone number".to_string(),
                severity: FindingSeverity::Low,
                match_content: mat.as_str().to_string(),
                notes: None,
                is_false_positive: Some(false),
                severity_override: None,
            });
        }

        // SSN (US)
        let ssn_regex = Regex::new(r"\b([0-9]{3}-[0-9]{2}-[0-9]{4})\b").unwrap();
        for mat in ssn_regex.find_iter(content) {
            findings.push(Finding {
                id: None,
                rule_id: "PII-SSN".to_string(),
                name: "Social Security Number (SSN)".to_string(),
                description: "Exposed US Social Security Number".to_string(),
                severity: FindingSeverity::High,
                match_content: mat.as_str().to_string(),
                notes: None,
                is_false_positive: Some(false),
                severity_override: None,
            });
        }

        // Generic Secret
        let secret_regex =
            Regex::new(r"(?i)(api[_-]?key|secret|token)[\s=:]+([a-zA-Z0-9_\-]{20,})").unwrap();
        for caps in secret_regex.captures_iter(content) {
            if let Some(val) = caps.get(2) {
                findings.push(Finding {
                    id: None,
                    rule_id: "AUTH-SECRET".to_string(),
                    name: "API secret/key".to_string(),
                    description: "High entropy string associated with security keywords"
                        .to_string(),
                    severity: FindingSeverity::High,
                    match_content: val.as_str().to_string(),
                    notes: None,
                    is_false_positive: Some(false),
                    severity_override: None,
                });
            }
        }

        // Verbose Headers
        let header_regex = Regex::new(r"(?i)(Server|X-Powered-By|X-AspNet-Version):\s*.*").unwrap();
        for mat in header_regex.find_iter(content) {
            findings.push(Finding {
                id: None,
                rule_id: "CONF-VERBOSE-HEADER".to_string(),
                name: "Verbose Information Header".to_string(),
                description:
                    "Server or technology version header detected. Leaks implementation details."
                        .to_string(),
                severity: FindingSeverity::Info,
                match_content: mat.as_str().to_string(),
                notes: None,
                is_false_positive: Some(false),
                severity_override: None,
            });
        }

        // Missing Security Headers (Passive detection)
        // Note: These are only findings if NOT found, but scanner currently detects PRESENCE of patterns.
        // We'll detect if they are missing by checking the whole block if it looks like a header block.
        if content.contains("HTTP/") {
            if !content.to_lowercase().contains("strict-transport-security") {
                findings.push(Finding {
                    id: None,
                    rule_id: "CONF-MISSING-HSTS".to_string(),
                    name: "Missing HSTS Header".to_string(),
                    description: "Strict-Transport-Security header is missing. Sensitive data may be sent over HTTP.".to_string(),
                    severity: FindingSeverity::Low,
                    match_content: "Header block".to_string(),
                    notes: None,
                    is_false_positive: Some(false),
                    severity_override: None,
                });
            }
            if !content.to_lowercase().contains("content-security-policy") {
                findings.push(Finding {
                    id: None,
                    rule_id: "CONF-MISSING-CSP".to_string(),
                    name: "Missing CSP Header".to_string(),
                    description:
                        "Content-Security-Policy header is missing. Risk of XSS and data injection."
                            .to_string(),
                    severity: FindingSeverity::Low,
                    match_content: "Header block".to_string(),
                    notes: None,
                    is_false_positive: Some(false),
                    severity_override: None,
                });
            }
        }

        findings
    }

    fn scan_rate_limiting(content: &str) -> Vec<Finding> {
        let mut findings = Vec::new();

        // Rate Limit Headers
        let rl_regex =
            Regex::new(r"(?i)(X-RateLimit-Limit|RateLimit-Limit|X-RateLimit-Remaining)").unwrap();
        for mat in rl_regex.find_iter(content) {
            findings.push(Finding {
                id: None,
                rule_id: "CONF-RATE-LIMIT".to_string(),
                name: "Rate Limiting Headers".to_string(),
                description: "Rate limiting headers detected. Beneficial but reveals quota limits to attackers.".to_string(),
                severity: FindingSeverity::Info,
                match_content: mat.as_str().to_string(),
                notes: None,
                is_false_positive: Some(false),
                severity_override: None,
            });
        }

        findings
    }

    fn scan_injection(content: &str) -> Vec<Finding> {
        let mut findings = Vec::new();

        // SQL Injection patterns
        let sqli_regex = Regex::new(r"(?i)(SELECT\s+.*\s+FROM|UNION\s+ALL\s+SELECT|INSERT\s+INTO\s+.*\s+VALUES|UPDATE\s+.*\s+SET|DELETE\s+FROM)").unwrap();
        for mat in sqli_regex.find_iter(content) {
            findings.push(Finding {
                id: None,
                rule_id: "INJ-SQL".to_string(),
                name: "SQL Injection Pattern".to_string(),
                description: "Possible SQL injection keywords detected in payload".to_string(),
                severity: FindingSeverity::High,
                match_content: mat.as_str().to_string(),
                notes: None,
                is_false_positive: Some(false),
                severity_override: None,
            });
        }

        // Cross-Site Scripting (XSS)
        let xss_regex =
            Regex::new(r"(?i)(<script>|javascript:|onerror\s*=|onload\s*=|alert\()").unwrap();
        for mat in xss_regex.find_iter(content) {
            findings.push(Finding {
                id: None,
                rule_id: "INJ-XSS".to_string(),
                name: "XSS Pattern".to_string(),
                description: "Cross-site scripting (XSS) vectors detected".to_string(),
                severity: FindingSeverity::High,
                match_content: mat.as_str().to_string(),
                notes: None,
                is_false_positive: Some(false),
                severity_override: None,
            });
        }

        findings
    }

    fn scan_misconfig(content: &str) -> Vec<Finding> {
        let mut findings = Vec::new();

        // Permissive CORS
        let cors_regex = Regex::new(r"(?i)Access-Control-Allow-Origin:\s*\*").unwrap();
        for mat in cors_regex.find_iter(content) {
            findings.push(Finding {
                id: None,
                rule_id: "CONF-CORS-ALL".to_string(),
                name: "Permissive CORS Policy".to_string(),
                description: "Access-Control-Allow-Origin is set to *. This allows any domain to access the resource.".to_string(),
                severity: FindingSeverity::Medium,
                match_content: mat.as_str().to_string(),
                notes: None,
                is_false_positive: Some(false),
                severity_override: None,
            });
        }

        findings
    }

    fn scan_graphql(content: &str) -> Vec<Finding> {
        let mut findings = Vec::new();

        // GraphQL Introspection
        let intros_regex =
            Regex::new(r"(?i)(__schema|__type|__typekind|__field|__inputvalue)").unwrap();
        for mat in intros_regex.find_iter(content) {
            findings.push(Finding {
                id: None,
                rule_id: "VULN-GRAPHQL-INTRO".to_string(),
                name: "GraphQL Introspection Detected".to_string(),
                description: "GraphQL introspection query detected. This reveals the entire API schema, including hidden fields and types.".to_string(),
                severity: FindingSeverity::Medium,
                match_content: mat.as_str().to_string(),
                notes: None,
                is_false_positive: Some(false),
                severity_override: None,
            });
        }

        // Potential Batch Attack
        if content.contains("[")
            && content.contains("query")
            && content.matches("query").count() > 5
        {
            findings.push(Finding {
                id: None,
                rule_id: "VULN-GRAPHQL-BATCH".to_string(),
                name: "Potential GraphQL Batch Attack".to_string(),
                description: "Multiple GraphQL queries detected in a single request. Can be used for brute-forcing or resource exhaustion.".to_string(),
                severity: FindingSeverity::Medium,
                match_content: "Multiple query definitions in batch".to_string(),
                notes: None,
                is_false_positive: Some(false),
                severity_override: None,
            });
        }

        // Sensitive Field Leakage in GraphQL
        let sensitive_fields = [
            "password",
            "secret",
            "token",
            "apiKey",
            "creditCard",
            "ssn",
            "hash",
        ];
        for field in sensitive_fields {
            let field_regex = Regex::new(&format!(r#"(?i)"{}\s*""#, field)).unwrap();
            if field_regex.is_match(content) {
                findings.push(Finding {
                    id: None,
                    rule_id: "LEAK-GRAPHQL-SENSITIVE".to_string(),
                    name: "Sensitive Field in GraphQL Payload".to_string(),
                    description: format!("GraphQL payload contains potential sensitive field: '{}'. Ensure proper field-level authorization.", field),
                    severity: FindingSeverity::Low,
                    match_content: field.to_string(),
                    notes: None,
                    is_false_positive: Some(false),
                    severity_override: None,
                });
            }
        }

        findings
    }

    fn scan_mass_assignment(content: &str) -> Vec<Finding> {
        let mut findings = Vec::new();
        // Mass Assignment - detecting sensitive fields being passed in bodies
        let mass_regex = Regex::new(r#"(?i)"(isAdmin|is_admin|role|permissions|account_type|is_verified|privileges)"\s*:\s*(true|false|"[^"]+")"#).unwrap();
        for mat in mass_regex.find_iter(content) {
            findings.push(Finding {
                id: None,
                rule_id: "VULN-MASS-ASSIGNMENT".to_string(),
                name: "Potential Mass Assignment".to_string(),
                description: "Sensitive privilege field detected in request body. Ensure these fields cannot be modified by end-users.".to_string(),
                severity: FindingSeverity::Medium,
                match_content: mat.as_str().to_string(),
                notes: None,
                is_false_positive: Some(false),
                severity_override: None,
            });
        }
        findings
    }

    fn scan_ssrf(content: &str) -> Vec<Finding> {
        let mut findings = Vec::new();
        // SSRF - URL parameters pointing to internal/loopback
        let ssrf_regex = Regex::new(r#"(?i)(?:url|u|link|src|dest|redirect|callback)=(?:https?|ftp)://(?:localhost|127\.0\.0\.1|169\.254\.169\.254|0\.0\.0\.0|\[::1\])"#).unwrap();
        for mat in ssrf_regex.find_iter(content) {
            findings.push(Finding {
                id: None,
                rule_id: "VULN-SSRF".to_string(),
                name: "Potential SSRF Vector".to_string(),
                description: "Input parameter contains internal or loopback address. Potential Server-Side Request Forgery.".to_string(),
                severity: FindingSeverity::High,
                match_content: mat.as_str().to_string(),
                notes: None,
                is_false_positive: Some(false),
                severity_override: None,
            });
        }
        findings
    }

    fn scan_nosql(content: &str) -> Vec<Finding> {
        let mut findings = Vec::new();
        // NoSQL Injection - MongoDB operator abuse
        let nosql_regex =
            Regex::new(r#"\{\s*"\$(?:gt|lt|ne|eq|in|nin|regex|where)"\s*:\s*[^}]+\}"#).unwrap();
        for mat in nosql_regex.find_iter(content) {
            findings.push(Finding {
                id: None,
                rule_id: "INJ-NOSQL".to_string(),
                name: "NoSQL Injection Pattern".to_string(),
                description: "MongoDB-style query operator detected. Potential NoSQL injection."
                    .to_string(),
                severity: FindingSeverity::High,
                match_content: mat.as_str().to_string(),
                notes: None,
                is_false_positive: Some(false),
                severity_override: None,
            });
        }
        findings
    }

    fn scan_assets_mgmt(content: &str) -> Vec<Finding> {
        let mut findings = Vec::new();
        // Improper Assets Management - detecting old/vulnerable API versions
        let asset_regex = Regex::new(r#"(?i)/(v0|v1|beta|deprecated|test|old|staging)/"#).unwrap();
        for mat in asset_regex.find_iter(content) {
            findings.push(Finding {
                id: None,
                rule_id: "MGMT-OUTDATED-API".to_string(),
                name: "Outdated API Version".to_string(),
                description: "Endpoint belongs to an outdated or non-production version (v1, beta, etc.). Old versions often lack security patches.".to_string(),
                severity: FindingSeverity::Low,
                match_content: mat.as_str().to_string(),
                notes: None,
                is_false_positive: Some(false),
                severity_override: None,
            });
        }

        // Sensitive file exposure in URL
        let file_regex = Regex::new(r#"(?i)\.(env|git|config|bak|zip|sql|tar|gz|key)\b"#).unwrap();
        for mat in file_regex.find_iter(content) {
            findings.push(Finding {
                id: None,
                rule_id: "CONF-SENSITIVE-FILE".to_string(),
                name: "Sensitive File Reference".to_string(),
                description: "Sensitive file extension (.env, .git, .bak) detected in URL or body. Potential source/config exposure.".to_string(),
                severity: FindingSeverity::High,
                match_content: mat.as_str().to_string(),
                notes: None,
                is_false_positive: Some(false),
                severity_override: None,
            });
        }

        findings
    }

    fn scan_custom(content: &str, rules: &[crate::db::CustomRule]) -> Vec<Finding> {
        let mut findings = Vec::new();
        for rule in rules {
            if let Ok(re) = Regex::new(&rule.regex) {
                for mat in re.find_iter(content) {
                    findings.push(Finding {
                        id: None,
                        rule_id: rule.rule_id.clone(),
                        name: rule.name.clone(),
                        description: rule.description.clone(),
                        severity: FindingSeverity::from_str(&rule.severity),
                        match_content: mat.as_str().to_string(),
                        notes: None,
                        is_false_positive: Some(false),
                        severity_override: None,
                    });
                }
            }
        }
        findings
    }

    fn calculate_entropy(s: &str) -> f64 {
        let mut frequencies = std::collections::HashMap::new();
        for c in s.chars() {
            *frequencies.entry(c).or_insert(0) += 1;
        }
        let len = s.len() as f64;
        let mut entropy = 0.0;
        for &count in frequencies.values() {
            let p = count as f64 / len;
            entropy -= p * p.log2();
        }
        entropy
    }

    fn scan_entropy(content: &str) -> Vec<Finding> {
        let mut findings = Vec::new();
        // Look for potential keys: alphanumeric strings 20-64 chars long
        let candidate_regex = Regex::new(r"[a-zA-Z0-9/\+=]{20,64}").unwrap();

        for mat in candidate_regex.find_iter(content) {
            let s = mat.as_str();

            // Skip common non-secret tokens like HTML tags or long English words
            if s.contains('<') || s.contains('>') {
                continue;
            }

            let entropy = Self::calculate_entropy(s);

            // Shannon entropy threshold: > 4.5 bits is typically high for random keys
            if entropy > 4.5 {
                findings.push(Finding {
                    id: None,
                    rule_id: "CONF-HIGH-ENTROPY".to_string(),
                    name: "High Entropy String Detected".to_string(),
                    description: format!("Random-looking string with {:.2} bits of entropy. Likely an encoded key, secret, or session token.", entropy),
                    severity: FindingSeverity::Medium,
                    match_content: s.to_string(),
                    notes: Some(format!("Entropy: {:.2}", entropy)),
                    is_false_positive: Some(false),
                    severity_override: None,
                });
            }
        }
        findings
    }

    fn scan_grpc(content: &str) -> Vec<Finding> {
        let mut findings = Vec::new();

        // gRPC Content-Type detection in response/request blocks
        if content.contains("application/grpc") {
            findings.push(Finding {
                id: None,
                rule_id: "MGMT-GRPC-API".to_string(),
                name: "gRPC API Endpoint Detected".to_string(),
                description: "This endpoint uses gRPC (Protocol Buffers). Ensure binary message integrity and lack of sensitive data in field names.".to_string(),
                severity: FindingSeverity::Info,
                match_content: "application/grpc".to_string(),
                notes: None,
                is_false_positive: Some(false),
                severity_override: None,
            });
        }

        // Detect length-prefixed messages (simplified)
        if content.contains("\x00") && content.len() > 5 {
            let bytes = content.as_bytes();
            if (bytes[0] == 0 || bytes[0] == 1) && bytes.len() > 5 {
                // Potentially a gRPC frame
                findings.push(Finding {
                    id: None,
                    rule_id: "BASE-BINARY-PROTO".to_string(),
                    name: "Binary/gRPC Message Frame".to_string(),
                    description:
                        "Detected length-prefixed binary frame characteristic of gRPC/Protobuf."
                            .to_string(),
                    severity: FindingSeverity::Info,
                    match_content: "Binary frame start detected".to_string(),
                    notes: None,
                    is_false_positive: Some(false),
                    severity_override: None,
                });
            }
        }

        findings
    }
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scan_pii_email() {
        let content = "Contact us at support@example.com or admin@test.org";
        let findings = Scanner::scan(content);
        let emails: Vec<_> = findings
            .iter()
            .filter(|f| f.rule_id == "PII-EMAIL")
            .collect();
        assert_eq!(emails.len(), 2);
    }

    #[test]
    fn test_scan_auth_jwt() {
        // Mock JWT
        let content = "Here is a token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoyNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
        let findings = Scanner::scan(content);
        assert!(findings.iter().any(|f| f.rule_id == "AUTH-JWT"));
    }

    #[test]
    fn test_scan_auth_basic() {
        let content = "Authorization: Basic dXNlcjpwYXNzd29yZA==";
        let findings = Scanner::scan(content);
        assert!(findings.iter().any(|f| f.rule_id == "AUTH-BASIC"));
        let finding = findings.iter().find(|f| f.rule_id == "AUTH-BASIC").unwrap();
        assert!(finding.description.contains("user:password"));
    }

    #[test]
    fn test_scan_potential_secret() {
        let content = "api_key = AKIAIOSFODNN7EXAMPLEEXAMPLE";
        let findings = Scanner::scan(content);
        assert!(findings.iter().any(|f| f.rule_id == "INFRA-AWS-KEY"));
    }
}
