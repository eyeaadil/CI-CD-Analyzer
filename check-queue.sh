#!/bin/bash

# Queue Status Checker
# Quick script to check BullMQ queue status

echo "📊 BullMQ Queue Status"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check if Redis is running
if ! docker exec cicd_analyzer_redis redis-cli ping > /dev/null 2>&1; then
    echo -e "${RED}❌ Redis is not running!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Redis is running${NC}"
echo ""

# Get queue counts
echo "Queue: log-processing"
echo "────────────────────────────────────────────"

# Use ZCARD for sorted sets (BullMQ stores completed/failed in sorted sets)
WAITING=$(docker exec cicd_analyzer_redis redis-cli ZCARD "bull:log-processing:wait" 2>/dev/null || echo "0")
ACTIVE=$(docker exec cicd_analyzer_redis redis-cli ZCARD "bull:log-processing:active" 2>/dev/null || echo "0")
COMPLETED=$(docker exec cicd_analyzer_redis redis-cli ZCARD "bull:log-processing:completed" 2>/dev/null || echo "0")
FAILED=$(docker exec cicd_analyzer_redis redis-cli ZCARD "bull:log-processing:failed" 2>/dev/null || echo "0")

# Display with colors
if [ "$WAITING" -gt 0 ]; then
    echo -e "Waiting:   ${YELLOW}$WAITING${NC} jobs"
else
    echo -e "Waiting:   ${GREEN}$WAITING${NC} jobs"
fi

if [ "$ACTIVE" -gt 0 ]; then
    echo -e "Active:    ${YELLOW}$ACTIVE${NC} jobs (worker processing)"
else
    echo -e "Active:    ${GREEN}$ACTIVE${NC} jobs"
fi

echo -e "Completed: ${GREEN}$COMPLETED${NC} jobs"

if [ "$FAILED" -gt 0 ]; then
    echo -e "Failed:    ${RED}$FAILED${NC} jobs ⚠️"
else
    echo -e "Failed:    ${GREEN}$FAILED${NC} jobs"
fi

echo ""
echo "────────────────────────────────────────────"

# Summary
TOTAL=$((WAITING + ACTIVE + COMPLETED + FAILED))
echo "Total jobs: $TOTAL"

# Recommendations
echo ""
if [ "$WAITING" -gt 0 ]; then
    echo -e "${YELLOW}💡 You have $WAITING job(s) waiting. Start worker with:${NC}"
    echo "   npm run start:worker"
elif [ "$ACTIVE" -gt 0 ]; then
    echo -e "${GREEN}✅ Worker is processing jobs${NC}"
elif [ "$FAILED" -gt 0 ]; then
    echo -e "${RED}⚠️  You have $FAILED failed job(s). Check logs for errors.${NC}"
elif [ "$TOTAL" -eq 0 ]; then
    echo -e "${YELLOW}📭 Queue is empty. Send a test request:${NC}"
    echo '   curl -X POST http://localhost:3001/api/analyze -H "Content-Type: text/plain" -d "test error"'
else
    echo -e "${GREEN}✅ All jobs completed successfully!${NC}"
fi

echo ""
