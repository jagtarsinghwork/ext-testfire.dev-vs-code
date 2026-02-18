import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';

// Your Pai API configuration
const PAI_API_KEY = 'sk-e2b45913cd774a4aa534a913c1dc788c';
const PAI_API_URL = 'https://api.pai.com/v1/chat/completions'; // Update with actual Pai endpoint

// Create MCP Server
const server = new Server(
  {
    name: 'pai-assistant',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'analyze_code',
        description: 'Analyze code and suggest improvements',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            language: { type: 'string' },
            task: { type: 'string' },
          },
          required: ['code'],
        },
      },
      {
        name: 'generate_code',
        description: 'Generate code based on requirements',
        inputSchema: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            language: { type: 'string' },
            context: { type: 'string' },
          },
          required: ['description'],
        },
      },
      {
        name: 'explain_code',
        description: 'Explain code in detail',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            language: { type: 'string' },
          },
          required: ['code'],
        },
      },
      {
        name: 'find_bugs',
        description: 'Find bugs and security issues',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            language: { type: 'string' },
          },
          required: ['code'],
        },
      },
      {
        name: 'refactor_code',
        description: 'Suggest refactoring improvements',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            language: { type: 'string' },
            goal: { type: 'string' },
          },
          required: ['code'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (!args) {
      throw new Error('Missing arguments');
    }

    switch (name) {
      case 'analyze_code':
        return await analyzeCodeWithPai(
          args.code as string,
          args.language as string,
          args.task as string | undefined,
        );
      case 'generate_code':
        return await generateCodeWithPai(
          args.description as string,
          args.language as string,
          args.context as string | undefined,
        );
      case 'explain_code':
        return await explainCodeWithPai(
          args.code as string,
          args.language as string,
        );
      case 'find_bugs':
        return await findBugsWithPai(
          args.code as string,
          args.language as string,
        );
      case 'refactor_code':
        return await refactorCodeWithPai(
          args.code as string,
          args.language as string,
          args.goal as string | undefined,
        );
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// Pai API Integration Functions
async function callPaiAPI(
  prompt: string,
  systemPrompt?: string,
): Promise<string> {
  try {
    const response = await axios.post(
      PAI_API_URL,
      {
        model: 'pai-model', // Update with actual model name
        messages: [
          ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      },
      {
        headers: {
          Authorization: `Bearer ${PAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      },
    );

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('Pai API error:', error);
    throw error;
  }
}

async function analyzeCodeWithPai(
  code: string,
  language: string,
  task?: string,
) {
  const systemPrompt = `You are an expert ${language} developer. Analyze code carefully and provide specific, actionable feedback.`;

  const prompt = `Please analyze this ${language} code:

\`\`\`${language}
${code}
\`\`\`

Task: ${task || 'Review this code for quality, bugs, and improvements'}

Provide:
1. Overall assessment
2. Specific issues found
3. Improvement suggestions
4. Best practices to apply`;

  const analysis = await callPaiAPI(prompt, systemPrompt);

  return {
    content: [
      {
        type: 'text',
        text: analysis,
      },
    ],
  };
}

async function generateCodeWithPai(
  description: string,
  language: string,
  context?: string,
) {
  const systemPrompt = `You are an expert ${language} developer. Generate clean, efficient, and well-documented code.`;

  const prompt = `Generate ${language} code for this requirement:

Description: ${description}
${context ? `Context:\n${context}` : ''}

Requirements:
- Follow ${language} best practices
- Include error handling
- Add comments for complex logic
- Make it production-ready

Generate only the code:`;

  const code = await callPaiAPI(prompt, systemPrompt);

  return {
    content: [
      {
        type: 'text',
        text: code,
      },
    ],
  };
}

async function explainCodeWithPai(code: string, language: string) {
  const systemPrompt = `You are an expert ${language} teacher. Explain code in a clear, educational way.`;

  const prompt = `Explain this ${language} code line by line:

\`\`\`${language}
${code}
\`\`\`

Provide:
1. What the code does overall
2. Explanation of each section
3. Key concepts used
4. Potential edge cases`;

  const explanation = await callPaiAPI(prompt, systemPrompt);

  return {
    content: [
      {
        type: 'text',
        text: explanation,
      },
    ],
  };
}

async function findBugsWithPai(code: string, language: string) {
  const systemPrompt = `You are a security expert and debugger. Find bugs, security issues, and edge cases.`;

  const prompt = `Find all bugs and issues in this ${language} code:

\`\`\`${language}
${code}
\`\`\`

Look for:
1. Logic errors
2. Security vulnerabilities
3. Performance issues
4. Edge cases
5. Memory leaks
6. Race conditions

For each issue, provide:
- Severity (High/Medium/Low)
- Description
- Fix suggestion`;

  const bugs = await callPaiAPI(prompt, systemPrompt);

  return {
    content: [
      {
        type: 'text',
        text: bugs,
      },
    ],
  };
}

async function refactorCodeWithPai(
  code: string,
  language: string,
  goal?: string,
) {
  const systemPrompt = `You are an expert ${language} architect. Refactor code to be more maintainable and efficient.`;

  const prompt = `Refactor this ${language} code:

\`\`\`${language}
${code}
\`\`\`

Goal: ${goal || 'Improve code quality and maintainability'}

Provide:
1. Refactored code
2. Explanation of changes
3. Benefits of refactoring
4. Potential trade-offs`;

  const refactored = await callPaiAPI(prompt, systemPrompt);

  return {
    content: [
      {
        type: 'text',
        text: refactored,
      },
    ],
  };
}

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Pai MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
