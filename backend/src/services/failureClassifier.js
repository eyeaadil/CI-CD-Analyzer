/**
 * Failure Classifier Service
 * 
 * Deterministic layer that runs BEFORE AI to classify failures
 * and determine if AI analysis is needed.
 * 
 * Priority Order:
 * P0: Intentional failure (exit 1) - Absolute authority, AI skipped
 * P1: Test failures - Very High
 * P2: Build / Compile failures - High
 * P3: Runtime errors - Medium
 * P4: Infra / Dependency issues - Medium
 * P5: Lint / Warnings - Low
 */

export class FailureClassifierService {

    /**
     * Classify the failure based on parsed log data
     * @param {Array} chunks - Parsed log chunks
     * @param {Array} detectedErrors - Detected errors from log parser
     * @returns {Object} Classification result with priority
     */
    classify(chunks, detectedErrors) {
        // Check for intentional failures first (P0 - highest priority)
        const intentionalFailure = this.detectIntentionalFailure(chunks, detectedErrors);
        if (intentionalFailure) {
            return intentionalFailure;
        }

        // Check for test failures (P1)
        const testFailure = this.detectTestFailure(detectedErrors);
        if (testFailure) {
            return testFailure;
        }

        // Check for build/compile failures (P2)
        const buildFailure = this.detectBuildFailure(detectedErrors);
        if (buildFailure) {
            return buildFailure;
        }

        // Check for runtime errors (P3)
        const runtimeError = this.detectRuntimeError(detectedErrors);
        if (runtimeError) {
            return runtimeError;
        }

        // Check for infra/dependency issues (P4)
        const infraFailure = this.detectInfraFailure(detectedErrors);
        if (infraFailure) {
            return infraFailure;
        }

        // Check for lint/warnings (P5)
        const lintIssue = this.detectLintIssue(detectedErrors);
        if (lintIssue) {
            return lintIssue;
        }

        // Unknown failure - let AI decide
        return {
            failureType: 'UNKNOWN',
            priority: 99,
            skipAI: false,
            confidence: {
                score: 0.0,
                reason: 'No deterministic classification possible'
            }
        };
    }

    /**
     * Detect intentional CI failures (exit 1, exit 2, etc.)
     * P0 - Absolute authority, AI is skipped
     */
    detectIntentionalFailure(chunks, detectedErrors) {
        // Look for explicit exit commands in errors
        const exitFailure = detectedErrors.find(e =>
            e.category === 'Exit Failure' ||
            (e.errorMessage && /^\s*exit\s+[1-9]\d*\s*$/i.test(e.errorMessage))
        );

        if (exitFailure) {
            // Find the step where this occurred
            const failedStep = chunks.find(c =>
                c.content.includes(exitFailure.errorMessage) ||
                c.stepName.toLowerCase().includes('exit')
            );

            return {
                failureType: 'INTENTIONAL',
                priority: 0, // P0 – highest
                rootCause: 'Intentional CI failure via explicit exit command (exit 1)',
                failureStage: failedStep?.stepName || exitFailure.stepName || 'Forced CI Step',
                suggestedFix: 'Remove or guard the forced "exit 1" step when not testing CI behavior. This is typically used for testing CI pipeline failure handling.',
                confidence: {
                    score: 1.0,
                    reason: 'Explicit exit command detected in CI logs'
                },
                skipAI: true, // AI is completely skipped
                detectedError: exitFailure
            };
        }

        // Also check for step names that indicate intentional failure
        const intentionalStep = chunks.find(c =>
            c.stepName.toLowerCase().includes('force') &&
            c.stepName.toLowerCase().includes('fail')
        );

        if (intentionalStep && intentionalStep.hasErrors) {
            return {
                failureType: 'INTENTIONAL',
                priority: 0,
                rootCause: `Intentional CI failure in step: "${intentionalStep.stepName}"`,
                failureStage: intentionalStep.stepName,
                suggestedFix: 'This step is designed to fail for testing purposes. Remove it when not testing CI behavior.',
                confidence: {
                    score: 0.95,
                    reason: 'Step name indicates intentional failure for testing'
                },
                skipAI: true,
                detectedStep: intentionalStep
            };
        }

        return null;
    }

