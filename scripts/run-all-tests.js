#!/usr/bin/env node

/**
 * Run all service tests with coverage reports
 * Usage: node scripts/run-all-tests.js
 */

const { spawn } = require('child_process');
const path = require('path');

const services = [
  'user-service',
  'market-data-service',
  'exchange-connections-service'
];

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function runTest(service) {
  return new Promise((resolve, reject) => {
    log(`\n${'='.repeat(60)}`, 'blue');
    log(`Running tests for: ${service}`, 'bright');
    log('='.repeat(60), 'blue');

    const servicePath = path.join(__dirname, '..', service);
    const testProcess = spawn('npm', ['test'], {
      cwd: servicePath,
      shell: true,
      stdio: 'inherit'
    });

    testProcess.on('close', (code) => {
      if (code === 0) {
        log(`✓ ${service} tests passed`, 'green');
        resolve({ service, success: true });
      } else {
        log(`✗ ${service} tests failed`, 'red');
        resolve({ service, success: false });
      }
    });

    testProcess.on('error', (err) => {
      log(`✗ ${service} tests error: ${err.message}`, 'red');
      resolve({ service, success: false });
    });
  });
}

async function runAllTests() {
  log('\nRunning all service tests...', 'bright');
  log(`Testing ${services.length} services\n`, 'yellow');

  const results = [];
  
  for (const service of services) {
    const result = await runTest(service);
    results.push(result);
  }

  // Summary
  log('\n' + '='.repeat(60), 'blue');
  log('Test Summary', 'bright');
  log('='.repeat(60), 'blue');

  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  results.forEach(({ service, success }) => {
    const status = success ? '✓ PASS' : '✗ FAIL';
    const color = success ? 'green' : 'red';
    log(`${status}: ${service}`, color);
  });

  log(`\nTotal: ${results.length} | Passed: ${passed} | Failed: ${failed}`, 'yellow');
  
  if (failed > 0) {
    log('\nWARN: Some tests failed. Please review the output above.', 'red');
    process.exit(1);
  } else {
    log('\n✓ All tests passed!', 'green');
    process.exit(0);
  }
}

runAllTests().catch(err => {
  log(`\nError running tests: ${err.message}`, 'red');
  process.exit(1);
});
