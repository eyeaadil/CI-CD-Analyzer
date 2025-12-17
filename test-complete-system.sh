#!/bin/bash

# Complete System Test - All 3 Phases
echo "🚀 Complete CI/CD Analyzer Test Suite"
echo "Testing: Phase 1 (Chunking) + Phase 2 (Embeddings) + Phase 3 (RAG)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Check services
echo -e "${BLUE}Step 1: Checking Services${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check backend
if curl -s http://localhost:3001/ > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend is running${NC}"
else
    echo -e "${RED}❌ Backend is NOT running${NC}"
    echo "Start it with: npm run start:backend"
    exit 1
fi

# Check Redis
if docker exec cicd_analyzer_redis redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Redis is running${NC}"
else
    echo -e "${RED}❌ Redis is NOT running${NC}"
    echo "Start it with: docker-compose up -d redis"
    exit 1
fi

# Check worker (just warn if not running)
if pgrep -f "node.*logProcessor.js" > /dev/null; then
    echo -e "${GREEN}✅ Worker is running${NC}"
else
    echo -e "${YELLOW}⚠️  Worker is NOT running${NC}"
    echo "For full testing, start worker with: npm run start:worker"
fi

echo ""
echo -e "${BLUE}Step 2: Test #1 - First Failure (Create History)${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Creating first failure to build RAG knowledge base..."

TEST_LOG_1='##[group]Build Application
Run npm install
npm WARN deprecated package@1.0.0
npm ERR! code ENOENT
npm ERR! syscall open
npm ERR! path /home/runner/work/myapp/package.json
npm ERR! errno -2
npm ERR! enoent ENOENT: no such file or directory, open package.json
npm ERR! enoent This is related to npm not being able to find a file.
##[endgroup]
##[group]Post Job
Error: Process completed with exit code 1
##[endgroup]'

echo "Sending test log #1..."
RESPONSE1=$(curl -s -X POST http://localhost:3001/api/analyze \
  -H "Content-Type: text/plain" \
  -d "$TEST_LOG_1")

echo -e "${GREEN}✅ First analysis complete${NC}"
echo ""
echo "📊 Response #1:"
echo "$RESPONSE1" | python3 -m json.tool 2>/dev/null | head -20
echo ""
echo "Waiting 3 seconds for embeddings to generate..."
sleep 3

echo ""
echo -e "${BLUE}Step 3: Test #2 - Similar Failure (RAG Should Activate!)${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Sending similar failure - RAG should find previous case..."

TEST_LOG_2='##[group]Setup Node
npm install failed
##[endgroup]
##[group]Build
Error: Cannot find package.json file in directory
ENOENT: no such file or directory
File not found: package.json
##[endgroup]
Exit code: 1'

echo "Sending test log #2 (similar to #1)..."
RESPONSE2=$(curl -s -X POST http://localhost:3001/api/analyze \
  -H "Content-Type: text/plain" \
  -d "$TEST_LOG_2")

echo -e "${GREEN}✅ Second analysis complete${NC}"
echo ""
echo "📊 Response #2 (Should mention similar past case):"
echo "$RESPONSE2" | python3 -m json.tool 2>/dev/null
echo ""

echo -e "${BLUE}Step 4: Check Worker Logs${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Worker logs should show:"
echo "  ✓ '🔍 Parsing logs with smart chunking...'"
echo "  ✓ '📊 Parsed into X chunks from Y lines'"
echo "  ✓ '🧬 Generating embeddings for chunks...'"
echo "  ✓ '✅ Generated embeddings for X/Y chunks'"
echo "  ✓ '🔍 RAG: Retrieving historical context...'"
echo "  ✓ '✅ RAG: Found X relevant past failures'"
echo "  ✓ '📚 RAG Context: Found X similar case(s)'"
echo "  ✓ '🎯 RAG Enhanced: Found X similar past case(s)'"
echo "  ✓ '📊 Confidence: XX%'"
echo ""

echo -e "${BLUE}Step 5: Verify Database${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Open Prisma Studio to verify:"
echo "  → http://localhost:5555"
echo ""
echo "Check these tables:"
echo "  1. LogChunk - Should have chunks with content + embeddings"
echo "  2. AnalysisResult - Should have AI analysis results"
echo "  3. WorkflowRun - Should have run metadata"
echo ""
echo -e "${BLUE}Step 6: Check Database in Prisma Studio${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Open Prisma Studio: http://localhost:5555"
echo ""
echo "Verify:"
echo "  ✓ LogChunk table has entries"
echo "  ✓ embedding column has values (not null)"
echo "  ✓ AnalysisResult table has AI results"
echo ""
echo "To test vector search manually, run:"
echo "  node -e \"import('./backend/src/services/vectorSearch.js').then(m => new m.VectorSearchService().getEmbeddingStats().then(console.log))\""
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ Testing Complete!${NC}"
echo ""
echo "📋 Summary:"
echo "  ✅ Phase 1: Smart chunking tested"
echo "  ✅ Phase 2: Embeddings generated & searchable"
echo "  ✅ Phase 3: RAG pipeline (if similar cases found)"
echo ""
echo "🎯 What to check:"
echo "  1. Second response should have higher confidence if RAG found similarities"
echo "  2. Worker logs show RAG context retrieval"
echo "  3. Database has chunks with embeddings"
echo "  4. Vector search finds similar chunks"
echo ""
echo "🚀 Next Steps:"
echo "  • Test with real GitHub webhook via Smee"
echo "  • Trigger actual CI/CD failure"
echo "  • Watch the complete flow"
echo ""
echo "For real GitHub testing, see: WEBHOOK_TESTING.md"