    /**
     * Detect test failures (P1)
     */
    detectTestFailure(detectedErrors) {
        const testErrors = detectedErrors.filter(e =>
            e.category === 'Test Failure' ||
            e.errorMessage?.toLowerCase().includes('test failed') ||
            e.errorMessage?.toLowerCase().includes('assertion')
        );

        if (testErrors.length > 0) {
            return {
                failureType: 'TEST',
                priority: 1, // P1
                skipAI: false,
                highPriorityErrors: testErrors,
                confidence: {
                    score: 0.85,
                    reason: `${testErrors.length} test failure(s) detected`
                }
            };
        }

        return null;
    }

    /**
     * Detect build/compile failures (P2)
     */
    detectBuildFailure(detectedErrors) {
        const buildErrors = detectedErrors.filter(e =>
            e.category === 'Build Failure' ||
            e.category === 'Syntax Error' ||
            e.errorMessage?.toLowerCase().includes('compilation') ||
            e.errorMessage?.toLowerCase().includes('build failed')
        );

        if (buildErrors.length > 0) {
            return {
                failureType: 'BUILD',
                priority: 2, // P2
                skipAI: false,
                highPriorityErrors: buildErrors,
                confidence: {
                    score: 0.80,
                    reason: `${buildErrors.length} build/compile error(s) detected`
                }
            };
        }

        return null;
    }

    /**
     * Detect runtime errors (P3)
     */
    detectRuntimeError(detectedErrors) {
        const runtimeErrors = detectedErrors.filter(e =>
            e.category === 'Runtime Error' ||
            e.errorMessage?.includes('TypeError') ||
            e.errorMessage?.includes('ReferenceError')
        );

        if (runtimeErrors.length > 0) {
            return {
                failureType: 'RUNTIME',
                priority: 3, // P3
                skipAI: false,
                highPriorityErrors: runtimeErrors,
                confidence: {
                    score: 0.75,
                    reason: `${runtimeErrors.length} runtime error(s) detected`
                }
            };
        }

        return null;
    }

    /**
     * Detect infrastructure/dependency issues (P4)
     */
    detectInfraFailure(detectedErrors) {
        const infraErrors = detectedErrors.filter(e =>
            e.category === 'Dependency Issue' ||
            e.category === 'Network Error' ||
            e.category === 'CI Error' ||
            e.errorMessage?.includes('npm ERR') ||
            e.errorMessage?.includes('ECONNREFUSED')
        );

        if (infraErrors.length > 0) {
            return {
                failureType: 'INFRA',
                priority: 4, // P4
                skipAI: false,
                highPriorityErrors: infraErrors,
                confidence: {
                    score: 0.70,
                    reason: `${infraErrors.length} infrastructure/dependency issue(s) detected`
                }
            };
        }

        return null;
    }

    /**
     * Detect lint/warning issues (P5 - lowest)
     */
    detectLintIssue(detectedErrors) {
        const lintErrors = detectedErrors.filter(e =>
            e.category === 'Error' && e.confidence === 'medium' ||
            e.errorMessage?.toLowerCase().includes('warning') ||
            e.errorMessage?.toLowerCase().includes('lint')
        );

        if (lintErrors.length > 0) {
            return {
                failureType: 'LINT',
                priority: 5, // P5
                skipAI: false,
                highPriorityErrors: lintErrors,
                confidence: {
                    score: 0.50,
                    reason: `${lintErrors.length} lint/warning issue(s) detected - low priority`
                }
            };
        }

        return null;
    }

    /**
     * Get priority label for display
     */
    static getPriorityLabel(priority) {
        const labels = {
            0: 'P0 - Intentional (Absolute)',
            1: 'P1 - Test Failure (Very High)',
            2: 'P2 - Build Failure (High)',
            3: 'P3 - Runtime Error (Medium)',
            4: 'P4 - Infra/Dependency (Medium)',
            5: 'P5 - Lint/Warning (Low)',
            99: 'Unknown'
        };
        return labels[priority] || `P${priority}`;
    }
}
