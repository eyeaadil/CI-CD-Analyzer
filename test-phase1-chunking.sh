#!/bin/bash

# Phase 1 Test Script - Smart Chunking
echo "🧪 Testing Phase 1: Smart Log Chunking"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test log sample with multiple steps
TEST_LOG='##[group]Set up job
Current runner version: '\''2.311.0'\''
Operating System:
  Ubuntu 22.04.3
##[endgroup]
##[group]Build Application
Run npm install
npm WARN deprecated package@1.0.0
npm ERR! Cannot find module '\''react'\''
npm ERR! A complete log of this run can be found in:
npm ERR!     /home/runner/.npm/_logs/2024-01-01-debug.log
##[endgroup]
##[group]Run Tests
Run npm test
Test suite failed to run:
AssertionError: expected 5 to equal 6
    at Object.\u003canonymous\u003e (test.js:10:20)
##[endgroup]
Post Build Application
Error: exit code 1
'

echo "📝 Test Log (with GitHub Actions markers):"
echo "$TEST_LOG"
echo ""

# Create test endpoint
echo "1️⃣  Testing log parser directly..."

# Test with curl to analyze endpoint
RESPONSE=$(curl -s -X POST http://localhost:3001/api/analyze \
  -H "Content-Type: text/plain" \
  -d "$TEST_LOG")

if [ $? -eq 0 ]; then
    echo "✅ API responded successfully"
    echo ""
    echo "Response:"
    echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
else
    echo "❌ API request failed"
    exit 1
fi

echo ""
echo "2️⃣  Check database for chunks..."
echo "Run: npm run prisma:studio"
echo "Then check the 'LogChunk' table"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Phase 1 Test Complete!"
echo ""
echo "Expected results:"
echo "✅ Multiple chunks detected (one per ##[group])"
echo "✅ Errors detected in chunks"
echo "✅ Step names extracted (e.g., 'Build Application', 'Run Tests')"
echo "✅ Token counts calculated"
echo ""
echo "Next: Check Prisma Studio to verify chunks were saved!"
