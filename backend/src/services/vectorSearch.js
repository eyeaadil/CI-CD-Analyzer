/**
 * Vector Search Service - Phase 2
 * 
 * Performs similarity search on log chunks using embeddings
 * Finds similar past failures using cosine similarity
 */

import { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

const prisma = new PrismaClient();

export class VectorSearchService {
  /**
   * Find similar log chunks using vector similarity
   * 
   * @param {number[]} queryEmbedding - Query vector (768-dim)
   * @param {number} limit - Max results to return
   * @param {number} minSimilarity - Minimum cosine similarity (0-1)
   * @returns {Promise<Array>} - Similar chunks with similarity scores
   */
  async findSimilarChunks(queryEmbedding, limit = 5, minSimilarity = 0.7) {
    try {
      // Convert embedding array to PostgreSQL vector format
      const vectorString = `[${queryEmbedding.join(',')}]`;

      // Raw SQL query for vector similarity search
      // Using <=> operator for cosine distance (1 - cosine_similarity)
      const query = Prisma.sql`
        SELECT 
          lc.id,
          lc."workflowRunId",
          lc."chunkIndex",
          lc."stepName",
          lc.content,
          lc."hasErrors",
          lc."errorCount",
          lc."startLine",
          lc."endLine",
          lc."createdAt",
          (1 - (lc.embedding <=> ${vectorString}::vector)) as similarity
        FROM "LogChunk" lc
        WHERE lc.embedding IS NOT NULL
          AND (1 - (lc.embedding <=> ${vectorString}::vector)) >= ${minSimilarity}
        ORDER BY lc.embedding <=> ${vectorString}::vector
        LIMIT ${limit}
      `;

      const results = await prisma.$queryRaw(query);

      return results;
    } catch (error) {
      console.error('Vector search failed:', error.message);
      throw error;
    }
  }

  /**
   * Find similar error chunks (only chunks with errors)
   */
  async findSimilarErrors(queryEmbedding, limit = 5, minSimilarity = 0.7) {
    try {
      const vectorString = `[${queryEmbedding.join(',')}]`;

      const query = Prisma.sql`
        SELECT 
          lc.id,
          lc."workflowRunId",
          lc."chunkIndex",
          lc."stepName",
          lc.content,
          lc."hasErrors",
          lc."errorCount",
          lc."createdAt",
          (1 - (lc.embedding <=> ${vectorString}::vector)) as similarity
        FROM "LogChunk" lc
        WHERE lc.embedding IS NOT NULL
          AND lc."hasErrors" = true
          AND (1 - (lc.embedding <=> ${vectorString}::vector)) >= ${minSimilarity}
        ORDER BY lc.embedding <=> ${vectorString}::vector
        LIMIT ${limit}
      `;

      const results = await prisma.$queryRaw(query);

      return results;
    } catch (error) {
      console.error('Error search failed:', error.message);
      throw error;
    }
  }

  /**
   * Find similar chunks from a specific workflow run's analysis
   * Useful for finding "we've seen this before" scenarios
   */
  async findSimilarWithAnalysis(queryEmbedding, limit = 3) {
    try {
      const vectorString = `[${queryEmbedding.join(',')}]`;

      const query = Prisma.sql`
        SELECT 
          lc.id,
          lc."workflowRunId",
          lc.content,
          lc.similarity,
          ar."rootCause",
          ar."suggestedFix",
          wr."workflowName",
          wr."createdAt" as "runCreatedAt"
        FROM (
          SELECT 
            id,
            "workflowRunId",
            content,
            (1 - (embedding <=> ${vectorString}::vector)) as similarity
          FROM "LogChunk"
          WHERE embedding IS NOT NULL
            AND "hasErrors" = true
          ORDER BY embedding <=> ${vectorString}::vector
          LIMIT ${limit}
        ) lc
        JOIN "WorkflowRun" wr ON lc."workflowRunId" = wr.id
        LEFT JOIN "AnalysisResult" ar ON wr.id = ar."workflowRunId"
        ORDER BY lc.similarity DESC
      `;

      const results = await prisma.$queryRaw(query);

      return results;
    } catch (error) {
      console.error('Similar analysis search failed:', error.message);
      throw error;
    }
  }

  /**
   * Get chunks that need embeddings generated
   */
  async getChunksWithoutEmbeddings(limit = 100) {
    return await prisma.logChunk.findMany({
      where: {
        embedding: null,
      },
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Update chunk with embedding
   */
  async updateChunkEmbedding(chunkId, embedding) {
    const vectorString = `[${embedding.join(',')}]`;

    await prisma.$executeRaw`
      UPDATE "LogChunk"
      SET embedding = ${vectorString}::vector
      WHERE id = ${chunkId}
    `;
  }

  /**
   * Get statistics about embeddings
   */
  async getEmbeddingStats() {
    const total = await prisma.logChunk.count();

    // Use raw SQL because 'embedding' is an Unsupported type in Prisma
    // and cannot be used in a regular 'where' filter.
    const result = await prisma.$queryRaw`
            SELECT COUNT(*)::int as count 
            FROM "LogChunk" 
            WHERE embedding IS NOT NULL
        `;

    const withEmbeddings = result[0]?.count || 0;

    return {
      total,
      withEmbeddings,
      withoutEmbeddings: total - withEmbeddings,
      percentComplete: total > 0 ? ((withEmbeddings / total) * 100).toFixed(2) : 0,
    };
  }

  /**
   * Find relevant chunks within a specific run (Context Retrieval for Chat)
   * 
   * @param {string} runId - WorkflowRun ID
   * @param {number[]} queryEmbedding - Query vector
   * @param {number} limit - Max chunks to retrieve
   */
  async findRelevantChunksForRun(runId, queryEmbedding, limit = 5) {
    try {
      const vectorString = `[${queryEmbedding.join(',')}]`;
      
      const query = Prisma.sql`
        SELECT 
          lc.id,
          lc."chunkIndex",
          lc."stepName",
          lc.content,
          lc."hasErrors",
          (1 - (lc.embedding <=> ${vectorString}::vector)) as similarity
        FROM "LogChunk" lc
        WHERE lc."workflowRunId" = ${runId}
          AND lc.embedding IS NOT NULL
        ORDER BY lc.embedding <=> ${vectorString}::vector
        LIMIT ${limit}
      `;

      const results = await prisma.$queryRaw(query);
      return results;
    } catch (error) {
      console.error('Run-specific vector search failed:', error.message);
      return [];
    }
  }
}
