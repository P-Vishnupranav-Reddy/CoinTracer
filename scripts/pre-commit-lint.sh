#!/bin/bash

echo "🔍 Running pre-commit lint check..."

# Run lint check
npm run lint:score

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Linting failed! Please fix the errors before committing."
    echo "💡 Tip: Run 'npm run lint:fix' to auto-fix some issues."
    echo ""
    exit 1
fi

echo "✅ All lint checks passed!"
exit 0
