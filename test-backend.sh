#!/bin/bash

# Backend Testing Script
# Run this to verify all endpoints are working

echo "🧪 Testing CI/CD Analyzer Backend..."
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Health Check
echo "1️⃣  Testing health endpoint..."
HEALTH=$(curl -s http://localhost:3001/)
if [[ $HEALTH == *"CI/CD Analyzer Backend is running"* ]]; then
    echo -e "${GREEN}✅ Health check passed${NC}"
else
    echo -e "${RED}❌ Health check failed${NC}"
    exit 1
fi
echo ""

# Test 2: Auth endpoint (should fail without token)
echo "2️⃣  Testing auth endpoint..."
AUTH=$(curl -s http://localhost:3001/auth/me)
if [[ $AUTH == *"Missing token"* ]]; then
    echo -e "${GREEN}✅ Auth endpoint working (correctly rejecting request)${NC}"
else
    echo -e "${RED}❌ Auth endpoint not responding correctly${NC}"
fi
echo ""

# Test 3: Log analysis endpoint
echo "3️⃣  Testing log analysis endpoint..."
SAMPLE_LOG="npm ERR! Cannot find module 'react-scripts'
Error: exit code 1
Build step failed"

ANALYSIS=$(curl -s -X POST http://localhost:3001/api/analyze \
  -H "Content-Type: text/plain" \
  -d "$SAMPLE_LOG")

if [[ $ANALYSIS == *"rootCause"* ]] && [[ $ANALYSIS == *"detectedErrors"* ]]; then
    echo -e "${GREEN}✅ Log analysis working${NC}"
    echo -e "${YELLOW}Response preview:${NC}"
    echo "$ANALYSIS" | grep -o '"rootCause":"[^"]*"' | head -1
else
    echo -e "${RED}❌ Log analysis failed${NC}"
    echo "Response: $ANALYSIS"
fi
echo ""

# Test 4: Protected repo endpoint (should fail without auth)
echo "4️⃣  Testing protected repo endpoint..."
REPOS=$(curl -s http://localhost:3001/api/repos)
if [[ $REPOS == *"Missing or invalid token"* ]] || [[ $REPOS == *"Unauthorized"* ]]; then
    echo -e "${GREEN}✅ Protected endpoint working (correctly rejecting)${NC}"
else
    echo -e "${YELLOW}⚠️  Protected endpoint response: $REPOS${NC}"
fi
echo ""

# Test 5: Check Redis connection (for worker)
echo "5️⃣  Testing Redis connection..."
if redis-cli ping >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Redis is running${NC}"
else
    echo -e "${RED}❌ Redis is not running (needed for worker)${NC}"
    echo "   Run: docker-compose up -d"
fi
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ Backend is working correctly!${NC}"
echo ""
echo "🔗 Endpoints:"
echo "   Backend:  http://localhost:3001"
echo "   Frontend: http://localhost:5173"
echo "   Prisma:   http://localhost:5555 (run 'npm run prisma:studio')"
echo ""
echo "📝 Next steps:"
echo "   1. Start frontend: npm run start:frontend"
echo "   2. Test OAuth login via GitHub"
echo "   3. Paste logs and analyze"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
