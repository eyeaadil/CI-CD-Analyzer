// Load environment variables BEFORE anything else
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../../.env');

// Load and verify
const result = dotenv.config({ path: envPath });
if (result.error) {
    console.error('❌ Failed to load .env:', result.error);
} else {
    console.log('✅ .env loaded from:', envPath);
}

// Export for use in other modules
export const config = {
    FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:8080',
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    GITHUB_CALLBACK_URL: process.env.GITHUB_CALLBACK_URL || 'http://localhost:3001/auth/github/callback',
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.SESSION_SECRET || 'default-secret',
    PORT: process.env.PORT || 3001,
};

console.log('ENV CHECK:', {
    GITHUB_CLIENT_ID: config.GITHUB_CLIENT_ID ? '✓ loaded' : '✗ missing',
    GITHUB_CLIENT_SECRET: config.GITHUB_CLIENT_SECRET ? '✓ loaded' : '✗ missing',
    DATABASE_URL: config.DATABASE_URL ? '✓ loaded' : '✗ missing',
});
