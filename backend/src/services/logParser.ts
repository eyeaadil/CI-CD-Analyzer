import { AnalysisResult, LogStep, DetectedError } from '../models/Analysis';

export class LogParserService {
  public parse(rawLog: string): Partial<AnalysisResult> {
    const cleanedLines = this.cleanLog(rawLog);
    const steps = this.groupIntoSteps(cleanedLines);
    const detectedErrors = this.detectErrors(steps);

    return {
      steps,
      detectedErrors,
    };
  }

  private cleanLog(rawLog: string): string[] {
    // Regex to remove ANSI escape codes (for colors)
    const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
    // Regex to remove GitHub Actions timestamps (e.g., 2023-10-27T10:30:00.123Z)
    const timestampRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s+/;

    const lines = rawLog.split('\n');
    return lines.map(line => line.replace(ansiRegex, '').replace(timestampRegex, '').trim());
  }

  private groupIntoSteps(lines: string[]): LogStep[] {
    // Basic implementation: for now, we'll treat the whole log as one step.
    // We will improve this later to detect distinct steps.
    const steps: LogStep[] = [
      {
        id: 1,
        name: 'Full Log', // Placeholder name
        logLines: lines,
        duration: 'N/A',
        status: 'failure', // Assume failure for now
      },
    ];
    return steps;
  }

  private detectErrors(steps: LogStep[]): DetectedError[] {
    const errors: DetectedError[] = [];
    const errorPatterns = [
      { category: 'Dependency Issue', pattern: /cannot find module/i },
      { category: 'Dependency Issue', pattern: /npm ERR!/i },
      { category: 'Test Failure', pattern: /assertion error/i },
      { category: 'Build Issue', pattern: /build step failed/i },
      { category: 'Generic Error', pattern: /error:/i },
      { category: 'Generic Error', pattern: /exit code [1-9]/i },
    ];

    for (const step of steps) {
      for (const line of step.logLines) {
        for (const { category, pattern } of errorPatterns) {
          if (pattern.test(line)) {
            errors.push({
              category,
              errorMessage: line,
              confidence: 'medium', // Default confidence
              evidenceLogLines: [line],
            });
          }
        }
      }
    }

    // Simple deduplication
    return Array.from(new Set(errors.map(e => e.errorMessage))).map(errorMessage => {
      return errors.find(e => e.errorMessage === errorMessage)!;
    });
  }
}
