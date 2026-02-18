#!/bin/bash

echo "🔍 Validating Model Selection & Routing System..."
echo ""

# Check if routing files exist
echo "📁 Checking files..."
FILES=(
  "src/routing/QueryClassifier.ts"
  "src/routing/ModelRouter.ts"
  "src/routing/PerformanceTracker.ts"
  "src/routing/index.ts"
  "src/routing/README.md"
  "ROUTING_SUMMARY.md"
  "QUICK_START_ROUTING.md"
)

MISSING=0
for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "  ✅ $file"
  else
    echo "  ❌ $file (MISSING)"
    MISSING=1
  fi
done

echo ""

# Check TypeScript compilation
echo "🔨 Checking TypeScript compilation..."
npm run check-types > /tmp/ts-check.log 2>&1
if [ $? -eq 0 ]; then
  echo "  ✅ TypeScript compilation successful"
else
  echo "  ❌ TypeScript errors found"
  cat /tmp/ts-check.log
  exit 1
fi

echo ""

# Check for required exports
echo "📦 Checking exports..."
EXPORTS=(
  "QueryClassifier"
  "ModelRouter"
  "PerformanceTracker"
)

for export in "${EXPORTS[@]}"; do
  if grep -q "export.*$export" src/routing/index.ts; then
    echo "  ✅ $export"
  else
    echo "  ❌ $export (NOT EXPORTED)"
  fi
done

echo ""

# Check package.json configuration
echo "⚙️  Checking configuration..."
CONFIGS=(
  "testfire.routing.enabled"
  "testfire.routing.showDecisions"
  "testfire.routing.prioritizeSpeed"
  "testfire.routing.prioritizeCost"
)

for config in "${CONFIGS[@]}"; do
  if grep -q "\"$config\"" package.json; then
    echo "  ✅ $config"
  else
    echo "  ❌ $config (NOT CONFIGURED)"
  fi
done

echo ""

# Check AgentChatPanel integration
echo "🔗 Checking AgentChatPanel integration..."
INTEGRATIONS=(
  "ModelRouter"
  "PerformanceTracker"
  "handleListModels"
  "handleSelectModel"
  "model-selector"
)

for item in "${INTEGRATIONS[@]}"; do
  if grep -q "$item" src/ui/AgentChatPanel.ts; then
    echo "  ✅ $item"
  else
    echo "  ❌ $item (NOT INTEGRATED)"
  fi
done

echo ""

# Count lines of code
echo "📊 Code Statistics..."
echo "  QueryClassifier: $(wc -l < src/routing/QueryClassifier.ts) lines"
echo "  ModelRouter: $(wc -l < src/routing/ModelRouter.ts) lines"
echo "  PerformanceTracker: $(wc -l < src/routing/PerformanceTracker.ts) lines"
echo "  README: $(wc -l < src/routing/README.md) lines"
echo "  Total: $(($(wc -l < src/routing/QueryClassifier.ts) + $(wc -l < src/routing/ModelRouter.ts) + $(wc -l < src/routing/PerformanceTracker.ts))) lines of code"

echo ""

# Final summary
if [ $MISSING -eq 0 ]; then
  echo "✨ All validation checks passed!"
  echo ""
  echo "Next steps:"
  echo "  1. npm run compile"
  echo "  2. Open VS Code and test the chat panel"
  echo "  3. Try different query types"
  echo "  4. Check the model selector in the header"
  exit 0
else
  echo "❌ Validation failed - missing files"
  exit 1
fi
