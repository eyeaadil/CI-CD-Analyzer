import { AnalysisResult, DetectedError, LogStep } from '../models/Analysis';

export class AIAnalyzerService {
  /**
   * Analyzes the parsed log data to determine the root cause of a failure.
   * In this version, it returns a hardcoded mock response.
   */
  public async analyzeFailure(
    steps: LogStep[],
    detectedErrors: DetectedError[]
  ): Promise<Partial<AnalysisResult>> {
    const prompt = this.constructPrompt(steps, detectedErrors);

    // --- MOCK AI API CALL ---
    // In a real implementation, you would make an API call to an LLM provider here.
    console.log('--- Sending Prompt to AI ---');
    console.log(prompt);
    console.log('----------------------------');

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Return a hardcoded, sample analysis
    return {
      rootCause: 'The build failed because the `react-scripts` package, a crucial dependency for Create React App projects, was not found in the node_modules directory.',
      failureStage: 'Run npm build',
      suggestedFix: "The missing dependency suggests an incomplete or corrupted installation. Run `npm install` to ensure all dependencies from `package.json` are correctly installed. If the issue persists, consider deleting `node_modules` and `package-lock.json` before running `npm install` again to start with a clean slate.",
    };
  }

  private constructPrompt(steps: LogStep[], detectedErrors: DetectedError[]): string {
    let prompt = 'Analyze the following CI/CD log to determine the root cause of the failure and suggest a fix.\n\n';

    prompt += '== Detected Errors ==\n';
    if (detectedErrors.length > 0) {
      detectedErrors.forEach(error => {
        prompt += `- Category: ${error.category}\n`;
        prompt += `  Message: ${error.errorMessage}\n`;
      });
    } else {
      prompt += 'No specific errors were automatically detected.\n';
    }

    prompt += '\n== Log Steps ==\n';
    steps.forEach(step => {
      prompt += `--- Step: ${step.name} ---\n`;
      prompt += step.logLines.slice(-50).join('\n'); // Include last 50 lines of the step
      prompt += '\n--------------------\n';
    });

    prompt += '\nBased on the provided logs and detected errors, please provide:\n';
    prompt += '1. A concise root cause of the failure.\n';
    prompt += '2. The specific stage or step where the failure occurred.\n';
    prompt += '3. An actionable suggested fix with commands if applicable.\n';

    return prompt;
  }
}
