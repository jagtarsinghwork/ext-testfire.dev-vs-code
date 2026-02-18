import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';
import * as vscode from 'vscode';
import * as path from 'path';

export class PaiMCPClient {
  private client: Client;
  private transport!: StdioClientTransport;
  private serverProcess: any;

  constructor(private context: vscode.ExtensionContext) {
    this.client = new Client(
      {
        name: 'testfire-pai-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      },
    );
  }

  async start() {
    // Start MCP server process
    const serverPath = path.join(
      this.context.extensionPath,
      'dist',
      'mcp',
      'paiServer.js',
    );

    this.serverProcess = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });

    this.transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
    });

    await this.client.connect(this.transport);
    console.log('Connected to Pai MCP Server');
  }

  async stop() {
    if (this.serverProcess) {
      this.serverProcess.kill();
    }
    await this.transport.close();
  }

  async analyzeCode(code: string, language: string, task?: string) {
    return await this.client.request(
      {
        method: 'tools/call',
        params: {
          name: 'analyze_code',
          arguments: { code, language, task },
        },
      },
      {} as any,
    );
  }

  async generateCode(description: string, language: string, context?: string) {
    return await this.client.request(
      {
        method: 'tools/call',
        params: {
          name: 'generate_code',
          arguments: { description, language, context },
        },
      },
      {} as any,
    );
  }

  async explainCode(code: string, language: string) {
    return await this.client.request(
      {
        method: 'tools/call',
        params: {
          name: 'explain_code',
          arguments: { code, language },
        },
      },
      {} as any,
    );
  }

  async findBugs(code: string, language: string) {
    return await this.client.request(
      {
        method: 'tools/call',
        params: {
          name: 'find_bugs',
          arguments: { code, language },
        },
      },
      {} as any,
    );
  }

  async refactorCode(code: string, language: string, goal?: string) {
    return await this.client.request(
      {
        method: 'tools/call',
        params: {
          name: 'refactor_code',
          arguments: { code, language, goal },
        },
      },
      {} as any,
    );
  }

  async listTools() {
    return await this.client.request(
      {
        method: 'tools/list',
        params: {},
      },
      {} as any,
    );
  }
}
