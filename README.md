# AI-Driven CI/CD Failure Analyzer

A platform that automatically analyzes GitHub Actions CI/CD logs, detects failure causes, maps them to actionable fixes, and provides analytics + automation to improve pipeline reliability and reduce developer debugging time.

## Current Features

- **GitHub Authentication**: Secure user login via a stateless, JWT-based GitHub OAuth2 flow.
- **Automated Log Ingestion**: Ingests failed GitHub Actions logs automatically via GitHub App webhooks.
- **Background Job Processing**: Uses a robust queueing system (BullMQ + Redis) to process logs asynchronously, preventing API timeouts and enabling retries.
- **Log Analysis (MVP)**: A foundational service that parses raw logs to detect common error patterns.
- **Mock AI Analysis**: A placeholder service that mimics an AI call, providing a sample root cause and suggested fix.
- **Monorepo Structure**: A clean setup with a `frontend` (React/Vite) and `backend` (Node.js/Express) in a single repository.
- **Modern Database**: Utilizes a serverless Postgres database (Neon) with Prisma ORM for type-safe database access.

## Architecture

The system is composed of several key components that work together to provide a seamless analysis pipeline.

```mermaid
flowchart TD
  subgraph Client
    FE[React + Vite (5173)]
  end

  subgraph Backend API (3001)
    API[Express app]
    Auth[/auth routes]
    Webhook[/webhooks route]
    Parser[LogParserService]
    AI[AIAnalyzerService]
  end

  subgraph Queue + Worker
    Q[BullMQ Queue]
    Redis[(Redis 6379)]
    Worker[Log Processor]
  end

  subgraph GitHub
    GApp[GitHub App]
    GActions[GitHub Actions]
    GAPI[GitHub REST API]
  end

  subgraph Infrastructure
    Smee[smee.io proxy]
    DB[(Neon Postgres + Prisma)]
  end

  FE -- Login --> Auth
  Auth -- GitHub OAuth2 --> GApp
  GApp --> Auth
  Auth -- JWT --> FE

  FE -- Paste Logs --> API
  API -- AI Analysis --> Parser & AI
  Parser & AI -- Result --> API
  API -- Result --> FE

  GActions -- Workflow Fails --> GApp
  GApp -- Webhook --> Smee
  Smee -- Forwards --> Webhook
  Webhook -- Enqueues Job --> Q
  Q -- Job --> Worker
  Worker -- Fetches Logs --> GAPI
  GAPI -- Log URL --> Worker
```

### Core Technologies

- **Frontend**: React, Vite, TypeScript
- **Backend**: Node.js, Express, TypeScript
- **Authentication**: JWT, GitHub OAuth
- **Database**: PostgreSQL (Neon) with Prisma
- **Job Queue**: BullMQ with Redis
- **GitHub Integration**: GitHub Apps, Webhooks, Octokit

## Setup and Running the Project

### 1. Prerequisites

- Node.js (v16+)
- npm
- Docker and Docker Compose
- A GitHub account
- A Neon account (for the database)

### 2. Environment Configuration

Create a `.env` file in the root of the project and add the following variables. See comments for where to get each value.

```env
# Database URL from your Neon project
DATABASE_URL="postgresql://user:password@host.neon.tech/dbname?sslmode=require"

# GitHub OAuth App credentials (for user login)
# Found in GitHub > Settings > Developer settings > OAuth Apps
GITHUB_CLIENT_ID="your_oauth_app_client_id"
GITHUB_CLIENT_SECRET="your_oauth_app_client_secret"
GITHUB_CALLBACK_URL="http://localhost:3001/auth/github/callback"

# GitHub App credentials (for webhooks and API access)
# Found in GitHub > Settings > Developer settings > GitHub Apps
GITHUB_APP_ID="your_github_app_id"
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...your private key content...\n-----END RSA PRIVATE KEY-----\n"
GITHUB_WEBHOOK_SECRET="your_github_app_webhook_secret"

# JWT & Frontend Configuration
JWT_SECRET="generate_a_strong_random_string"
FRONTEND_URL="http://localhost:5173"
```

### 3. Webhook Forwarding with Smee.io

GitHub webhooks require a public URL. For local development, we use `smee.io`.

1.  Go to [smee.io](https://smee.io) and **Start a new channel**.
2.  Copy the generated URL (e.g., `https://smee.io/YourRandomString`).
3.  In your GitHub App settings, set the **Webhook URL** to your Smee channel URL.
4.  In a dedicated terminal, run the Smee client to forward webhooks to your local server:
    ```bash
    npx smee-client -u <YOUR_SMEE_URL> -p 3001 -P /api/webhooks/github
    ```

### 4. Running the Application

Run each of the following commands in a separate terminal from the project root.

1.  **Start Redis Database**:
    ```bash
    docker-compose up -d
    ```

2.  **Install Dependencies**:
    ```bash
    npm install
    ```

3.  **Apply Database Migrations**:
    ```bash
    npx prisma migrate dev
    ```

4.  **Start the Backend Server**:
    ```bash
    npm run start:backend
    ```

5.  **Start the Log Processing Worker**:
    ```bash
    npm run start:worker
    ```

6.  **Start the Frontend Server**:
    ```bash
    npm run start:frontend
    ```

Your application is now running!
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`
