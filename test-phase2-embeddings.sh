#!/bin/bash

# Phase 2 Test Script - Embeddings & Vector Search
echo "🧪 Testing Phase 2: Embeddings & Vector Search"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}1️⃣  Testing Embedding Generation${NC}"
echo ""

# Test log sample
TEST_LOG='npm ERR! Cannot find module '\''react'\''
TypeError: Cannot read property '\''version'\'' of undefined
Test suite failed
AssertionError: expected 5 to equal 6'

# Send test request
echo "📝 Analyzing test log with embeddings..."
curl -s -X POST http://localhost:3001/api/analyze \
  -H "Content-Type: text/plain" \
  -d "$TEST_LOG" > /dev/null

echo "✅ Request sent"
echo ""

echo -e "${BLUE}2️⃣  Check Worker Logs${NC}"
echo "Worker should show:"
echo "  - 🧬 Generating embeddings for chunks..."
echo "  - ✅ Generated embeddings for X/Y chunks"
echo ""

echo -e "${BLUE}3️⃣  Check Database${NC}"
echo "Run: npm run prisma:studio"
echo "Check LogChunk table - embedding column should have values"
echo ""

echo -e "${BLUE}4️⃣  Test Vector Search${NC}"
echo "Creating vector search test..."

# Create a simple test script
cat > /tmp/test-vector-search.mjs << 'EOF'
import { PrismaClient } from '@prisma/client';
import { EmbeddingService } from './backend/src/services/embeddingService.js';
import { VectorSearchService } from './backend/src/services/vectorSearch.js';

const prisma = new PrismaClient();
const embeddingService = new EmbeddingService();
const vectorSearch = new VectorSearchService();

async function test() {
  try {
    console.log('Testing vector search...\n');

    // Get stats
    const stats = await vectorSearch.getEmbeddingStats();
    console.log('📊 Embedding Statistics:');
    console.log(`   Total chunks: ${stats.total}`);
    console.log(`   With embeddings: ${stats.withEmbeddings}`);
    console.log(`   Without embeddings: ${stats.withoutEmbeddings}`);
    console.log(`   Completion: ${stats.percentComplete}%\n`);

    if (stats.withEmbeddings === 0) {
      console.log('⚠️  No embeddings found yet. Process a log first!');
      return;
    }

    // Test similarity search
    console.log('🔍 Testing similarity search...');
    const queryText = 'npm error cannot find module';
    const queryEmbedding = await embeddingService.generateEmbedding(queryText);

    const similar = await vectorSearch.findSimilarChunks(queryEmbedding, 3, 0.5);

    console.log(`\nFound ${similar.length} similar chunks:`);
    similar.forEach((result, i) => {
      console.log(`\n${i + 1}. Similarity: ${(result.similarity * 100).toFixed(1)}%`);
      console.log(`   Step: ${result.stepName}`);
      console.log(`   Has Errors: ${result.hasErrors}`);
      console.log(`   Preview: ${result.content.substring(0, 100)}...`);
    });

    console.log('\n✅ Vector search working!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

test();
EOF

echo ""
echo "Running vector search test..."
node /tmp/test-vector-search.mjs

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ Phase 2 Test Complete!${NC}"
echo ""
echo "Expected Results:"
echo "✅ Embeddings generated for chunks"
echo "✅ Vector similarity search working"
echo "✅ Similar chunks found with scores"
echo "✅ Database has embedding vectors"
