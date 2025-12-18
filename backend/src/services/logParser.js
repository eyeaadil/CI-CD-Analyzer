/**
 * Enhanced Log Parser Service - Phase 1
 * 
 * Features:
 * - Smart step detection (GitHub Actions markers)
 * - Intelligent chunking (size-based + step-based)
 * - Advanced noise removal
 * - 30+ error patterns
 * - Token counting
 */

export class LogParserService {
  constructor() {
    // Max lines per chunk (to avoid token limits)
    this.MAX_CHUNK_LINES = 1000;
    // Approximate tokens per line (rough estimate)
    this.AVG_TOKENS_PER_LINE = 5;
  }

  /**
   * Main parse method - returns chunks and overall analysis
   */
  parse(rawLog) {
    const cleanedLines = this.cleanLog(rawLog);
    const steps = this.detectSteps(cleanedLines);
    const chunks = this.createChunks(steps, cleanedLines);
    const detectedErrors = this.detectErrors(chunks);

    return {
      chunks,           // Array of chunk objects
      detectedErrors,   // Overall errors
      totalLines: cleanedLines.length,
      totalChunks: chunks.length,
    };
  }

  /**
   * Advanced log cleaning - removes ANSI codes, timestamps, progress bars
   */
  cleanLog(rawLog) {
    // ANSI escape codes (colors, formatting)
    const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

    // GitHub Actions timestamps
    const timestampRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s+/;

    // Progress indicators and carriage returns
    const progressRegex = /\r(?!\n)/g;

    const lines = rawLog.split('\n');
    return lines.map((line, index) => {
      let cleaned = line
        .replace(ansiRegex, '')           // Remove colors
        .replace(timestampRegex, '')      // Remove timestamps
        .replace(progressRegex, '\n')     // Convert \r to \n
        .trim();

      return cleaned;
    }).filter(line => line.length > 0);  // Remove empty lines
  }

  /**
   * Detect GitHub Actions steps from log markers
   */
  detectSteps(lines) {
    const steps = [];
    let currentStep = null;
    let currentStepStart = 0;

    const patterns = {
      // GitHub Actions group markers
      groupStart: /^##\[group\](.+)$/,
      groupEnd: /^##\[endgroup\]$/,

      // GitHub Actions section markers
      section: /^##\[section\](.+)$/,

      // Common step indicators
      runCommand: /^Run\s+(.+)$/,
      postStep: /^Post\s+(.+)$/,

      // Workflow step markers
      stepStart: /^={3,}\s*(.+?)\s*={3,}$/,

      // Log file markers from combined logs (e.g., "--- Log File: build-and-test/6_Force CI failure (testing).txt ---")
      // This is the MOST reliable source of step names
      logFileMarker: /^---\s*Log File:\s*(.+?\.txt)\s*---$/,
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for log file marker FIRST (highest priority - contains actual step name)
      // Format: "--- Log File: build-and-test/6_Force CI failure (testing).txt ---"
      let match = line.match(patterns.logFileMarker);
      if (match) {
        if (currentStep) {
          // Save previous step
          steps.push({
            ...currentStep,
            endLine: i - 1
          });
        }
        // Extract step name from filename (e.g., "6_Force CI failure (testing).txt" -> "Force CI failure (testing)")
        const filePath = match[1];
        const fileName = filePath.split('/').pop(); // Get just the filename
        // Remove step number prefix and .txt extension
        const stepName = fileName
          .replace(/^\d+_/, '')  // Remove leading number and underscore
          .replace(/\.txt$/, ''); // Remove .txt extension

        currentStep = {
          name: stepName || fileName,
          startLine: i,
          endLine: i,
          isFromLogFile: true, // Mark this as coming from log file marker
        };
        continue;
      }

      // Check for group start
      match = line.match(patterns.groupStart);
      if (match) {
        // Only start a new step from ##[group] if we don't have a log file based step
        // or if the current step is also from ##[group]
        if (currentStep && !currentStep.isFromLogFile) {
          // Save previous step
          steps.push({
            ...currentStep,
            endLine: i - 1
          });
          currentStep = {
            name: match[1].trim(),
            startLine: i,
            endLine: i,
          };
        } else if (!currentStep) {
          currentStep = {
            name: match[1].trim(),
            startLine: i,
            endLine: i,
          };
        }
        // If currentStep.isFromLogFile, don't replace it - the log file name is more descriptive
        continue;
      }

      // Check for group end
      if (line.match(patterns.groupEnd) && currentStep && !currentStep.isFromLogFile) {
        steps.push({
          ...currentStep,
          endLine: i
        });
        currentStep = null;
        continue;
      }

      // Check for run command (only if no current step)
      match = line.match(patterns.runCommand);
      if (match && !currentStep) {
        currentStep = {
          name: `Run: ${match[1].substring(0, 50)}...`,
          startLine: i,
          endLine: i,
        };
        continue;
      }

      // Check for post step (only if no current step)
      match = line.match(patterns.postStep);
      if (match && !currentStep) {
        currentStep = {
          name: `Post: ${match[1]}`,
          startLine: i,
          endLine: i,
        };
        continue;
      }
    }

    // Add final step if exists
    if (currentStep) {
      steps.push({
        ...currentStep,
        endLine: lines.length - 1
      });
    }

    // If no steps detected, treat entire log as one step
    if (steps.length === 0) {
      steps.push({
        name: 'Full Log',
        startLine: 0,
        endLine: lines.length - 1
      });
    }

    return steps;
  }

