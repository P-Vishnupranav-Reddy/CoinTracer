#!/usr/bin/env node
/**
 * Global Linting Script with Scoring System
 * Runs ESLint across all services and calculates quality scores
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m'
};

// Services to lint
const services = [
  { name: 'Frontend', path: 'frontend', type: 'react' },
  { name: 'User Service', path: 'user-service', type: 'node' },
  { name: 'Market Data Service', path: 'market-data-service', type: 'node' },
  { name: 'Exchange Connections Service', path: 'exchange-connections-service', type: 'node' },
  { name: 'Personalization Service', path: 'personalization-service', type: 'node' }
];

// Scoring configuration with -0.1 per error and -0.5 per warning
const SCORE_CONFIG = {
  maxScore: 10,
  errorPenalty: 0.1,  // -0.1 points per error
  warningPenalty: 0.5 // -0.5 points per warning
};

function calculateScore(errors, warnings) {
  const totalPenalty = (errors * SCORE_CONFIG.errorPenalty) + (warnings * SCORE_CONFIG.warningPenalty);
  const score = Math.max(0, SCORE_CONFIG.maxScore - totalPenalty);
  return Math.round(score * 10) / 10;
}

function getScoreRating(score) {
  if (score === 10) return { badge: '[PERFECT]', text: 'PERFECT', color: colors.green };
  if (score >= 9) return { badge: '[EXCELLENT]', text: 'EXCELLENT', color: colors.green };
  if (score >= 7) return { badge: '[GOOD]', text: 'GOOD', color: colors.cyan };
  if (score >= 5) return { badge: '[FAIR]', text: 'FAIR', color: colors.yellow };
  return { badge: '[NEEDS IMPROVEMENT]', text: 'NEEDS IMPROVEMENT', color: colors.red };
}

function lintService(service, fix = false) {
  const servicePath = path.join(__dirname, '..', service.path);
  
  // Check if service has package.json
  const packageJsonPath = path.join(servicePath, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return { name: service.name, skipped: true, reason: 'No package.json found' };
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const lintScript = fix ? 'lint:fix' : 'lint:check';
  
  if (!packageJson.scripts || !packageJson.scripts[lintScript]) {
    return { name: service.name, skipped: true, reason: `No ${lintScript} script found` };
  }

  console.log(`\n${colors.bright}${colors.cyan}Linting ${service.name}...${colors.reset}`);
  
  try {
    const command = `npm run ${lintScript} --prefix ${service.path}`;
    const output = execSync(command, { encoding: 'utf8', stdio: 'pipe' });
    
    // Parse output for errors and warnings
    const errorMatch = output.match(/(\d+)\s+error/);
    const warningMatch = output.match(/(\d+)\s+warning/);
    
    const errors = errorMatch ? parseInt(errorMatch[1]) : 0;
    const warnings = warningMatch ? parseInt(warningMatch[1]) : 0;
    const score = calculateScore(errors, warnings);
    const rating = getScoreRating(score);

    return {
      name: service.name,
      errors,
      warnings,
      score,
      rating,
      success: errors === 0
    };
  } catch (error) {
    // ESLint exits with code 1 if there are errors
    const output = error.stdout || error.stderr || '';
    const errorMatch = output.match(/(\d+)\s+error/);
    const warningMatch = output.match(/(\d+)\s+warning/);
    
    const errors = errorMatch ? parseInt(errorMatch[1]) : 0;
    const warnings = warningMatch ? parseInt(warningMatch[1]) : 0;
    const score = calculateScore(errors, warnings);
    const rating = getScoreRating(score);

    return {
      name: service.name,
      errors,
      warnings,
      score,
      rating,
      success: false,
      output: output
    };
  }
}

function printSummary(results) {
  console.log(`\n${colors.bright}${colors.blue}${'='.repeat(80)}${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}                        GLOBAL LINTING SUMMARY${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}${'='.repeat(80)}${colors.reset}\n`);

  const maxNameLength = Math.max(...results.map(r => r.name.length));
  
  results.forEach(result => {
    if (result.skipped) {
      console.log(
        `${result.name.padEnd(maxNameLength)} | ${colors.yellow}SKIPPED${colors.reset} - ${result.reason}`
      );
    } else {
      const { badge, text, color } = result.rating;
      const scoreDisplay = `${color}${result.score.toFixed(1)}/10${colors.reset}`;
      const ratingDisplay = `${color}${badge} ${text}${colors.reset}`;
      
      console.log(
        `${result.name.padEnd(maxNameLength)} | Score: ${scoreDisplay} | ${ratingDisplay}`
      );
      
      const errColor = result.errors === 0 ? colors.green : colors.red;
      const warnColor = result.warnings === 0 ? colors.green : colors.yellow;
      
      console.log(
        `${' '.repeat(maxNameLength)} | Errors: ${errColor}${result.errors}${colors.reset}, ` +
        `Warnings: ${warnColor}${result.warnings}${colors.reset}`
      );
      console.log();
    }
  });

  // Calculate overall statistics
  const lintedServices = results.filter(r => !r.skipped);
  const totalErrors = lintedServices.reduce((sum, r) => sum + r.errors, 0);
  const totalWarnings = lintedServices.reduce((sum, r) => sum + r.warnings, 0);
  const averageScore = lintedServices.length > 0
    ? lintedServices.reduce((sum, r) => sum + r.score, 0) / lintedServices.length
    : 0;
  const overallRating = getScoreRating(averageScore);

  console.log(`${colors.bright}${colors.blue}${'='.repeat(80)}${colors.reset}`);
  console.log(`${colors.bright}Overall Statistics:${colors.reset}`);
  console.log(`  Services Linted: ${lintedServices.length}/${results.length}`);
  console.log(`  Total Errors: ${totalErrors === 0 ? colors.green : colors.red}${totalErrors}${colors.reset}`);
  console.log(`  Total Warnings: ${totalWarnings === 0 ? colors.green : colors.yellow}${totalWarnings}${colors.reset}`);
  console.log(`  Average Score: ${overallRating.color}${averageScore.toFixed(1)}/10 ${overallRating.badge} ${overallRating.text}${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}${'='.repeat(80)}${colors.reset}\n`);

  // Output parseable summary for CI/CD
  console.log(`Average Score: ${averageScore.toFixed(1)}`);
  console.log(`Total Errors: ${totalErrors}`);
  console.log(`Total Warnings: ${totalWarnings}`);

  // Recommendations
  if (totalErrors === 0 && totalWarnings === 0) {
    console.log(`${colors.green}${colors.bright}Perfect! All services passed with no issues!${colors.reset}\n`);
  } else if (totalErrors === 0) {
    console.log(`${colors.cyan}${colors.bright}Good! No errors, but ${totalWarnings} warning(s) to address.${colors.reset}\n`);
  } else {
    console.log(`${colors.red}${colors.bright}Found ${totalErrors} error(s) and ${totalWarnings} warning(s).${colors.reset}`);
    console.log(`${colors.yellow}TIP: Run 'npm run lint:fix' to auto-fix many issues.${colors.reset}\n`);
  }

  // Exit with error if there are any errors
  if (totalErrors > 0) {
    process.exit(1);
  }
}

function main() {
  const args = process.argv.slice(2);
  const fix = args.includes('--fix');
  const scoreOnly = args.includes('--score');

  console.log(`${colors.bright}${colors.blue}Starting Global Lint Check...${colors.reset}`);
  console.log(`Mode: ${fix ? 'Fix' : 'Check'}\n`);

  const results = services.map(service => lintService(service, fix));

  printSummary(results);
}

main();
