# APISec Analyst Pro

APISec Analyst Pro is a high-performance security reconnaissance and passive ingestion workbench designed for API security analysts. It leverages a powerful Rust core (Tauri) and a fluid, expressive React frontend to provide real-time insights into API attack surfaces.

## 🚀 Key Features

- **Passive Traffic Ingestion**: Monitor your clipboard or drop files for instant security analysis.
- **Live Proxy Server**: Intercept HTTP/WS traffic in real-time with automated security scanning and body capture.
- **Attack Mesh Visualizer**: Interactive D3-style force-directed graph of your API infrastructure and risk clusters.
- **Network Reconnaissance**: Active subdomain discovery and infrastructure mapping for target domains.
- **AI Triage Assistant**: Leverage local LLMs (Ollama) for automated vulnerability assessment and remediation guidance.
- **Multi-Format Support**:
  - **HAR Files**: Detailed HTTP Archive parsing with request/response body inspection.
  - **Burp Suite XML**: Seamlessly import native Burp exports.
  - **Postman Collections**: Ingest and audit documented API surfaces (v2.1).
  - **Excel/Logs**: Automated extraction of URLs and secrets from unstructured data.
- **Intercept Workstation**: Active request and response trapping with manual modification capabilities.
- **History & Version Tracking**: Automatically record and diff API response changes over time.
- **Advanced Technical Reporting**: Generate professional executive PDF reports with posture scoring and remediation priorities.
- **Smart Filtering DSL**: Query your attack surface with a powerful key-value search syntax (e.g., `findings:>0 method:POST`).
- **Security Posture Analytics**: Real-time "Surface Score" and vector analysis across the entire workspace.
- **OWASP Top 10 Signatures**: Expanded detection for BOLA, Mass Assignment, SSRF, and injection flaws.
- **Bulk Actions**: Batch tagging and cleanup for large-scale reconnaissance datasets.
- **Asset Inventory**: Centralized repository of all discovered endpoints with integrated traffic inspector and history diffing.
- **Adaptive UI**: Premium experience with full Dark/Light mode support and glassmorphism aesthetics.

## 🛠 Tech Stack

- **Backend**: Rust, Tauri, SQLite (sqlx)
- **Frontend**: React, TypeScript, Tailwind CSS, Lucide React
- **Build Tool**: Vite

## 🏃 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/)
- [Rust](https://rustup.rs/)

### Installation
1. Install dependencies:
   ```bash
   npm install
   ```

2. Run in development mode:
   ```bash
   npm run tauri dev
   ```

3. Build for production:
   ```bash
   npm run tauri build
   ```

## 📈 Roadmap

See [roadmap.md](./roadmap.md) for the 2-year development vision.

---
Built with ❤️ for the security community.
