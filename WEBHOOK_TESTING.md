# Testing Webhook → Queue → Worker → AI Flow

## 🎯 Overview

This guide shows you how to test the complete CI/CD analysis flow:

```
GitHub Webhook → Backend → BullMQ Queue → Worker → AI Analysis → Database
```

---

## 📋 Prerequisites

### 1. **Start Redis** (Required for Queue)
```bash
docker-compose up -d
```

Verify:
```bash
redis-cli ping
# Should return: PONG
```

### 2. **Start Backend Server**
```bash
npm run start:backend
```

Should see:
- `Log processing queue initialized.`
- `Server is running on http://localhost:3001`
- `✅ Google Gemini AI initialized (gemini-1.5-flash)`

### 3. **Start Worker Process**
```bash
npm run start:worker
```

Should see:
- `Log processing worker started.`

---

## 🧪 Quick Test (Automated)

Run the complete test script:

```bash
./test-webhook-flow.sh
```

This script will:
1. ✅ Check Redis is running
2. ✅ Check backend server
3. ✅  Check worker process
4. ✅ Simulate GitHub webhook
5. ✅ Verify job in queue
6. ✅ Monitor worker processing

---

## 🔧 Manual Testing (Step-by-Step)

### **Step 1: Prepare Webhook Payload**

Create `test-webhook.json`:
```json
{
  "action": "completed",
  "workflow_run": {
    "id": 123456789,
    "name": "CI Build",
    "conclusion": "failure",
    "html_url": "https://github.com/youruser/yourrepo/actions/runs/123456789"
  },
  "repository": {
    "full_name": "youruser/yourrepo",
    "name": "yourrepo"
  },
  "installation": {
    "id": 12345
  }
}
```

### **Step 2: Calculate Webhook Signature**

```bash
# Your webhook secret from .env
SECRET="your_webhook_secret_here"

# Calculate signature
SIGNATURE=$(cat test-webhook.json | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')
echo "sha256=$SIGNATURE"
```

### **Step 3: Send Webhook Request**

```bash
curl -X POST http://localhost:3001/api/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: workflow_run" \
  -H "X-Hub-Signature-256: sha256=$SIGNATURE" \
  -d @test-webhook.json
```

**Expected Response**:
```
Event received
```

### **Step 4: Verify Job in Queue**

```bash
# Check queue size
redis-cli llen "bull:log-processing:wait"

# View job details
redis-cli --raw lrange "bull:log-processing:wait" 0 -1 | jq '.'
```

### **Step 5: Watch Worker Logs**

In your worker terminal, you should see:

```
Processing job for run ID: 123456789 in repo: youruser/yourrepo
Successfully fetched log URL for run 123456789
Downloading logs from: https://...
🤖 Sending request to Google Gemini AI...
✅ Received response from Gemini AI
Saving analysis results to database...
Analysis saved for run 123456789
```

### **Step 6: Check Database**

```bash
npm run prisma:studio
```

Open `http://localhost:5555` and check:
- `WorkflowRun` table - should have entry for run ID 123456789
- `AnalysisResult` table - should have AI analysis

---

## 🔍 Troubleshooting

### **Queue Issues**

| Problem | Solution |
|---------|----------|
| `Redis connection refused` | Run `docker-compose up -d` |
| `No jobs in queue` | Check webhook signature is correct |
| `Worker not processing` | Ensure worker is running with `npm run start:worker` |

### **Webhook Issues**

| Problem | Solution |
|---------|----------|
| `401 Invalid signature` | Check `GITHUB_WEBHOOK_SECRET` in `.env` matches |
| `404 Not Found` | Verify backend is running on port 3001 |
| `Job not queued` | Check backend logs for errors |

### **Worker Issues**

| Problem | Solution |
|---------|----------|
| `GitHub authentication failed` | Set `GITHUB_APP_ID` and `GITHUB_PRIVATE_KEY` in `.env` |
| `AI error` | Set `GEMINI_API_KEY` in `.env` |
| `WorkflowRun not found` | Worker expects run to exist in DB first |

---

## 🎬 Real GitHub Webhook Setup

To receive real webhooks from GitHub:

### 1. **Install GitHub App**
- Go to your repo → Settings → GitHub Apps
- Install your CI/CD Analyzer app

### 2. **Configure Webhook**
- Webhook URL: `https://your-domain.com/api/webhooks/github`
- Events: Select "Workflow runs"
- Secret: Set your `GITHUB_WEBHOOK_SECRET`

### 3. **Use ngrok for Local Testing**

```bash
# Install ngrok
npm install -g ngrok

# Expose local server
ngrok http 3001
```

Use the ngrok URL in GitHub webhook settings:
```
https://abc123.ngrok.io/api/webhooks/github
```

---

## 📊 Monitoring Queue

### **View Queue Status**

```bash
# Jobs waiting
redis-cli llen "bull:log-processing:wait"

# Jobs completed
redis-cli llen "bull:log-processing:completed"

# Jobs failed
redis-cli llen "bull:log-processing:failed"
```

### **Clear Queue** (if needed)

```bash
# Clear all queues
redis-cli del "bull:log-processing:wait"
redis-cli del "bull:log-processing:completed"
redis-cli del "bull:log-processing:failed"
```

---

## ✅ Success Criteria

You know everything is working when:

1. ✅ Webhook returns `200 Event received`
2. ✅ Backend logs show `Dispatched job for run ID: ...`
3. ✅ Worker logs show `Processing job for run ID: ...`
4. ✅ Worker logs show `🤖 Sending request to Google Gemini AI...`
5. ✅ Worker logs show `✅ Received response from Gemini AI`
6. ✅ Worker logs show `Analysis saved for run ...`
7. ✅ Database has entry in `AnalysisResult` table

---

## 🚀 Quick Reference

```bash
# Start everything
docker-compose up -d        # Redis
npm run start:backend       # Backend server
npm run start:worker        # Worker process

# Test webhook flow
./test-webhook-flow.sh      # Automated test

# Monitor
redis-cli monitor           # Watch Redis commands
npm run prisma:studio       # View database
```

That's it! Your webhook → queue → worker → AI flow is ready to test! 🎉
