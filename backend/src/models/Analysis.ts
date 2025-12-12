export interface LogStep {
  id: number;
  name: string;
  logLines: string[];
  duration: string; // e.g., '12s'
  status: 'success' | 'failure' | 'in_progress';
}

export interface DetectedError {
  category: string; // e.g., 'Dependency Issue', 'Test Failure'
  errorMessage: string;
  confidence: 'high' | 'medium' | 'low';
  evidenceLogLines: string[];
}

export interface AnalysisResult {
  rootCause: string;
  failureStage: string;
  suggestedFix: string;
  steps: LogStep[];
  detectedErrors: DetectedError[];
}
