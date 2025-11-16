const fs = require('fs');
const path = require('path');

const services = [
  'user-service',
  'market-data-service',
  'personalization-service'
];

const devDependencies = {
  eslint: '^8.57.1',
  'eslint-config-standard': '^17.1.0',
  'eslint-plugin-import': '^2.29.1',
  'eslint-plugin-n': '^16.6.2',
  'eslint-plugin-promise': '^6.1.1'
};

const scripts = {
  lint: 'eslint . --ext .js',
  'lint:check': 'eslint . --ext .js',
  'lint:fix': 'eslint . --ext .js --fix'
};

const lintScoreScript = `#!/usr/bin/env node
const { execSync } = require('child_process');

try {
  const output = execSync('npx eslint . --ext .js --format json', { encoding: 'utf8' });
  const results = JSON.parse(output);
  
  let totalErrors = 0;
  let totalWarnings = 0;
  
  results.forEach(result => {
    totalErrors += result.errorCount;
    totalWarnings += result.warningCount;
  });
  
  const score = Math.max(0, 10 - (totalErrors * 0.05) - (totalWarnings * 0.01));
  
  console.log(\`Errors: \${totalErrors}, Warnings: \${totalWarnings}, Score: \${score.toFixed(1)}/10\`);
  
  process.exit(totalErrors > 0 ? 1 : 0);
} catch (error) {
  if (error.stdout) {
    const results = JSON.parse(error.stdout);
    let totalErrors = 0;
    let totalWarnings = 0;
    
    results.forEach(result => {
      totalErrors += result.errorCount;
      totalWarnings += result.warningCount;
    });
    
    const score = Math.max(0, 10 - (totalErrors * 0.05) - (totalWarnings * 0.01));
    console.log(\`Errors: \${totalErrors}, Warnings: \${totalWarnings}, Score: \${score.toFixed(1)}/10\`);
    process.exit(1);
  }
  console.error('Lint check failed');
  process.exit(1);
}
`;

console.log('Setting up linting for backend services...\n');

services.forEach(service => {
  const packageJsonPath = path.join(__dirname, '..', service, 'package.json');
  
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    // Add scripts
    packageJson.scripts = {
      ...packageJson.scripts,
      ...scripts
    };
    
    // Add devDependencies
    packageJson.devDependencies = {
      ...packageJson.devDependencies,
      ...devDependencies
    };
    
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
    console.log(`OK: Updated ${service}/package.json`);
  } else {
    console.log(`WARN: Skipped ${service} - no package.json found`);
  }
});

console.log('\nOK: All services updated!');
console.log('\nNext steps:');
console.log('   1. Run: npm install --workspaces');
console.log('   2. Run: npm run lint');
