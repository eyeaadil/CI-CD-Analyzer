/**
 * RAG Service - Phase 3
 * 
 * Retrieval Augmented Generation
 * Enhances AI analysis by retrieving relevant historical context
 * from similar past failures before generating analysis
 */

import { EmbeddingService } from './embeddingService.js';
import { VectorSearchService } from './vectorSearch.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class RAGService {
    constructor() {
        this.embeddingService = new EmbeddingService();
        this.vectorSearch = new VectorSearchService();
    }

    /**
     * Retrieve relevant context for error analysis
     * 
     * @param {Array} detectedErrors - Errors from log parser
     * @param {Array} chunks - Log chunks
     * @param {number} maxResults - Max similar cases to retrieve
     * @returns {Promise<Object>} - Context with similar failures and solutions
     */
    async retrieveContext(detectedErrors, chunks, maxResults = 3) {
        try {
            console.log('🔍 RAG: Retrieving historical context...');

            // 1. Create query from errors
            const query = this.constructQuery(detectedErrors, chunks);

            // 2. Generate embedding for query
            const queryEmbedding = await this.embeddingService.generateEmbedding(query);

            // 3. Search for similar past failures with their analysis
            const similarCases = await this.vectorSearch.findSimilarWithAnalysis(
                queryEmbedding,
                maxResults
            );

            // 4. Extract and organize context
            const context = this.extractContext(similarCases);

            console.log(`✅ RAG: Found ${context.similarCases.length} relevant past failures`);

            return context;

        } catch (error) {
            console.warn('⚠️  RAG retrieval failed, continuing without context:', error.message);
            return this.getEmptyContext();
        }
    }

    /**
     * Construct search query from errors and chunks
     */
    constructQuery(detectedErrors, chunks) {
        let query = '';

        // Add error messages (most important)
        if (detectedErrors && detectedErrors.length > 0) {
            const errorMessages = detectedErrors
                .slice(0, 5) // Top 5 errors
                .map(e => e.errorMessage)
                .join(' ');
            query += errorMessages + ' ';
        }

        // Add context from error chunks (if available)
        const errorChunks = chunks.filter(c => c.hasErrors);
        if (errorChunks.length > 0) {
            // Take snippet from first error chunk
            const snippet = errorChunks[0].content
                .split('\n')
                .slice(0, 10) // First 10 lines
                .join(' ');
            query += snippet;
        }

        return query.trim();
    }

    /**
     * Extract structured context from similar cases
     */
    extractContext(similarCases) {
        const context = {
            hasSimilarCases: similarCases.length > 0,
            similarCases: [],
            commonPatterns: [],
            suggestedSolutions: [],
        };

        for (const case_ of similarCases) {
            const similarity = case_.similarity || 0;

            // Only include cases with reasonable similarity
            if (similarity < 0.6) continue;

            context.similarCases.push({
                similarity: similarity,
                workflowName: case_.workflowName,
                date: case_.runCreatedAt,
                logSnippet: case_.content?.substring(0, 200) || '',
                rootCause: case_.rootCause || null,
                suggestedFix: case_.suggestedFix || null,
            });

            // Collect root causes as patterns
            if (case_.rootCause) {
                context.commonPatterns.push(case_.rootCause);
            }

            // Collect suggested fixes
            if (case_.suggestedFix) {
                context.suggestedSolutions.push({
                    solution: case_.suggestedFix,
                    similarity: similarity,
                });
            }
        }

        // Deduplicate patterns
        context.commonPatterns = [...new Set(context.commonPatterns)];

        return context;
    }

    /**
     * Build enhanced prompt with RAG context
     * 
     * @param {string} basePrompt - Original prompt from AI analyzer
     * @param {Object} context - Retrieved context
     * @returns {string} - Enhanced prompt with historical context
     */
    buildEnhancedPrompt(basePrompt, context) {
        if (!context.hasSimilarCases) {
            return basePrompt;
        }

        let enhancedPrompt = basePrompt;

        // Add historical context section
        enhancedPrompt += '\n\n== HISTORICAL CONTEXT ==\n';
        enhancedPrompt += `We found ${context.similarCases.length} similar past failures:\n\n`;

        context.similarCases.forEach((case_, index) => {
            enhancedPrompt += `### Similar Case ${index + 1} (${(case_.similarity * 100).toFixed(0)}% similar):\n`;
            enhancedPrompt += `Workflow: ${case_.workflowName}\n`;
            enhancedPrompt += `Date: ${new Date(case_.date).toLocaleDateString()}\n`;

            if (case_.rootCause) {
                enhancedPrompt += `Past Root Cause: ${case_.rootCause}\n`;
            }

            if (case_.suggestedFix) {
                enhancedPrompt += `Past Solution: ${case_.suggestedFix}\n`;
            }

            enhancedPrompt += '\n';
        });

        // Add instruction to use historical context
        enhancedPrompt += `\nIMPORTANT: Consider these historical cases when analyzing the current failure.\n`;
        enhancedPrompt += `If the current failure is similar to a past case, reference it and adapt the solution.\n`;
        enhancedPrompt += `If it's a recurring issue, mention that pattern in your analysis.\n\n`;

        return enhancedPrompt;
    }

    /**
     * Format context for display/logging
     */
    formatContextSummary(context) {
        if (!context.hasSimilarCases) {
            return 'No similar past failures found';
        }

        const lines = [`Found ${context.similarCases.length} similar case(s):`];

        context.similarCases.forEach((case_, i) => {
            lines.push(`  ${i + 1}. ${case_.workflowName} (${(case_.similarity * 100).toFixed(0)}% similar)`);
        });

        if (context.commonPatterns.length > 0) {
            lines.push(`\nCommon patterns:`);
            context.commonPatterns.slice(0, 2).forEach(pattern => {
                lines.push(`  - ${pattern.substring(0, 100)}...`);
            });
        }

        return lines.join('\n');
    }

    /**
     * Empty context when retrieval fails
     */
    getEmptyContext() {
        return {
            hasSimilarCases: false,
            similarCases: [],
            commonPatterns: [],
            suggestedSolutions: [],
        };
    }

    /**
     * Calculate confidence score based on RAG results
     * 
     * @param {Object} context - RAG context
     * @returns {Object} - Confidence assessment
     */
    assessConfidence(context) {
        if (!context.hasSimilarCases || context.similarCases.length === 0) {
            return {
                score: 0.5, // Medium confidence (no historical data)
                reason: 'No similar past failures found',
            };
        }

        const topSimilarity = context.similarCases[0]?.similarity || 0;
        const caseCount = context.similarCases.length;

        let score = 0.5; // Base score
        let reason = '';

        if (topSimilarity >= 0.9 && caseCount >= 2) {
            score = 0.95;
            reason = `Very high confidence: ${caseCount} highly similar past case(s) (${(topSimilarity * 100).toFixed(0)}% match)`;
        } else if (topSimilarity >= 0.8) {
            score = 0.85;
            reason = `High confidence: Similar past case found (${(topSimilarity * 100).toFixed(0)}% match)`;
        } else if (topSimilarity >= 0.7) {
            score = 0.75;
            reason = `Good confidence: Moderately similar past case (${(topSimilarity * 100).toFixed(0)}% match)`;
        } else {
            score = 0.6;
            reason = `Fair confidence: Some similar patterns found`;
        }

        return { score, reason };
    }

    /**
     * Retrieve relevant chunks for a chat query within a specific run
     * 
     * @param {string} runId - The WorkflowRun ID
     * @param {string} message - User's chat message
     * @returns {Promise<Array>} - Relevant log chunks
     */
    async retrieveChatContext(runId, message) {
        try {
            console.log(`🔍 Chat RAG: Retrieving context for run ${runId}...`);
            const embedding = await this.embeddingService.generateEmbedding(message);
            
            // Search specifically within this run's logs
            const chunks = await this.vectorSearch.findRelevantChunksForRun(runId, embedding, 5);
            
            console.log(`✅ Chat RAG: Found ${chunks.length} relevant log chunks`);
            return chunks;
        } catch (error) {
            console.error('Chat context retrieval failed:', error.message);
            return [];
        }
    }
}
