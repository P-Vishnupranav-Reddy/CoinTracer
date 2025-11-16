const fs = require('fs');
const path = require('path');

const hookScript = `#!/bin/bash
./scripts/pre-commit-lint.sh
`;

const hookPath = path.join(__dirname, '..', '.git', 'hooks', 'pre-commit');
const gitDir = path.join(__dirname, '..', '.git');

try {
  if (!fs.existsSync(gitDir)) {
    console.log('WARN: Not a git repository - skipping hook installation');
    process.exit(0);
  }

  const hooksDir = path.join(gitDir, 'hooks');
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  fs.writeFileSync(hookPath, hookScript, { mode: 0o755 });
  console.log('OK: Pre-commit hook installed successfully!');
  console.log('   Linting will run automatically before each commit.');
} catch (error) {
  console.error('WARN: Could not install pre-commit hook:', error.message);
  console.log('   You can still run "npm run lint" manually before committing.');
}
