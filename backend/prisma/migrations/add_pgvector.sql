-- Enable pgvector extension for PostgreSQL
-- This allows storing and searching vector embeddings

-- Create extension if it doesn't exist
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to existing LogChunk table
ALTER TABLE "LogChunk" ADD COLUMN IF NOT EXISTS embedding vector(768);

-- Create index for fast vector similarity search
-- Using ivfflat with cosine distance
CREATE INDEX IF NOT EXISTS logchunk_embedding_idx 
ON "LogChunk" 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

-- Note: lists parameter should be roughly sqrt(total_rows)
-- Adjust as your data grows