  /**
   * Create intelligent chunks from steps and lines
   */
  createChunks(steps, lines) {
    const chunks = [];
    let chunkIndex = 0;

    for (const step of steps) {
      const stepLines = lines.slice(step.startLine, step.endLine + 1);

      // If step is small enough, create single chunk
      if (stepLines.length <= this.MAX_CHUNK_LINES) {
        const errors = this.findErrorsInLines(stepLines);
        chunks.push({
          chunkIndex: chunkIndex++,
          stepName: step.name,
          content: stepLines.join('\n'),
          startLine: step.startLine,
          endLine: step.endLine,
          lineCount: stepLines.length,
          tokenCount: this.estimateTokens(stepLines),
          hasErrors: errors.length > 0,
          errorCount: errors.length,
        });
      } else {
        // Split large step into multiple chunks
        for (let i = 0; i < stepLines.length; i += this.MAX_CHUNK_LINES) {
          const chunkLines = stepLines.slice(i, i + this.MAX_CHUNK_LINES);
          const absoluteStart = step.startLine + i;
          const absoluteEnd = absoluteStart + chunkLines.length - 1;
          const errors = this.findErrorsInLines(chunkLines);

          chunks.push({
            chunkIndex: chunkIndex++,
            stepName: `${step.name} (part ${Math.floor(i / this.MAX_CHUNK_LINES) + 1})`,
            content: chunkLines.join('\n'),
            startLine: absoluteStart,
            endLine: absoluteEnd,
            lineCount: chunkLines.length,
            tokenCount: this.estimateTokens(chunkLines),
            hasErrors: errors.length > 0,
            errorCount: errors.length,
          });
        }
      }
    }

    return chunks;
  }

  /**
   * Estimate token count (rough approximation)
   */
  estimateTokens(lines) {
    const totalChars = lines.join(' ').length;
    // Rough estimate: 4 characters ≈ 1 token
    return Math.ceil(totalChars / 4);
  }

  /**
   * Enhanced error detection with 30+ patterns
   */
  detectErrors(chunks) {
    const allErrors = [];

    for (const chunk of chunks) {
      const chunkLines = chunk.content.split('\n');
      const errors = this.findErrorsInLines(chunkLines);

      // Add chunk reference to each error
      errors.forEach(error => {
        error.chunkIndex = chunk.chunkIndex;
        error.stepName = chunk.stepName;
      });

      allErrors.push(...errors);
    }

    // Dedu duplicate errors
    return this.deduplicateErrors(allErrors);
  }

