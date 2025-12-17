import { GoogleGenerativeAI } from '@google/generative-ai';
import { RAGService } from './ragService.js';

export class AIAnalyzerService {
  constructor() {
    // Initialize Gemini AI only if API key is provided
    if (process.env.GEMINI_API_KEY) {
      this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      // Use gemini-2.0-flash (current model)
      this.model = this.genAI.getGenerativeModel({
        model: "gemini-1.5-flash"
      });
      this.useRealAI = true;
      console.log('✅ Google Gemini AI initialized (gemini-1.5-flash)');

      // Phase 3: Initialize RAG
      this.ragService = new RAGService();
      this.useRAG = true;
    } else {
      this.useRealAI = false;
      this.useRAG = false;
      console.warn('⚠️  GEMINI_API_KEY not found. Using mock AI responses.');
    }
  }

  /**
   * Analyzes the parsed log data with RAG enhancement
   * Phase 3: Now includes historical context retrieval
   */
  async analyzeFailure(steps, detectedErrors, chunks = null) {
    // Phase 3: Retrieve RAG context if available
    let ragContext = null;
    if (this.useRAG && chunks) {
      try {
        ragContext = await this.ragService.retrieveContext(detectedErrors, chunks);

        if (ragContext.hasSimilarCases) {
          console.log('📚 RAG Context:', this.ragService.formatContextSummary(ragContext));
        }
      } catch (error) {
        console.warn('⚠️  RAG retrieval failed:', error.message);
      }
    }

    // Build prompt (with or without RAG context)
    const basePrompt = this.constructPrompt(steps, detectedErrors);
    const prompt = ragContext && ragContext.hasSimilarCases
      ? this.ragService.buildEnhancedPrompt(basePrompt, ragContext)
      : basePrompt;

    // Use real AI if configured
    if (this.useRealAI) {
      try {
        console.log('🤖 Sending request to Google Gemini AI...');

        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        console.log('✅ Received response from Gemini AI');

        // Parse AI response
        const parsedResponse = this.parseAIResponse(text);

        // Add RAG confidence if available
        if (ragContext && ragContext.hasSimilarCases) {
          const confidence = this.ragService.assessConfidence(ragContext);
          parsedResponse.confidence = confidence;
          parsedResponse.usedRAG = true;
          parsedResponse.similarCasesCount = ragContext.similarCases.length;
        } else {
          parsedResponse.confidence = { score: 0.5, reason: 'No historical context available' };
          parsedResponse.usedRAG = false;
        }

        return parsedResponse;

      } catch (error) {
        console.error('❌ Gemini AI error:', error.message);
        console.log('⚠️  Falling back to mock response');
        return this.getMockResponse();
      }
    }

    // Fall back to mock response
    console.log('--- Using Mock AI Response ---');
    return this.getMockResponse();
  }

  /**
   * Parse AI response into structured format
   * Tries to extract JSON first, falls back to text parsing
   */
  parseAIResponse(aiText) {
    try {
      // Try to parse as JSON if AI returned JSON format
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          rootCause: parsed.rootCause || parsed.root_cause || 'Analysis completed',
          failureStage: parsed.failureStage || parsed.failure_stage || 'Build/Test',
          suggestedFix: parsed.suggestedFix || parsed.suggested_fix || parsed.fix || aiText
        };
      }
    } catch (error) {
      // JSON parsing failed, fall back to text extraction
    }

    // Extract information from text response
    const lines = aiText.split('\n').filter(line => line.trim());

    // Try to find specific sections
    let rootCause = 'Unable to determine root cause';
    let failureStage = 'Build/Test';
    let suggestedFix = aiText;

    // Look for common patterns in AI responses
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();

      if (line.includes('root cause') || line.includes('problem') || line.includes('issue')) {
        rootCause = lines[i + 1] || lines[i];
      }

      if (line.includes('stage') || line.includes('step')) {
        failureStage = lines[i + 1] || lines[i];
      }

      if (line.includes('fix') || line.includes('solution') || line.includes('resolve')) {
        suggestedFix = lines.slice(i).join('\n');
      }
    }

    return {
      rootCause: rootCause.replace(/^[\*\-#\d.]+\s*/, '').substring(0, 300),
      failureStage: failureStage.replace(/^[\*\-#\d.]+\s*/, '').substring(0, 100),
      suggestedFix: suggestedFix.substring(0, 500)
    };
  }

  /**
   * Mock response for when AI is not configured or fails
   */
  getMockResponse() {
    return {
      rootCause: 'The build failed because the `react-scripts` package, a crucial dependency for Create React App projects, was not found in the node_modules directory.',
      failureStage: 'Run npm build',
      suggestedFix: "The missing dependency suggests an incomplete or corrupted installation. Run `npm install` to ensure all dependencies from `package.json` are correctly installed. If the issue persists, consider deleting `node_modules` and `package-lock.json` before running `npm install` again to start with a clean slate.",
    };
  }

  /**
   * Construct a detailed prompt for the AI
   */
  constructPrompt(steps, detectedErrors) {
    let prompt = `You are an expert CI/CD troubleshooter. Analyze this build failure and provide a clear, actionable response.

Please respond in this JSON format:
{
  "rootCause": "Brief explanation of what caused the failure",
  "failureStage": "The specific build stage/step that failed",
  "suggestedFix": "Clear, actionable steps to fix the issue (include commands if applicable)"
}

`;

    prompt += '== Detected Errors ==\n';
    if (detectedErrors && detectedErrors.length > 0) {
      detectedErrors.forEach(error => {
        prompt += `- Category: ${error.category}\n`;
        prompt += `  Message: ${error.errorMessage}\n`;
        prompt += `  Confidence: ${error.confidence}\n`;
      });
    } else {
      prompt += 'No specific errors were automatically detected.\n';
    }

    prompt += '\n== Log Steps ==\n';
    if (steps && steps.length > 0) {
      steps.forEach(step => {
        prompt += `--- Step: ${step.name} (Status: ${step.status}) ---\n`;
        // Include last 50 lines of each step to avoid token limits
        const logSample = step.logLines.slice(-50).join('\n');
        prompt += logSample;
        prompt += '\n--------------------\n';
      });
    }

    prompt += '\nProvide your analysis in the JSON format specified above. Be concise but thorough.\n';

    return prompt;
  }
}
