/**
 * Backfill Script: Update failureType for existing AnalysisResults
 * 
 * Run with: node backend/src/scripts/backfillFailureTypes.js
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { FailureClassifierService } from '../services/failureClassifier.js';

const prisma = new PrismaClient();

async function backfillFailureTypes() {
    console.log('🔄 Starting failureType backfill...\n');

    // Get all analysis results with null failureType
    const analyses = await prisma.analysisResult.findMany({
        where: {
            OR: [
                { failureType: null },
                { failureType: '' }
            ]
        },
        include: {
            workflowRun: {
                include: {
                    chunks: true
                }
            }
        }
    });

    console.log(`Found ${analyses.length} records to backfill\n`);

    if (analyses.length === 0) {
        console.log('✅ All records already have failureType set!');
        await prisma.$disconnect();
        return;
    }

    const classifier = new FailureClassifierService();
    let updated = 0;

    for (const analysis of analyses) {
        try {
            console.log(`Processing analysis ID: ${analysis.id}`);

            // Get chunks for this workflow run
            const chunks = analysis.workflowRun.chunks.map(c => ({
                chunkIndex: c.chunkIndex,
                stepName: c.stepName,
                content: c.content,
                hasErrors: c.hasErrors,
                errorCount: c.errorCount,
            }));

            // Get detected errors from stored JSON
            let detectedErrors = [];
            try {
                detectedErrors = analysis.detectedErrors ? JSON.parse(analysis.detectedErrors) : [];
            } catch (e) {
                detectedErrors = [];
            }

            // Run classifier
            const classification = classifier.classify(chunks, detectedErrors);

            console.log(`  → Classified as: ${classification.failureType} (P${classification.priority})`);

            // Update the record
            await prisma.analysisResult.update({
                where: { id: analysis.id },
                data: {
                    failureType: classification.failureType,
                    priority: classification.priority,
                }
            });

            updated++;
            console.log(`  ✅ Updated!\n`);

        } catch (error) {
            console.error(`  ❌ Error processing analysis ${analysis.id}:`, error.message);
        }
    }

    console.log(`\n✅ Backfill complete! Updated ${updated}/${analyses.length} records.`);
    await prisma.$disconnect();
}

backfillFailureTypes().catch(console.error);
