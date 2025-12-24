import { GoogleGenerativeAI } from '@google/generative-ai';
import { RAGService } from './ragService.js';

export class AIAnalyzerService {
  constructor() {
    // Initialize Gemini AI only if API key is provided
    if (process.env.GEMINI_API_KEY) {
      this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      // Use gemini-2.0-flash (current model)
      this.model = this.genAI.getGenerativeModel({
        model: "gemini-2.5-flash-lite"
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
   * @param {Array} steps - Parsed log steps
   * @param {Array} detectedErrors - Detected errors
   * @param {Array} chunks - Log chunks for RAG
   * @param {Object} classificationContext - Optional priority context from classifier
   */
  async analyzeFailure(steps, detectedErrors, chunks = null, classificationContext = null) {
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

    // Build prompt (with or without RAG context and classification)
    const basePrompt = this.constructPrompt(steps, detectedErrors, classificationContext);
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
   * @param {Array} steps - Parsed log steps
   * @param {Array} detectedErrors - Detected errors  
   * @param {Object} classificationContext - Optional priority context
   * @param {Object} ragContext - Optional RAG context for historical grounding
   */
  constructPrompt(steps, detectedErrors, classificationContext = null, ragContext = null) {
    // ============================================
    // SECTION 1: STRICT OUTPUT RULES (Top Priority)
    // ============================================
    let prompt = `IMPORTANT OUTPUT RULES:
- Respond with ONLY valid JSON
- Do NOT include explanations, markdown, or extra text
- Do NOT wrap JSON in code blocks
- The response MUST start with '{' and end with '}'
- If you are unsure, still return JSON using your best judgment

You are an expert CI/CD troubleshooter analyzing a build failure.

`;

    // ============================================
    // SECTION 2: PRIMARY ERROR SIGNALS (Authoritative)
    // ============================================
    prompt += `== PRIMARY ERROR SIGNALS (AUTHORITATIVE) ==
These errors were extracted deterministically and are TRUSTED. Base your analysis primarily on these.

`;
    if (detectedErrors && detectedErrors.length > 0) {
      // Sort errors by priority (high confidence first)
      const sortedErrors = [...detectedErrors].sort((a, b) => {
        const priorityOrder = { 'high': 0, 'medium': 1, 'low': 2 };
        return (priorityOrder[a.confidence] || 2) - (priorityOrder[b.confidence] || 2);
      });

      sortedErrors.forEach(error => {
        prompt += `• [${error.confidence?.toUpperCase() || 'MEDIUM'}] ${error.category}: ${error.errorMessage}\n`;
        if (error.isIntentionalFailure) {
          prompt += `  ⚠️ INTENTIONAL FAILURE - This is P0 priority, MUST be the root cause\n`;
        }
      });
    } else {
      prompt += 'No specific errors were automatically detected. Analyze logs for clues.\n';
    }

    // ============================================
    // SECTION 3: PRIORITY ENFORCEMENT (Critical)
    // ============================================
    prompt += `
== FAILURE PRIORITY RULES (MUST FOLLOW) ==

Priority Hierarchy (highest to lowest):
- P0: Intentional failures (exit 1) → ALWAYS the root cause, ignore everything else
- P1: Test failures → Prefer over lint/warnings
- P2: Build/compile errors → Prefer over runtime/lint
- P3: Runtime errors → Prefer over dependencies/lint
- P4-P7: Infrastructure, security, timeout, dependency issues
- P8-P10: Config, permission, lint/warnings → NEVER root cause if higher exists

BEFORE determining rootCause, you MUST:
1. Identify the HIGHEST priority error present
2. Explicitly IGNORE all lower-priority issues
3. Base the rootCause ONLY on the highest-priority failure

`;

    if (classificationContext) {
      prompt += `CURRENT FAILURE CONTEXT:
- Detected Type: ${classificationContext.failureType}
- Priority Level: P${classificationContext.priority}
- Your analysis MUST align with this classification

`;
    }

    // ============================================
    // SECTION 4: RAG GROUNDING RULES (If Present)
    // ============================================
    if (ragContext && ragContext.hasSimilarCases) {
      prompt += `== HISTORICAL CONTEXT (RAG) ==
Similar failures have been seen before. Use this context wisely.

RAG RULES:
- PREFER historical fixes over speculation
- Do NOT invent fixes that contradict past resolutions
- If multiple fixes exist, choose the most frequently successful one
- If RAG context contradicts detected errors, DETECTED ERRORS WIN

Similar Cases Found: ${ragContext.similarCases?.length || 0}

`;
    }

    // ============================================
    // SECTION 5: REQUIRED OUTPUT FORMAT
    // ============================================
    prompt += `== REQUIRED JSON OUTPUT FORMAT ==
{
  "rootCause": "Brief, specific explanation of what caused the failure (1-2 sentences)",
  "failureStage": "The exact build stage/step name that failed",
  "suggestedFix": "Clear, actionable steps to fix the issue. Include commands if applicable."
}

`;

    // ============================================
    // SECTION 6: SUPPORTING LOG EVIDENCE (Secondary)
    // ============================================
    prompt += `== SUPPORTING LOG EVIDENCE ==
These logs SUPPORT the errors above. Do NOT let verbose logs override the primary error signals.

`;
    if (steps && steps.length > 0) {
      steps.forEach(step => {
        prompt += `--- Step: ${step.name} (Status: ${step.status}) ---\n`;
        // Include last 30 lines to reduce noise
        const logSample = step.logLines.slice(-30).join('\n');
        prompt += logSample;
        prompt += '\n--------------------\n';
      });
    }

    // ============================================
    // SECTION 7: FINAL INSTRUCTIONS
    // ============================================
    prompt += `
== FINAL INSTRUCTIONS ==
1. Respond with ONLY the JSON object, nothing else
2. The highest-priority error MUST be the rootCause
3. Be specific about the failure stage name
4. Provide actionable fix steps (include commands when helpful)
5. Start your response with '{' and end with '}'
`;

    return prompt;
  }

  /**
   * Classify failure type using AI when deterministic classifier returns UNKNOWN
   * @param {Array} chunks - Log chunks
   * @param {Array} detectedErrors - Detected errors
   * @returns {Object} Classification result with suggested type
   */
  async classifyWithAI(chunks, detectedErrors) {
    if (!this.useRealAI) {
      return {
        failureType: 'UNKNOWN',
        priority: 99,
        confidence: { score: 0.0, reason: 'AI not available' }
      };
    }

    const categories = [
      'TEST - Test failures (Jest, Mocha, Vitest, Cypress, Playwright)',
      'BUILD - Compilation/build errors (TypeScript, Webpack, Babel, Vite)',
      'RUNTIME - Runtime errors (TypeError, ReferenceError, exceptions)',
      'INFRA - Infrastructure issues (Docker, Kubernetes, network, database)',
      'SECURITY - Security vulnerabilities, auth failures, secret issues',
      'TIMEOUT - Timeout or deadline exceeded (any timeout)',
      'DEPENDENCY - Package/dependency issues (npm, yarn, pnpm, resolution)',
      'CONFIG - Configuration or environment variable issues',
      'PERMISSION - Permission or access denied errors (EACCES, EPERM)',
      'LINT - Linting, formatting, or code style warnings (ESLint, Prettier)'
    ];

    const errorSummary = detectedErrors.slice(0, 5).map(e =>
      `• [${e.confidence?.toUpperCase() || 'MEDIUM'}] ${e.category}: ${e.errorMessage?.substring(0, 150)}`
    ).join('\n');

    const chunkSummary = chunks
      .filter(c => c.hasErrors)
      .slice(0, 2)
      .map(c => `Step: ${c.stepName}\n${c.content.substring(0, 300)}`)
      .join('\n---\n');

    const prompt = `STRICT OUTPUT RULES:
- Respond with ONLY valid JSON, nothing else
- Do NOT include explanations or markdown
- Start with '{' and end with '}'

You are a CI/CD failure classifier. Classify this failure into ONE category.

== AVAILABLE CATEGORIES (with priority) ==
Priority 1-2 (Critical):
${categories.slice(0, 2).join('\n')}

Priority 3-5 (High):
${categories.slice(2, 5).join('\n')}

Priority 6-8 (Medium):
${categories.slice(5, 8).join('\n')}

Priority 9-10 (Low):
${categories.slice(8).join('\n')}

== DETECTED ERRORS (Primary Signal) ==
${errorSummary || 'No specific errors detected'}

== LOG EXCERPTS (Supporting Evidence) ==
${chunkSummary || 'No error chunks available'}

== REQUIRED JSON OUTPUT ==
{
  "failureType": "CATEGORY_NAME",
  "priority": <number 1-10>,
  "confidence": <decimal 0.0 to 1.0>,
  "reason": "Brief explanation (1 sentence)"
}

== RULES ==
1. PREFER existing categories - only create NEW if absolutely none fit
2. If creating new: SHORT name (1-2 words), UPPERCASE, underscores only
3. Priority must match category type (TEST=1, BUILD=2, RUNTIME=3, etc.)
4. Use UNKNOWN only as last resort
5. Respond with ONLY the JSON object, nothing else`;

    try {
      console.log('🤖 AI classifying unknown failure...');
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Parse JSON response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Normalize the category name: UPPERCASE, replace spaces with underscores
        let failureType = (parsed.failureType || 'UNKNOWN')
          .toUpperCase()
          .trim()
          .replace(/\s+/g, '_')
          .replace(/[^A-Z0-9_]/g, '');

        // Ensure it's not empty
        if (!failureType || failureType.length === 0) {
          failureType = 'UNKNOWN';
        }

        // Log if it's a new category
        const knownTypes = ['TEST', 'BUILD', 'RUNTIME', 'INFRA', 'SECURITY',
          'TIMEOUT', 'DEPENDENCY', 'CONFIG', 'PERMISSION', 'LINT', 'UNKNOWN', 'INTENTIONAL'];

        if (!knownTypes.includes(failureType)) {
          console.log(`🆕 AI suggested NEW category: ${failureType}`);
        } else {
          console.log(`✅ AI classified as: ${failureType}`);
        }

        return {
          failureType,
          priority: parsed.priority || 99,
          confidence: {
            score: parsed.confidence || 0.5,
            reason: parsed.reason || 'AI classification'
          },
          aiClassified: true,
          isNewCategory: !knownTypes.includes(failureType)
        };
      }
    } catch (error) {
      console.error('❌ AI classification error:', error.message);
    }

    return {
      failureType: 'UNKNOWN',
      priority: 99,
      confidence: { score: 0.0, reason: 'AI classification failed' }
    };
  }
}
