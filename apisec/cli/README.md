# APISec CLI - Headless API Security Scanner

A command-line interface for **APISec Analyst Pro** designed for CI/CD pipeline integration.

## Installation

```bash
npm install -g @apisec/cli
```

## Quick Start

```bash
# Scan a HAR file
apisec scan --input traffic.har

# Fail pipeline on critical findings
apisec scan --input api-tests.har --fail-on critical

# Export SARIF for GitHub Security
apisec scan --input burp-export.xml --sarif --output results.sarif
```

## Usage

```
apisec scan [options]

Options:
  --input <file>          Input file (HAR, Burp XML, Postman Collection)
  --format <type>         Force format: har, burp, postman, text
  --output <file>         Output file (default: stdout)
  --sarif                 Export in SARIF 2.1.0 format
  --fail-on <severity>    Exit code 1 if findings >= severity
  --workspace <name>      Workspace name (default: CI-Pipeline)
  --quiet                 Suppress progress output
```

## CI/CD Integration

### GitHub Actions

```yaml
- name: Run APISec Scan
  run: |
    npm install -g @apisec/cli
    apisec scan --input ./tests/traffic.har --sarif --output results.sarif

- name: Upload to Security Tab
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: results.sarif
```

### GitLab CI

```yaml
apisec_scan:
  script:
    - npm install -g @apisec/cli
    - apisec scan --input ./tests/traffic.har --fail-on high
  artifacts:
    reports:
      sast: apisec-report.json
```

### Jenkins

```groovy
stage('Security Scan') {
  steps {
    sh 'npm install -g @apisec/cli'
    sh 'apisec scan --input traffic.har --fail-on high'
  }
}
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0    | No vulnerabilities (or below threshold) |
| 1    | Vulnerabilities found above `--fail-on` threshold |
| 2    | Invalid arguments or file not found |
| 3    | Scanner error |

## Supported Formats

- **HAR** (HTTP Archive) - Chrome/Firefox DevTools exports
- **Burp Suite XML** - Professional/Community exports
- **Postman Collections** - v2.1 format
- **Plain Text** - Line-separated URLs

## SARIF Output

The `--sarif` flag generates [SARIF 2.1.0](https://sarifweb.azurewebsites.net/) compliant output for:
- GitHub Security Tab
- GitLab SAST Reports
- Azure DevOps
- SonarQube

## Examples

### Basic Scan
```bash
apisec scan --input api-traffic.har
```

### Pipeline Gating
```bash
# Fail build if any high/critical findings
apisec scan --input tests/e2e.har --fail-on high
```

### Quiet Mode for Logs
```bash
apisec scan --input traffic.har --quiet --output report.txt
```

### Multi-Workspace Projects
```bash
apisec scan --input staging.har --workspace staging-env
apisec scan --input prod.har --workspace production
```

## License

MIT - See LICENSE file for details
