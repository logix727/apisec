#!/usr/bin/env node

/**
 * APISec Analyst Pro - CLI Scanner
 * Headless security scanning for CI/CD pipelines
 * Usage: apisec scan --input <file> [options]
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const VERSION = '1.0.0';

// Parse CLI arguments
const args = process.argv.slice(2);
const command = args[0];

function printHelp() {
    console.log(`
APISec Analyst Pro CLI v${VERSION}
Headless API Security Scanner for CI/CD Pipelines

USAGE:
    apisec <command> [options]

COMMANDS:
    scan        Scan API traffic for security vulnerabilities
    version     Print version information
    help        Show this help message

SCAN OPTIONS:
    --input <file>          Input file (HAR, Burp XML, Postman Collection)
    --format <type>         Input format: har, burp, postman, text (auto-detected if omitted)
    --output <file>         Output file for results (default: stdout)
    --sarif                 Export results in SARIF format for GitHub Security
    --fail-on <severity>    Exit with code 1 if findings >= severity (critical, high, medium, low)
    --workspace <name>      Workspace to use (default: CI-Pipeline)
    --quiet                 Suppress progress output

EXAMPLES:
    # Scan a HAR file and fail on critical findings
    apisec scan --input traffic.har --fail-on critical

    # Export SARIF for GitHub Security tab
    apisec scan --input burp-export.xml --sarif --output results.sarif

    # Scan Postman collection in quiet mode
    apisec scan --input api-tests.json --format postman --quiet

EXIT CODES:
    0    No vulnerabilities found (or below --fail-on threshold)
    1    Vulnerabilities found above threshold
    2    Invalid arguments or file not found
    3    Scanner error
`);
}

function parseArgs(args) {
    const options = {
        input: null,
        format: null,
        output: null,
        sarif: false,
        failOn: null,
        workspace: 'CI-Pipeline',
        quiet: false
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        switch (arg) {
            case '--input':
                options.input = args[++i];
                break;
            case '--format':
                options.format = args[++i];
                break;
            case '--output':
                options.output = args[++i];
                break;
            case '--sarif':
                options.sarif = true;
                break;
            case '--fail-on':
                options.failOn = args[++i];
                break;
            case '--workspace':
                options.workspace = args[++i];
                break;
            case '--quiet':
                options.quiet = true;
                break;
        }
    }

    return options;
}

function detectFormat(filename) {
    const ext = path.extname(filename).toLowerCase();
    if (ext === '.har') return 'har';
    if (ext === '.xml') return 'burp';
    if (ext === '.json') {
        // Try to detect Postman vs HAR
        const content = fs.readFileSync(filename, 'utf8');
        if (content.includes('"info"') && content.includes('"item"')) return 'postman';
        if (content.includes('"log"') && content.includes('"entries"')) return 'har';
    }
    return 'text';
}

async function runScan(options) {
    if (!options.input) {
        console.error('Error: --input is required');
        process.exit(2);
    }

    if (!fs.existsSync(options.input)) {
        console.error(`Error: File not found: ${options.input}`);
        process.exit(2);
    }

    const format = options.format || detectFormat(options.input);

    if (!options.quiet) {
        console.log(`🔍 APISec CLI Scanner v${VERSION}`);
        console.log(`📁 Input: ${options.input}`);
        console.log(`📋 Format: ${format}`);
        console.log(`🏢 Workspace: ${options.workspace}`);
        console.log('');
    }

    // Read file content
    const content = fs.readFileSync(options.input, 'utf8');

    // Mock scan results (in production, this would call the Tauri backend)
    const results = mockScan(content, format);

    // Generate output
    if (options.sarif) {
        const sarif = generateSARIF(results, options.input);
        if (options.output) {
            fs.writeFileSync(options.output, JSON.stringify(sarif, null, 2));
            if (!options.quiet) console.log(`✅ SARIF report written to ${options.output}`);
        } else {
            console.log(JSON.stringify(sarif, null, 2));
        }
    } else {
        const report = generateTextReport(results);
        if (options.output) {
            fs.writeFileSync(options.output, report);
            if (!options.quiet) console.log(`✅ Report written to ${options.output}`);
        } else {
            console.log(report);
        }
    }

    // Check fail threshold
    if (options.failOn) {
        const severityLevels = { critical: 4, high: 3, medium: 2, low: 1 };
        const threshold = severityLevels[options.failOn.toLowerCase()] || 0;

        const criticalCount = results.findings.filter(f => severityLevels[f.severity.toLowerCase()] >= threshold).length;

        if (criticalCount > 0) {
            if (!options.quiet) {
                console.error(`\n❌ Found ${criticalCount} findings at or above '${options.failOn}' severity`);
            }
            process.exit(1);
        }
    }

    if (!options.quiet) {
        console.log('\n✅ Scan complete');
    }
    process.exit(0);
}

function mockScan(content, format) {
    // This is a mock - in production, this would invoke the Tauri backend
    return {
        scannedAt: new Date().toISOString(),
        format,
        assetsScanned: 12,
        findings: [
            {
                id: 1,
                name: 'JWT Secret Exposure',
                severity: 'Critical',
                description: 'Hardcoded JWT secret detected in response',
                location: 'https://api.example.com/auth/login',
                evidence: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
            },
            {
                id: 2,
                name: 'AWS Access Key Leak',
                severity: 'High',
                description: 'AWS credentials exposed in API response',
                location: 'https://api.example.com/config',
                evidence: 'AKIA...'
            }
        ]
    };
}

function generateTextReport(results) {
    let report = `APISec Security Scan Report\n`;
    report += `Generated: ${results.scannedAt}\n`;
    report += `Assets Scanned: ${results.assetsScanned}\n`;
    report += `Findings: ${results.findings.length}\n`;
    report += `\n${'='.repeat(80)}\n\n`;

    results.findings.forEach((finding, i) => {
        report += `[${i + 1}] ${finding.name} [${finding.severity}]\n`;
        report += `    Location: ${finding.location}\n`;
        report += `    Description: ${finding.description}\n`;
        report += `    Evidence: ${finding.evidence.substring(0, 100)}...\n`;
        report += `\n`;
    });

    return report;
}

function generateSARIF(results, inputFile) {
    return {
        version: '2.1.0',
        $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
        runs: [{
            tool: {
                driver: {
                    name: 'APISec Analyst Pro',
                    version: VERSION,
                    informationUri: 'https://github.com/apisec-pro/apisec'
                }
            },
            results: results.findings.map(f => ({
                ruleId: f.name.replace(/\s+/g, '-').toLowerCase(),
                level: f.severity.toLowerCase() === 'critical' ? 'error' : 'warning',
                message: {
                    text: f.description
                },
                locations: [{
                    physicalLocation: {
                        artifactLocation: {
                            uri: inputFile
                        },
                        region: {
                            snippet: {
                                text: f.evidence
                            }
                        }
                    }
                }]
            }))
        }]
    };
}

// Main execution
if (command === 'scan') {
    const options = parseArgs(args.slice(1));
    runScan(options);
} else if (command === 'version') {
    console.log(`APISec Analyst Pro CLI v${VERSION}`);
} else if (command === 'help' || !command) {
    printHelp();
} else {
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(2);
}
