/**
 * Embedding Service - Phase 2
 * 
 * Generates text embeddings using Google Gemini AI
 * Converts text chunks into 768-dimensional vectors for semantic search
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

export class EmbeddingService {
    constructor() {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY is required for embedding generation');
        }

        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = 'text-embedding-004'; // Gemini's embedding model
        this.embeddingDimension = 768;
    }

    /**
     * Generate embedding for a single text
     * @param {string} text - Text to embed
     * @returns {Promise<number[]>} - 768-dimensional vector
     */
    async generateEmbedding(text) {
        try {
            // Clean and truncate text if needed (max ~20,000 chars)
            const cleanText = this.prepareText(text);

            const result = await this.genAI
                .getGenerativeModel({ model: this.model })
                .embedContent(cleanText);

            const embedding = result.embedding.values;

            // Verify dimension
            if (embedding.length !== this.embeddingDimension) {
                console.warn(`Expected ${this.embeddingDimension} dimensions, got ${embedding.length}`);
            }

            return embedding;
        } catch (error) {
            console.error('Failed to generate embedding:', error.message);
            throw error;
        }
    }

    /**
     * Generate embeddings for multiple texts (batch)
     * @param {string[]} texts - Array of texts to embed
     * @returns {Promise<number[][]>} - Array of 768-dimensional vectors  
     */
    async generateEmbeddings(texts) {
        const embeddings = [];

        for (const text of texts) {
            const embedding = await this.generateEmbedding(text);
            embeddings.push(embedding);

            // Small delay to avoid rate limits
            await this.sleep(100);
        }

        return embeddings;
    }

    /**
     * Prepare text for embedding
     * - Remove excessive whitespace
     * - Truncate if too long
     * - Clean special characters
     */
    prepareText(text) {
        let cleaned = text
            .replace(/\s+/g, ' ')  // Normalize whitespace
            .trim();

        // Truncate if too long (Gemini limit ~20k chars)
        const maxChars = 20000;
        if (cleaned.length > maxChars) {
            cleaned = cleaned.substring(0, maxChars);
            console.warn(`Text truncated from ${text.length} to ${maxChars} chars`);
        }

        return cleaned;
    }

    /**
     * Calculate cosine similarity between two vectors
     * @param {number[]} vec1 - First vector
     * @param {number[]} vec2 - Second vector
     * @returns {number} - Similarity score (0-1)
     */
    cosineSimilarity(vec1, vec2) {
        if (vec1.length !== vec2.length) {
            throw new Error('Vectors must have same dimension');
        }

        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;

        for (let i = 0; i < vec1.length; i++) {
            dotProduct += vec1[i] * vec2[i];
            norm1 += vec1[i] * vec1[i];
            norm2 += vec2[i] * vec2[i];
        }

        const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
        return magnitude === 0 ? 0 : dotProduct / magnitude;
    }

    /**
     * Helper: Sleep for ms
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
