const axios = require('axios');
const logger = require('../utils/logger');

/**
 * CodeGeneratorService - AI-powered code generation using GPT-4
 * 
 * Generates production-ready code from specifications with:
 * - Multi-file implementations
 * - Enterprise design patterns
 * - Comprehensive documentation
 * - Unit test scaffolding
 * 
 * @class CodeGeneratorService
 */
class CodeGeneratorService {
  /**
   * @param {Object} config - OpenAI API configuration
   * @param {string} config.apiKey - OpenAI API key
   * @param {string} config.model - Model name (default: gpt-4)
   * @param {number} config.temperature - Generation temperature (default: 0.2)
   */
  constructor(config) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'gpt-4';
    this.temperature = config.temperature || 0.2;
    this.baseURL = 'https://api.openai.com/v1';
    
    logger.info('[CodeGeneratorService] Initialized with model:', this.model);
  }

  /**
   * Generate implementation plan from specifications
   * 
   * @param {Object} specs - Technical specifications
   * @returns {Promise<Object>} Implementation plan with file structure
   */
  async generatePlan(specs) {
    try {
      const prompt = this.buildPlanPrompt(specs);
      
      const response = await this.callOpenAI({
        messages: [
          {
            role: 'system',
            content: 'You are a senior software architect. Generate detailed implementation plans with file structures, architecture decisions, and estimated complexity.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 2000
      });

      const plan = this.parsePlanResponse(response);
      
      logger.info(`[CodeGeneratorService] Generated plan with ${plan.files.length} files`);
      
      return plan;

    } catch (error) {
      logger.error('[CodeGeneratorService] Plan generation failed:', error.message);
      throw new Error(`Plan generation failed: ${error.message}`);
    }
  }

  /**
   * Generate code for a specific file
   * 
   * @param {Object} fileSpec - File specification
   * @param {string} fileSpec.path - File path
   * @param {string} fileSpec.description - File description
   * @param {string} fileSpec.type - File type (class, function, config, test)
   * @param {Object} fileSpec.context - Additional context from plan
   * @returns {Promise<string>} Generated code content
   */
  async generateCode(fileSpec) {
    try {
      const prompt = this.buildCodePrompt(fileSpec);
      
      const response = await this.callOpenAI({
        messages: [
          {
            role: 'system',
            content: 'You are an expert software engineer. Generate production-ready, well-documented code following best practices. Include comprehensive JSDoc comments, error handling, and logging.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: this.temperature,
        max_tokens: 4000
      });

      const code = this.extractCode(response);
      
      logger.info(`[CodeGeneratorService] Generated code for ${fileSpec.path} (${code.length} chars)`);
      
      return code;

    } catch (error) {
      logger.error(`[CodeGeneratorService] Code generation failed for ${fileSpec.path}:`, error.message);
      throw new Error(`Code generation failed: ${error.message}`);
    }
  }

  /**
   * Build prompt for implementation plan generation
   * 
   * @param {Object} specs - Technical specifications
   * @returns {string} Formatted prompt
   */
  buildPlanPrompt(specs) {
    return `Generate an implementation plan for the following feature:

**Title**: ${specs.title}

**Description**:
${specs.description}

**Requirements**:
${specs.requirements.features.map((f, i) => `${i + 1}. ${f}`).join('\n')}

**Priority**: ${specs.priority}
**Estimate**: ${specs.estimate} story points

Provide a JSON response with:
{
  "summary": "Brief overview of the implementation",
  "architecture": "Architectural approach and design patterns",
  "files": [
    {
      "path": "src/path/to/file.js",
      "description": "Purpose of this file",
      "type": "class|function|config|test",
      "dependencies": ["list", "of", "dependencies"]
    }
  ],
  "estimatedLOC": 500,
  "complexity": "low|medium|high",
  "context": "Additional context for code generation"
}`;
  }

  /**
   * Build prompt for code generation
   * 
   * @param {Object} fileSpec - File specification
   * @returns {string} Formatted prompt
   */
  buildCodePrompt(fileSpec) {
    return `Generate production-ready code for:

**File Path**: ${fileSpec.path}
**Description**: ${fileSpec.description}
**Type**: ${fileSpec.type}

**Context**:
${fileSpec.context || 'Standard implementation'}

**Requirements**:
${fileSpec.issueSpecs.requirements.features.slice(0, 3).map((f, i) => `${i + 1}. ${f}`).join('\n')}

**Guidelines**:
- Use modern JavaScript (ES6+)
- Include comprehensive JSDoc comments
- Add error handling and validation
- Include logging for debugging
- Follow enterprise design patterns
- Make code testable and maintainable

${fileSpec.type === 'test' ? '- Write comprehensive unit tests with >80% coverage' : ''}

Provide ONLY the code, no explanations.`;
  }

  /**
   * Call OpenAI API
   * 
   * @param {Object} params - API parameters
   * @returns {Promise<string>} Response content
   */
  async callOpenAI(params) {
    const response = await axios.post(
      `${this.baseURL}/chat/completions`,
      {
        model: this.model,
        messages: params.messages,
        temperature: params.temperature,
        max_tokens: params.max_tokens
      },
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.choices[0].message.content;
  }

  /**
   * Parse plan response from OpenAI
   * 
   * @param {string} response - Raw response text
   * @returns {Object} Parsed plan object
   */
  parsePlanResponse(response) {
    try {
      // Extract JSON from response (may be wrapped in markdown)
      const jsonMatch = response.match(/```json\s*([\s\S]*?)```/) || 
                       response.match(/({[\s\S]*})/);
      
      if (jsonMatch) {
        const plan = JSON.parse(jsonMatch[1]);
        
        // Validate plan structure
        if (!plan.files || !Array.isArray(plan.files)) {
          throw new Error('Invalid plan structure: missing files array');
        }
        
        return plan;
      }
      
      throw new Error('Could not extract JSON from response');
      
    } catch (error) {
      logger.error('[CodeGeneratorService] Failed to parse plan response:', error.message);
      
      // Return minimal plan structure
      return {
        summary: 'Auto-generated implementation',
        architecture: 'Modular architecture',
        files: [
          {
            path: 'src/index.js',
            description: 'Main implementation file',
            type: 'function',
            dependencies: []
          }
        ],
        estimatedLOC: 100,
        complexity: 'medium',
        context: response.substring(0, 500)
      };
    }
  }

  /**
   * Extract code from response
   * 
   * @param {string} response - Raw response text
   * @returns {string} Extracted code
   */
  extractCode(response) {
    // Try to extract code from markdown code blocks
    const codeBlockMatch = response.match(/```(?:javascript|js)?\s*([\s\S]*?)```/);
    
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }
    
    // If no code block, return entire response
    return response.trim();
  }
}

module.exports = CodeGeneratorService;