  /**
   * Find errors in specific lines
   */
  findErrorsInLines(lines) {
    const errors = [];

    const errorPatterns = [
      // Build Errors
      { category: 'Build Failure', pattern: /build\s+failed/i, confidence: 'high' },
      { category: 'Build Failure', pattern: /compilation\s+error/i, confidence: 'high' },
      { category: 'Build Failure', pattern: /could\s+not\s+compile/i, confidence: 'high' },

      // Dependency Errors
      { category: 'Dependency Issue', pattern: /cannot\s+find\s+module/i, confidence: 'high' },
      { category: 'Dependency Issue', pattern: /module\s+not\s+found/i, confidence: 'high' },
      { category: 'Dependency Issue', pattern: /npm\s+ERR!/i, confidence: 'medium' },
      { category: 'Dependency Issue', pattern: /yarn\s+error/i, confidence: 'medium' },
      { category: 'Dependency Issue', pattern: /ERESOLVE/i, confidence: 'medium' },
      { category: 'Dependency Issue', pattern: /peer\s+dependency/i, confidence: 'medium' },
      { category: 'Dependency Issue', pattern: /ENOENT.*package\.json/i, confidence: 'high' },

      // Test Failures
      { category: 'Test Failure', pattern: /test.*failed/i, confidence: 'high' },
      { category: 'Test Failure', pattern: /assertion.*failed/i, confidence: 'high' },
      { category: 'Test Failure', pattern: /expected.*but\s+got/i, confidence: 'high' },
      { category: 'Test Failure', pattern: /\d+\s+failing/i, confidence: 'high' },
      { category: 'Test Failure', pattern: /AssertionError/i, confidence: 'high' },

      // Syntax Errors
      { category: 'Syntax Error', pattern: /SyntaxError/i, confidence: 'high' },
      { category: 'Syntax Error', pattern: /unexpected\s+token/i, confidence: 'high' },
      { category: 'Syntax Error', pattern: /invalid\s+syntax/i, confidence: 'high' },

      // Runtime Errors
      { category: 'Runtime Error', pattern: /TypeError/i, confidence: 'high' },
      { category: 'Runtime Error', pattern: /ReferenceError/i, confidence: 'high' },
      { category: 'Runtime Error', pattern: /RangeError/i, confidence: 'high' },
      { category: 'Runtime Error', pattern: /cannot\s+read\s+property/i, confidence: 'high' },
      { category: 'Runtime Error', pattern: /undefined\s+is\s+not/i, confidence: 'high' },

      // Network/API Errors (More specific to prevent false positives)
      { category: 'Network Error', pattern: /ECONNREFUSED/i, confidence: 'high' },
      { category: 'Network Error', pattern: /ETIMEDOUT/i, confidence: 'high' },
      { category: 'Network Error', pattern: /network\s+error/i, confidence: 'medium' },
      // Fixed: Use word boundaries and proper status code ranges to avoid false positives from URLs/dates
      { category: 'API Error', pattern: /\bHTTP\s+(4[0-9]{2}|5[0-9]{2})\b(?!\.)/i, confidence: 'high' },
      { category: 'API Error', pattern: /\bstatus\s+code[:\s]+(4[0-9]{2}|5[0-9]{2})\b/i, confidence: 'high' },

      // GitHub Actions specific errors
      { category: 'CI Error', pattern: /##\[error\]/i, confidence: 'high' },
      { category: 'CI Error', pattern: /Error:\s+Process\s+completed\s+with\s+exit\s+code/i, confidence: 'high' },

      // Exit Codes and Process Failures
      { category: 'Process Exit', pattern: /exit\s+code\s+[1-9]\d*/i, confidence: 'high' },
      { category: 'Process Exit', pattern: /command\s+failed/i, confidence: 'medium' },
      // Detect explicit exit commands with non-zero status (e.g., "exit 1" in shell)
      { category: 'Exit Failure', pattern: /^\s*exit\s+[1-9]\d*\s*$/i, confidence: 'high' },
      // Detect bash command failures
      { category: 'Process Exit', pattern: /exited\s+with\s+code\s+[1-9]\d*/i, confidence: 'high' },

      // Generic Errors
      { category: 'Error', pattern: /\bERROR\b/i, confidence: 'medium' },
      { category: 'Error', pattern: /\bFATAL\b/i, confidence: 'high' },
      { category: 'Error', pattern: /\bCRITICAL\b/i, confidence: 'high' },
    ];

    for (const line of lines) {
      for (const { category, pattern, confidence } of errorPatterns) {
        if (pattern.test(line)) {
          const error = {
            category,
            errorMessage: line,
            confidence,
            evidenceLogLines: [line],
          };

          // Mark intentional failures for machine-readable classification
          if (category === 'Exit Failure') {
            error.isIntentionalFailure = true;
          }

          errors.push(error);
          break; // One error per line
        }
      }
    }

    return errors;
  }

  /**
   * Deduplicate errors
   */
  deduplicateErrors(errors) {
    const seen = new Set();
    return errors.filter(error => {
      const key = `${error.category}:${error.errorMessage}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
}
