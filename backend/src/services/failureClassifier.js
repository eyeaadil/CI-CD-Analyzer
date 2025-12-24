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
 * P5: Security issues - Medium
 * P6: Timeout issues - Medium
 * P7: Dependency failures - Medium
 * P8: Configuration errors - Low
 * P9: Permission errors - Low
 * P10: Lint / Warnings - Low
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

        // Check for infra issues (P4)
        const infraFailure = this.detectInfraFailure(detectedErrors);
        if (infraFailure) {
            return infraFailure;
        }

        // Check for security issues (P5)
        const securityFailure = this.detectSecurityFailure(detectedErrors, chunks);
        if (securityFailure) {
            return securityFailure;
        }

        // Check for timeout issues (P6)
        const timeoutFailure = this.detectTimeoutFailure(detectedErrors, chunks);
        if (timeoutFailure) {
            return timeoutFailure;
        }

        // Check for dependency issues (P7)
        const dependencyFailure = this.detectDependencyFailure(detectedErrors, chunks);
        if (dependencyFailure) {
            return dependencyFailure;
        }

        // Check for config errors (P8)
        const configFailure = this.detectConfigFailure(detectedErrors, chunks);
        if (configFailure) {
            return configFailure;
        }

        // Check for permission errors (P9)
        const permissionFailure = this.detectPermissionFailure(detectedErrors, chunks);
        if (permissionFailure) {
            return permissionFailure;
        }

        // Check for lint/warnings (P10)
        const lintIssue = this.detectLintIssue(detectedErrors);
        if (lintIssue) {
            return lintIssue;
        }

        // No deterministic classification - AI will classify
        return {
            failureType: 'UNKNOWN',
            priority: 99,
            skipAI: false,
            needsAIClassification: true,  // Flag to trigger AI classification
            confidence: {
                score: 0.0,
                reason: 'No deterministic classification possible - AI will suggest category'
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
                priority: 5, // P5 - Low priority (intentional test, not a real issue)
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
                priority: 5, // P5 - Low priority (intentional test, not a real issue)
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
        const testPatterns = [
            /test failed/i,
            /tests? (failing|failed)/i,
            /assertion (failed|error)/i,
            /expect\(.+\)\.to/i,
            /expected .+ (but|to) (got|be|equal)/i,
            /jest/i,
            /mocha/i,
            /vitest/i,
            /cypress/i,
            /playwright/i,
            /\d+ (test|spec)s? failed/i,
            /FAIL\s+\S+\.test\./i,
        ];

        const testErrors = detectedErrors.filter(e =>
            e.category === 'Test Failure' ||
            testPatterns.some(p => p.test(e.errorMessage || ''))
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
        const buildPatterns = [
            /compilation (failed|error)/i,
            /build failed/i,
            /failed to compile/i,
            /typescript error/i,
            /ts\d{4}:/i,  // TypeScript error codes
            /syntax error/i,
            /Cannot find module/i,
            /Module not found/i,
            /webpack/i,
            /rollup/i,
            /esbuild/i,
            /vite.*error/i,
            /error TS\d+/i,
        ];

        const buildErrors = detectedErrors.filter(e =>
            e.category === 'Build Failure' ||
            e.category === 'Syntax Error' ||
            buildPatterns.some(p => p.test(e.errorMessage || ''))
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
        const runtimePatterns = [
            /TypeError:/i,
            /ReferenceError:/i,
            /RangeError:/i,
            /SyntaxError:/i,
            /URIError:/i,
            /EvalError:/i,
            /undefined is not/i,
            /null is not/i,
            /cannot read propert/i,
            /is not a function/i,
            /is not defined/i,
            /uncaught exception/i,
            /unhandled promise rejection/i,
        ];

        const runtimeErrors = detectedErrors.filter(e =>
            e.category === 'Runtime Error' ||
            runtimePatterns.some(p => p.test(e.errorMessage || ''))
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
     * Detect infrastructure issues (P4)
     */
    detectInfraFailure(detectedErrors) {
        const infraPatterns = [
            /ECONNREFUSED/i,
            /ECONNRESET/i,
            /ENOTFOUND/i,
            /ETIMEDOUT/i,
            /network error/i,
            /connection refused/i,
            /connection reset/i,
            /docker/i,
            /container/i,
            /kubernetes/i,
            /k8s/i,
            /pod (failed|error)/i,
            /redis/i,
            /database connection/i,
            /postgres/i,
            /mysql/i,
            /mongodb/i,
        ];

        const infraErrors = detectedErrors.filter(e =>
            e.category === 'Network Error' ||
            e.category === 'CI Error' ||
            infraPatterns.some(p => p.test(e.errorMessage || ''))
        );

        if (infraErrors.length > 0) {
            return {
                failureType: 'INFRA',
                priority: 4, // P4
                skipAI: false,
                highPriorityErrors: infraErrors,
                confidence: {
                    score: 0.70,
                    reason: `${infraErrors.length} infrastructure issue(s) detected`
                }
            };
        }

        return null;
    }

    /**
     * Detect security issues (P5)
     */
    detectSecurityFailure(detectedErrors, chunks) {
        const securityPatterns = [
            /vulnerabilit(y|ies)/i,
            /security (issue|warning|error)/i,
            /CVE-\d{4}-\d+/i,
            /npm audit/i,
            /high severity/i,
            /critical severity/i,
            /snyk/i,
            /dependabot/i,
            /secret (exposed|leaked)/i,
            /credential/i,
            /authentication failed/i,
            /unauthorized/i,
            /403 forbidden/i,
            /401 unauthorized/i,
        ];

        const securityErrors = detectedErrors.filter(e =>
            securityPatterns.some(p => p.test(e.errorMessage || ''))
        );

        // Also check chunks for security-related content
        const securityChunks = chunks.filter(c =>
            securityPatterns.some(p => p.test(c.content || ''))
        );

        if (securityErrors.length > 0 || securityChunks.length > 0) {
            return {
                failureType: 'SECURITY',
                priority: 5, // P5
                skipAI: false,
                highPriorityErrors: securityErrors,
                confidence: {
                    score: 0.75,
                    reason: `Security issue(s) detected`
                }
            };
        }

        return null;
    }

    /**
     * Detect timeout issues (P6)
     */
    detectTimeoutFailure(detectedErrors, chunks) {
        const timeoutPatterns = [
            /timeout/i,
            /timed out/i,
            /exceeded (the )?deadline/i,
            /operation.*timed out/i,
            /request timeout/i,
            /socket timeout/i,
            /execution timeout/i,
            /job timeout/i,
            /ESOCKETTIMEDOUT/i,
        ];

        const timeoutErrors = detectedErrors.filter(e =>
            timeoutPatterns.some(p => p.test(e.errorMessage || ''))
        );

        // Also check chunks
        const timeoutChunks = chunks.filter(c =>
            timeoutPatterns.some(p => p.test(c.content || ''))
        );

        if (timeoutErrors.length > 0 || timeoutChunks.length > 0) {
            return {
                failureType: 'TIMEOUT',
                priority: 6, // P6
                skipAI: false,
                highPriorityErrors: timeoutErrors,
                confidence: {
                    score: 0.80,
                    reason: `Timeout issue(s) detected`
                }
            };
        }

        return null;
    }

    /**
     * Detect dependency issues (P7)
     */
    detectDependencyFailure(detectedErrors, chunks) {
        const depPatterns = [
            /npm ERR!/i,
            /yarn error/i,
            /pnpm error/i,
            /package.*not found/i,
            /missing (peer )?dependency/i,
            /ERESOLVE/i,
            /could not resolve/i,
            /dependency conflict/i,
            /version mismatch/i,
            /peer dep/i,
            /npm WARN/i,
            /404 not found.*registry/i,
            /install failed/i,
        ];

        const depErrors = detectedErrors.filter(e =>
            e.category === 'Dependency Issue' ||
            depPatterns.some(p => p.test(e.errorMessage || ''))
        );

        if (depErrors.length > 0) {
            return {
                failureType: 'DEPENDENCY',
                priority: 7, // P7
                skipAI: false,
                highPriorityErrors: depErrors,
                confidence: {
                    score: 0.75,
                    reason: `${depErrors.length} dependency issue(s) detected`
                }
            };
        }

        return null;
    }

    /**
     * Detect configuration errors (P8)
     */
    detectConfigFailure(detectedErrors, chunks) {
        const configPatterns = [
            /config(uration)? (error|invalid|missing)/i,
            /env(ironment)? (variable|var).*(missing|not set|undefined)/i,
            /invalid (yaml|json|config)/i,
            /missing (required|config)/i,
            /\.env/i,
            /secret.*not (found|set)/i,
            /environment not configured/i,
            /bad configuration/i,
            /settings error/i,
        ];

        const configErrors = detectedErrors.filter(e =>
            configPatterns.some(p => p.test(e.errorMessage || ''))
        );

        // Check chunks for config issues
        const configChunks = chunks.filter(c =>
            configPatterns.some(p => p.test(c.content || ''))
        );

        if (configErrors.length > 0 || configChunks.length > 0) {
            return {
                failureType: 'CONFIG',
                priority: 8, // P8
                skipAI: false,
                highPriorityErrors: configErrors,
                confidence: {
                    score: 0.70,
                    reason: `Configuration issue(s) detected`
                }
            };
        }

        return null;
    }

    /**
     * Detect permission errors (P9)
     */
    detectPermissionFailure(detectedErrors, chunks) {
        const permPatterns = [
            /permission denied/i,
            /access denied/i,
            /EACCES/i,
            /EPERM/i,
            /not permitted/i,
            /insufficient permission/i,
            /forbidden/i,
            /cannot write/i,
            /read-only/i,
            /operation not permitted/i,
        ];

        const permErrors = detectedErrors.filter(e =>
            permPatterns.some(p => p.test(e.errorMessage || ''))
        );

        if (permErrors.length > 0) {
            return {
                failureType: 'PERMISSION',
                priority: 9, // P9
                skipAI: false,
                highPriorityErrors: permErrors,
                confidence: {
                    score: 0.80,
                    reason: `${permErrors.length} permission error(s) detected`
                }
            };
        }

        return null;
    }

    /**
     * Detect lint/warning issues (P10 - lowest)
     */
    detectLintIssue(detectedErrors) {
        const lintPatterns = [
            /eslint/i,
            /prettier/i,
            /tslint/i,
            /stylelint/i,
            /lint(ing)? (error|warning)/i,
            /\d+ warning/i,
            /\d+ error.*\d+ warning/i,
            /code style/i,
            /formatting error/i,
        ];

        const lintErrors = detectedErrors.filter(e =>
            (e.category === 'Error' && e.confidence === 'medium') ||
            lintPatterns.some(p => p.test(e.errorMessage || ''))
        );

        if (lintErrors.length > 0) {
            return {
                failureType: 'LINT',
                priority: 10, // P10
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
            0: 'P0 - Critical',
            1: 'P1 - High (Test Failure)',
            2: 'P2 - High (Build Failure)',
            3: 'P3 - Medium (Runtime Error)',
            4: 'P4 - Medium (Infrastructure)',
            5: 'P5 - Low (Intentional/Test)',
            6: 'P6 - Medium (Timeout)',
            7: 'P7 - Medium (Dependency)',
            8: 'P8 - Low (Configuration)',
            9: 'P9 - Low (Permission)',
            10: 'P10 - Low (Lint/Warning)',
            99: 'Unknown'
        };
        return labels[priority] || `P${priority}`;
    }

    /**
     * Get all failure type categories
     */
    static getCategories() {
        return [
            { type: 'INTENTIONAL', priority: 0, label: 'Intentional Failure' },
            { type: 'TEST', priority: 1, label: 'Test Failure' },
            { type: 'BUILD', priority: 2, label: 'Build/Compile Error' },
            { type: 'RUNTIME', priority: 3, label: 'Runtime Error' },
            { type: 'INFRA', priority: 4, label: 'Infrastructure Issue' },
            { type: 'SECURITY', priority: 5, label: 'Security Issue' },
            { type: 'TIMEOUT', priority: 6, label: 'Timeout' },
            { type: 'DEPENDENCY', priority: 7, label: 'Dependency Issue' },
            { type: 'CONFIG', priority: 8, label: 'Configuration Error' },
            { type: 'PERMISSION', priority: 9, label: 'Permission Error' },
            { type: 'LINT', priority: 10, label: 'Lint/Warning' },
            { type: 'UNKNOWN', priority: 99, label: 'Unknown' },
        ];
    }
}
