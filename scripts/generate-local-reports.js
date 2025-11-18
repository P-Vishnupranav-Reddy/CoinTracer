#!/usr/bin/env node

/**
 * Local Report Generation Script
 * 
 * Generates a consolidated reports/ directory locally with all test results,
 * coverage reports, and build artifacts - matching the structure used in CI/CD.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.join(__dirname, '..', 'reports');

const SERVICES = [
  { name: 'user-service', testCmd: 'npm test -- --coverage --passWithNoTests' },
  { name: 'exchange-connections-service', testCmd: 'npm test -- --coverage --passWithNoTests' },
  { name: 'market-data-service', testCmd: 'npm test -- --coverage --passWithNoTests' },
  { name: 'personalization-service', testCmd: 'npm test -- --coverage --passWithNoTests' },
  { name: 'alerts-service', testCmd: 'npm test -- --coverage --passWithNoTests' }
];

function log(message, type = 'info') {
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    error: '\x1b[31m',
    warn: '\x1b[33m'
  };
  const reset = '\x1b[0m';
  console.log(`${colors[type]}${message}${reset}`);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    return false;
  }
  
  ensureDir(dest);
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
  
  return true;
}

function runLinting() {
  log('\nRunning linting...', 'info');
  
  try {
    const lintOutput = execSync('npm run lint', { 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    const lintDir = path.join(REPORTS_DIR, 'lint');
    ensureDir(lintDir);
    
    fs.writeFileSync(
      path.join(lintDir, 'lint-report.txt'),
      lintOutput
    );
    
    log('Linting completed', 'success');
    return true;
  } catch (error) {
    log(`WARNING: Linting failed: ${error.message}`, 'warn');
    
    const lintDir = path.join(REPORTS_DIR, 'lint');
    ensureDir(lintDir);
    
    fs.writeFileSync(
      path.join(lintDir, 'lint-report.txt'),
      error.stdout || error.message
    );
    
    return false;
  }
}

function runServiceTests() {
  log('\nRunning service tests...', 'info');
  
  const results = [];
  
  for (const service of SERVICES) {
    log(`\n  Testing ${service.name}...`, 'info');
    
    const serviceDir = path.join(__dirname, '..', service.name);
    
    if (!fs.existsSync(serviceDir)) {
      log(`  WARNING: ${service.name} directory not found, skipping`, 'warn');
      continue;
    }
    
    try {
      execSync(service.testCmd, {
        cwd: serviceDir,
        encoding: 'utf8',
        stdio: 'pipe'
      });
      
      const coverageDir = path.join(serviceDir, 'coverage');
      const destDir = path.join(REPORTS_DIR, service.name, 'coverage');
      
      if (copyDir(coverageDir, destDir)) {
        log(`  ${service.name} tests passed, coverage saved`, 'success');
        results.push({ service: service.name, status: 'passed' });
      } else {
        log(`  WARNING: ${service.name} tests passed, but no coverage found`, 'warn');
        results.push({ service: service.name, status: 'passed-no-coverage' });
      }
    } catch (error) {
      log(`  ERROR: ${service.name} tests failed`, 'error');
      results.push({ service: service.name, status: 'failed' });
      
      // Still try to copy coverage if it exists
      const coverageDir = path.join(serviceDir, 'coverage');
      const destDir = path.join(REPORTS_DIR, service.name, 'coverage');
      copyDir(coverageDir, destDir);
    }
  }
  
  return results;
}

function buildFrontend() {
  log('\nBuilding frontend...', 'info');
  
  const frontendDir = path.join(__dirname, '..', 'frontend');
  
  if (!fs.existsSync(frontendDir)) {
    log('WARNING: Frontend directory not found, skipping', 'warn');
    return false;
  }
  
  try {
    execSync('npm run build', {
      cwd: frontendDir,
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    const distDir = path.join(frontendDir, 'dist');
    const destDir = path.join(REPORTS_DIR, 'frontend', 'build');
    
    if (copyDir(distDir, destDir)) {
      log('Frontend built successfully', 'success');
      return true;
    } else {
      log('WARNING: Frontend build succeeded, but dist directory not found', 'warn');
      return false;
    }
  } catch (error) {
    log(`ERROR: Frontend build failed: ${error.message}`, 'error');
    return false;
  }
}

function generateSummary(testResults) {
  log('\nGenerating summary...', 'info');
  
  const summary = [];
  
  summary.push('# Test Reports Summary\n');
  summary.push('This directory contains all test results, coverage reports, and build artifacts.\n');
  summary.push('## Generation Information\n');
  summary.push(`- **Generated**: ${new Date().toISOString()}`);
  summary.push(`- **Platform**: Local development`);
  summary.push(`- **Script**: scripts/generate-local-reports.js\n`);
  summary.push('## Test Results\n');
  summary.push('| Service | Status |');
  summary.push('|---------|--------|');
  
  for (const result of testResults) {
    const statusText = result.status === 'passed' ? 'PASSED' : 
                       result.status === 'passed-no-coverage' ? 'PASSED (no coverage)' : 'FAILED';
    summary.push(`| ${result.service} | ${statusText} |`);
  }
  
  summary.push('\n## Directory Structure\n');
  summary.push('```');
  summary.push('reports/');
  summary.push('├── README.md           # This file');
  summary.push('├── lint/              # Linting results');
  
  for (const service of SERVICES) {
    summary.push(`├── ${service.name}/`);
    summary.push(`│   └── coverage/      # Test coverage`);
  }
  
  summary.push('└── frontend/');
  summary.push('    └── build/         # Production build');
  summary.push('```\n');
  summary.push('## Viewing Coverage\n');
  summary.push('To view HTML coverage reports:\n');
  summary.push('### Windows');
  summary.push('```cmd');
  summary.push('cd reports\\{service-name}\\coverage\\lcov-report');
  summary.push('start index.html');
  summary.push('```\n');
  summary.push('### macOS/Linux');
  summary.push('```bash');
  summary.push('cd reports/{service-name}/coverage/lcov-report');
  summary.push('open index.html  # macOS');
  summary.push('xdg-open index.html  # Linux');
  summary.push('```\n');
  
  fs.writeFileSync(
    path.join(REPORTS_DIR, 'README.md'),
    summary.join('\n')
  );
  
  log('Summary generated', 'success');
}

function main() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('   CoinTracer Local Report Generator');
  console.log('═══════════════════════════════════════════════════════\n');
  
  log('Creating reports directory...', 'info');
  ensureDir(REPORTS_DIR);
  
  // Run all checks
  runLinting();
  const testResults = runServiceTests();
  buildFrontend();
  generateSummary(testResults);
  
  console.log('\n═══════════════════════════════════════════════════════');
  log(`\nReports generated successfully!`, 'success');
  log(`Location: ${REPORTS_DIR}`, 'info');
  log(`See ${path.join(REPORTS_DIR, 'README.md')} for details\n`, 'info');
  
  // Summary stats
  const passed = testResults.filter(r => r.status === 'passed').length;
  const failed = testResults.filter(r => r.status === 'failed').length;
  const total = testResults.length;
  
  log(`Test Summary: ${passed}/${total} passed, ${failed}/${total} failed\n`, 
      failed > 0 ? 'warn' : 'success');
}

// Run if called directly
if (require.main === module) {
  try {
    main();
  } catch (error) {
    log(`\nFATAL ERROR: ${error.message}`, 'error');
    process.exit(1);
  }
}

module.exports = { main };
