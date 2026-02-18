import * as vscode from 'vscode';
import { LogLevel, LogEntry } from '../types';

const MAX_LOG_ENTRIES = 500;

/**
 * Centralized logger with VS Code output channel and in-memory log buffer.
 */
export class Logger {
  private static outputChannel: vscode.OutputChannel | null = null;
  private static logBuffer: LogEntry[] = [];
  private static minLevel: LogLevel = 'info';

  constructor(private context: string) {}

  static init(): vscode.OutputChannel {
    if (!Logger.outputChannel) {
      Logger.outputChannel = vscode.window.createOutputChannel('TestFire AI');
    }
    return Logger.outputChannel;
  }

  static setLevel(level: LogLevel): void {
    Logger.minLevel = level;
  }

  static getLogs(): LogEntry[] {
    return [...Logger.logBuffer];
  }

  static clear(): void {
    Logger.logBuffer = [];
    Logger.outputChannel?.clear();
  }

  debug(message: string, data?: unknown): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: unknown): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: unknown): void {
    this.log('error', message, data);
  }

  /**
   * Measure execution time of an async function.
   */
  async time<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      this.info(`${label} completed in ${Date.now() - start}ms`);
      return result;
    } catch (err: any) {
      this.error(`${label} failed after ${Date.now() - start}ms: ${err.message}`);
      throw err;
    }
  }

  private log(level: LogLevel, message: string, data?: unknown): void {
    if (!this.shouldLog(level)) { return; }

    const entry: LogEntry = {
      level,
      message,
      timestamp: Date.now(),
      context: this.context,
      data,
    };

    // Buffer
    Logger.logBuffer.push(entry);
    if (Logger.logBuffer.length > MAX_LOG_ENTRIES) {
      Logger.logBuffer.shift();
    }

    // Output channel
    const timestamp = new Date().toISOString().substring(11, 23);
    const prefix = `[${timestamp}] [${level.toUpperCase()}] [${this.context}]`;
    const logLine = data
      ? `${prefix} ${message} ${JSON.stringify(data)}`
      : `${prefix} ${message}`;

    Logger.outputChannel?.appendLine(logLine);

    // Console for development
    if (level === 'error') {
      console.error(logLine);
    } else if (level === 'warn') {
      console.warn(logLine);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(Logger.minLevel);
  }
}
