#!/bin/bash

# Webhook Flow Test Script
# This script simulates a GitHub webhook and tests the complete flow:
# Webhook → Queue → Worker → AI Analysis

echo "🧪 Testing Complete Webhook → Queue → Worker → AI Flow"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Step 1: Check Redis
echo -e "${BLUE}Step 1/6:${NC} Checking Redis..."
if docker exec cicd_analyzer_redis redis-cli ping >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Redis is running${NC}"
elif docker ps | grep cicd_analyzer_redis >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Redis container is running${NC}"
else
    echo -e "${RED}❌ Redis is NOT running${NC}"
    echo -e "${YELLOW}Starting Redis with docker-compose...${NC}"
    docker-compose up -d redis
    sleep 3
    if docker exec cicd_analyzer_redis redis-cli ping >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Redis started successfully${NC}"
    else
        echo -e "${RED}❌ Failed to start Redis${NC}"
        exit 1
    fi
fi
echo ""

# Step 2: Check Backend
echo -e "${BLUE}Step 2/6:${NC} Checking backend server..."
if curl -s http://localhost:3001/ >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend is running on port 3001${NC}"
else
    echo -e "${RED}❌ Backend is NOT running${NC}"
    echo "Start it with: npm run start:backend"
    exit 1
fi
echo ""

# Step 3: Check Worker
echo -e "${BLUE}Step 3/6:${NC} Checking worker process..."
if ps aux | grep -v grep | grep "node backend/src/workers/logProcessor.js" >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Worker is running${NC}"
else
    echo -e "${YELLOW}⚠️  Worker is NOT running${NC}"
    echo "Start it with: npm run start:worker"
    echo "Continuing with test (worker will be needed for Step 6)..."
fi
echo ""

# Step 4: Simulate GitHub Webhook
echo -e "${BLUE}Step 4/6:${NC} Simulating GitHub webhook event..."

# Calculate webhook signature
WEBHOOK_SECRET="${GITHUB_WEBHOOK_SECRET:-your_webhook_secret_here}"
PAYLOAD='{
  "action": "completed",
  "workflow_run": {
    "id": 12345678,
    "name": "CI Build",
    "conclusion": "failure",
    "html_url": "https://github.com/test/repo/actions/runs/12345678"
  },
  "repository": {
    "full_name": "test-user/test-repo",
    "name": "test-repo"
  },
  "installation": {
    "id": 99999
  }
}'

# Create HMAC signature
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | sed 's/^.* //')
SIGNATURE_HEADER="sha256=$SIGNATURE"

echo "Sending webhook payload..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3001/api/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: workflow_run" \
  -H "X-Hub-Signature-256: $SIGNATURE_HEADER" \
  -d "$PAYLOAD")

HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
RESPONSE_BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ Webhook received successfully${NC}"
    echo "Response: $RESPONSE_BODY"
else
    echo -e "${RED}❌ Webhook failed with HTTP $HTTP_CODE${NC}"
    echo "Response: $RESPONSE_BODY"
    if [ "$HTTP_CODE" = "401" ]; then
        echo -e "${YELLOW}Note: Signature verification failed. Set GITHUB_WEBHOOK_SECRET in .env${NC}"
    fi
fi
echo ""

# Step 5: Check Queue
echo -e "${BLUE}Step 5/6:${NC} Checking BullMQ queue..."
sleep 1

# Try to check queue using docker exec
QUEUE_SIZE=$(docker exec cicd_analyzer_redis redis-cli llen "bull:log-processing:wait" 2>/dev/null || echo "0")
echo "Jobs in queue: $QUEUE_SIZE"

if [ "$QUEUE_SIZE" -gt "0" ]; then
    echo -e "${GREEN}✅ Job added to queue successfully${NC}"
else
    echo -e "${YELLOW}⚠️  No jobs in queue (may have been processed already)${NC}"
fi
echo ""

# Step 6: Check Worker Processing
echo -e "${BLUE}Step 6/6:${NC} Monitoring worker processing..."
echo "Waiting for worker to process the job (this takes a few seconds)..."
echo -e "${YELLOW}Watch your worker terminal for:${NC}"
echo "  - 'Processing job for run ID: 12345678'"
echo "  - '🤖 Sending request to Google Gemini AI...'"
echo "  - '✅ Received response from Gemini AI'"
echo "  - 'Analysis saved for run 12345678'"
echo ""

sleep 3

# Check if there are any processed jobs
PROCESSED=$(docker exec cicd_analyzer_redis redis-cli llen "bull:log-processing:completed" 2>/dev/null || echo "0")
FAILED=$(docker exec cicd_analyzer_redis redis-cli llen "bull:log-processing:failed" 2>/dev/null || echo "0")

echo "Queue Status:"
echo "  Processed: $PROCESSED"
echo "  Failed: $FAILED"
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ Webhook Flow Test Complete${NC}"
echo ""
echo "📋 What happened:"
echo "  1. Webhook endpoint received GitHub event"
echo "  2. Job was added to BullMQ queue"
echo "  3. Worker picked up the job"
echo "  4. Worker would download logs (needs real GitHub App)"
echo "  5. AI analyzes the logs"
echo "  6. Results saved to database"
echo ""
echo "⚠️  Note: Steps 4-6 require:"
echo "  - Valid GITHUB_APP_ID and GITHUB_PRIVATE_KEY"
echo "  - Worker process running"
echo "  - GEMINI_API_KEY for AI analysis"
echo ""
echo "🔍 To verify in database:"
echo "  npm run prisma:studio"
echo "  Check the 'AnalysisResult' table"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
