import { AIProvider, AIMessage } from '../types';

export interface CommitMessageOptions {
  type?: ConventionalCommitType;
  scope?: string;
  breaking?: boolean;
  customTemplate?: string;
  maxLength?: number;
  includeBody?: boolean;
  includeFooter?: boolean;
}

export type ConventionalCommitType =
  | 'feat' // New feature
  | 'fix' // Bug fix
  | 'docs' // Documentation only changes
  | 'style' // Changes that don't affect code meaning (formatting, etc)
  | 'refactor' // Code change that neither fixes a bug nor adds a feature
  | 'perf' // Performance improvement
  | 'test' // Adding or correcting tests
  | 'build' // Changes to build system or dependencies
  | 'ci' // Changes to CI configuration
  | 'chore' // Other changes that don't modify src or test files
  | 'revert'; // Reverts a previous commit

export interface GeneratedCommitMessage {
  subject: string;
  body?: string;
  footer?: string;
  full: string;
  type: ConventionalCommitType;
  scope?: string;
  breaking: boolean;
}

/**
 * Generates meaningful commit messages from git diffs using AI
 * Follows Conventional Commits specification (https://www.conventionalcommits.org/)
 */
export class CommitMessageGenerator {
  constructor(private aiProvider?: AIProvider) {}

  /**
   * Generate a commit message from a git diff
   * @param diff Git diff output
   * @param stagedFiles List of staged files
   * @param options Generation options
   */
  async generateFromDiff(
    diff: string,
    stagedFiles: string[],
    options: CommitMessageOptions = {},
  ): Promise<GeneratedCommitMessage> {
    // Analyze diff to determine commit type if not provided
    const type = options.type || this.analyzeCommitType(diff, stagedFiles);
    const scope = options.scope || this.detectScope(stagedFiles);
    const breaking = options.breaking || this.detectBreakingChange(diff);

    // Use AI to generate message if available
    if (this.aiProvider) {
      try {
        return await this.generateWithAI(diff, stagedFiles, {
          ...options,
          type,
          scope: scope || undefined,
          breaking,
        });
      } catch (error) {
        console.error(
          'AI generation failed, falling back to rule-based:',
          error,
        );
      }
    }

    // Fallback to rule-based generation
    return this.generateRuleBased(diff, stagedFiles, {
      ...options,
      type,
      scope: scope || undefined,
      breaking,
    });
  }

  /**
   * Generate commit message using AI
   */
  private async generateWithAI(
    diff: string,
    stagedFiles: string[],
    options: CommitMessageOptions & {
      type: ConventionalCommitType;
      scope?: string;
      breaking: boolean;
    },
  ): Promise<GeneratedCommitMessage> {
    const prompt = this.buildAIPrompt(diff, stagedFiles, options);

    const messages: AIMessage[] = [
      {
        role: 'system',
        content: `You are an expert at writing concise, meaningful Git commit messages following the Conventional Commits specification.

Rules:
1. Format: <type>[optional scope]: <description>
2. Subject line: 50 chars or less, imperative mood, no period
3. Body: Wrap at 72 characters, explain WHAT and WHY (not HOW)
4. Footer: Include BREAKING CHANGE or issue references
5. Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert

Example:
feat(auth): add OAuth2 login support

Implement OAuth2 authentication flow with Google and GitHub providers.
Users can now sign in using their social accounts.

BREAKING CHANGE: Local auth API endpoints changed from /auth/* to /auth/local/*
Closes #123`,
      },
      {
        role: 'user',
        content: prompt,
      },
    ];

    const response = await this.aiProvider!.chat(messages);
    return this.parseAIResponse(response, options);
  }

  /**
   * Build prompt for AI generation
   */
  private buildAIPrompt(
    diff: string,
    stagedFiles: string[],
    options: CommitMessageOptions,
  ): string {
    const fileSummary = this.summarizeFiles(stagedFiles);
    const diffSummary = this.summarizeDiff(diff);

    let prompt = `Generate a commit message for the following changes:\n\n`;
    prompt += `Files changed (${stagedFiles.length}):\n${fileSummary}\n\n`;
    prompt += `Change summary:\n${diffSummary}\n\n`;

    if (options.type) {
      prompt += `Preferred type: ${options.type}\n`;
    }
    if (options.scope) {
      prompt += `Scope: ${options.scope}\n`;
    }
    if (options.breaking) {
      prompt += `⚠️  This is a BREAKING CHANGE\n`;
    }
    if (options.customTemplate) {
      prompt += `\nTemplate format:\n${options.customTemplate}\n`;
    }

    prompt += `\nProvide a commit message in Conventional Commits format.`;

    if (options.includeBody) {
      prompt += ` Include a body section explaining the changes.`;
    }
    if (options.includeFooter) {
      prompt += ` Include a footer if there are breaking changes or issue references.`;
    }

    return prompt;
  }

  /**
   * Parse AI response into structured commit message
   */
  private parseAIResponse(
    response: string,
    options: {
      type: ConventionalCommitType;
      scope?: string;
      breaking: boolean;
    },
  ): GeneratedCommitMessage {
    const lines = response.trim().split('\n');
    const subject = lines[0].trim();

    // Extract type and scope from subject
    const match = subject.match(/^(\w+)(?:\(([^)]+)\))?:\s*(.+)$/);
    const type = (match?.[1] as ConventionalCommitType) || options.type;
    const scope = match?.[2] || options.scope || undefined;
    const description = match?.[3] || subject;

    // Find body (paragraphs after empty line)
    let body: string | undefined;
    let footer: string | undefined;
    let bodyStartIndex = -1;

    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '' && i + 1 < lines.length) {
        bodyStartIndex = i + 1;
        break;
      }
    }

    if (bodyStartIndex > -1) {
      const bodyLines: string[] = [];
      const footerLines: string[] = [];
      let inFooter = false;

      for (let i = bodyStartIndex; i < lines.length; i++) {
        const line = lines[i];
        if (
          line.startsWith('BREAKING CHANGE:') ||
          line.match(/^[\w-]+:\s*#?\d+/)
        ) {
          inFooter = true;
        }

        if (inFooter) {
          footerLines.push(line);
        } else if (line.trim()) {
          bodyLines.push(line);
        }
      }

      if (bodyLines.length > 0) {
        body = bodyLines.join('\n').trim();
      }
      if (footerLines.length > 0) {
        footer = footerLines.join('\n').trim();
      }
    }

    const breaking =
      options.breaking || (footer?.includes('BREAKING CHANGE:') ?? false);

    // Build full message
    let full = subject;
    if (body) {
      full += '\n\n' + body;
    }
    if (footer) {
      full += '\n\n' + footer;
    }

    return {
      subject: description,
      body,
      footer,
      full,
      type,
      scope,
      breaking,
    };
  }

  /**
   * Generate commit message using rule-based approach (fallback)
   */
  private generateRuleBased(
    diff: string,
    stagedFiles: string[],
    options: CommitMessageOptions & {
      type: ConventionalCommitType;
      scope?: string;
      breaking: boolean;
    },
  ): GeneratedCommitMessage {
    const stats = this.analyzeDiffStats(diff);
    const type = options.type;
    const scope = options.scope;
    const breaking = options.breaking;

    // Generate subject
    let subject = '';
    const scopePart = scope ? `(${scope})` : '';
    const breakingFlag = breaking ? '!' : '';

    if (stagedFiles.length === 1) {
      const fileName = this.getFileName(stagedFiles[0]);
      subject = `${type}${scopePart}${breakingFlag}: update ${fileName}`;
    } else {
      subject = `${type}${scopePart}${breakingFlag}: update ${stagedFiles.length} files`;
    }

    // Generate body
    let body: string | undefined;
    if (options.includeBody) {
      const bodyLines: string[] = [];

      if (stats.additions > 0 || stats.deletions > 0) {
        bodyLines.push(
          `Changes: +${stats.additions} -${stats.deletions} lines`,
        );
      }

      const fileSummary = this.summarizeFiles(stagedFiles)
        .split('\n')
        .slice(0, 5);
      if (fileSummary.length > 0) {
        bodyLines.push('', 'Modified files:');
        bodyLines.push(...fileSummary);
      }

      body = bodyLines.join('\n');
    }

    // Generate footer
    let footer: string | undefined;
    if (options.includeFooter && breaking) {
      footer = 'BREAKING CHANGE: API changes may affect existing integrations';
    }

    // Build full message
    let full = subject;
    if (body) {
      full += '\n\n' + body;
    }
    if (footer) {
      full += '\n\n' + footer;
    }

    return {
      subject,
      body,
      footer,
      full,
      type,
      scope,
      breaking,
    };
  }

  /**
   * Analyze commit type from diff and files
   */
  private analyzeCommitType(
    diff: string,
    files: string[],
  ): ConventionalCommitType {
    const diffLower = diff.toLowerCase();
    const fileNames = files.map((f) => f.toLowerCase());

    // Check for specific patterns
    if (
      fileNames.some(
        (f) =>
          f.includes('test') || f.includes('.spec.') || f.includes('.test.'),
      )
    ) {
      return 'test';
    }

    if (
      fileNames.some(
        (f) => f.includes('readme') || f.includes('.md') || f.includes('docs/'),
      )
    ) {
      return 'docs';
    }

    if (
      fileNames.some(
        (f) =>
          f.includes('package.json') ||
          f.includes('package-lock.json') ||
          f.includes('yarn.lock') ||
          f.includes('pnpm-lock.yaml') ||
          f.includes('dockerfile') ||
          f.includes('webpack') ||
          f.includes('rollup') ||
          f.includes('vite'),
      )
    ) {
      return 'build';
    }

    if (
      fileNames.some(
        (f) =>
          f.includes('.github/') ||
          f.includes('.gitlab-ci') ||
          f.includes('jenkins') ||
          f.includes('.travis'),
      )
    ) {
      return 'ci';
    }

    // Check diff content
    if (
      diffLower.includes('fix') ||
      diffLower.includes('bug') ||
      diffLower.includes('issue')
    ) {
      return 'fix';
    }

    if (
      diffLower.includes('performance') ||
      diffLower.includes('optimize') ||
      diffLower.includes('speed')
    ) {
      return 'perf';
    }

    // Check for new files (likely a feature)
    const newFiles = diff.match(/^\+\+\+ b\//gm)?.length || 0;
    const deletedFiles = diff.match(/^--- a\//gm)?.length || 0;

    if (newFiles > deletedFiles) {
      return 'feat';
    }

    // Default to refactor for changes
    return 'refactor';
  }

  /**
   * Detect scope from file paths
   */
  private detectScope(files: string[]): string | undefined {
    if (files.length === 0) {
      return undefined;
    }

    // Find common directory
    const paths = files.map((f) => f.split('/'));
    const commonParts: string[] = [];

    for (let i = 0; i < paths[0].length - 1; i++) {
      const part = paths[0][i];
      if (paths.every((p) => p[i] === part)) {
        commonParts.push(part);
      } else {
        break;
      }
    }

    if (commonParts.length > 0) {
      // Use the last common directory as scope
      const scope = commonParts[commonParts.length - 1];

      // Filter out generic names
      if (!['src', 'lib', 'app', 'components', 'utils'].includes(scope)) {
        return scope;
      }
    }

    // Try to detect scope from file names
    const fileNames = files.map((f) => this.getFileName(f).toLowerCase());

    if (fileNames.some((f) => f.includes('auth'))) {
      return 'auth';
    }
    if (fileNames.some((f) => f.includes('api'))) {
      return 'api';
    }
    if (fileNames.some((f) => f.includes('ui') || f.includes('component'))) {
      return 'ui';
    }
    if (fileNames.some((f) => f.includes('db') || f.includes('database'))) {
      return 'db';
    }
    if (fileNames.some((f) => f.includes('config'))) {
      return 'config';
    }

    return undefined;
  }

  /**
   * Detect if changes are breaking
   */
  private detectBreakingChange(diff: string): boolean {
    const indicators = [
      /BREAKING\s*CHANGE/i,
      /breaking:/i,
      /\bremove\w*\s+\w*(function|method|class|interface|api|endpoint)/i,
      /\bdelete\w*\s+\w*(function|method|class|interface|api|endpoint)/i,
      /major\s+version/i,
      /incompatible\s+change/i,
    ];

    return indicators.some((pattern) => pattern.test(diff));
  }

  /**
   * Summarize files in human-readable format
   */
  private summarizeFiles(files: string[]): string {
    if (files.length === 0) {
      return '(no files)';
    }

    const grouped = this.groupFilesByType(files);
    const lines: string[] = [];

    for (const [ext, fileList] of Object.entries(grouped)) {
      if (fileList.length <= 3) {
        lines.push(...fileList.map((f) => `  - ${f}`));
      } else {
        lines.push(`  - ${fileList.length} ${ext} files`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Group files by extension
   */
  private groupFilesByType(files: string[]): Record<string, string[]> {
    const grouped: Record<string, string[]> = {};

    for (const file of files) {
      const ext = file.split('.').pop() || 'other';
      if (!grouped[ext]) {
        grouped[ext] = [];
      }
      grouped[ext].push(file);
    }

    return grouped;
  }

  /**
   * Summarize diff in human-readable format
   */
  private summarizeDiff(diff: string): string {
    const stats = this.analyzeDiffStats(diff);
    const lines: string[] = [];

    lines.push(`Lines: +${stats.additions} -${stats.deletions}`);

    if (stats.newFiles > 0) {
      lines.push(`New files: ${stats.newFiles}`);
    }
    if (stats.deletedFiles > 0) {
      lines.push(`Deleted files: ${stats.deletedFiles}`);
    }
    if (stats.modifiedFiles > 0) {
      lines.push(`Modified files: ${stats.modifiedFiles}`);
    }

    // Extract significant changes (function/class definitions)
    const addedFunctions = diff.match(
      /^\+.*(?:function|class|interface|const|let|var)\s+(\w+)/gm,
    );
    if (addedFunctions && addedFunctions.length > 0) {
      lines.push(`New definitions: ${addedFunctions.length}`);
    }

    return lines.join('\n');
  }

  /**
   * Analyze diff statistics
   */
  private analyzeDiffStats(diff: string): {
    additions: number;
    deletions: number;
    newFiles: number;
    deletedFiles: number;
    modifiedFiles: number;
  } {
    const lines = diff.split('\n');
    let additions = 0;
    let deletions = 0;
    let newFiles = 0;
    let deletedFiles = 0;
    let modifiedFiles = 0;

    for (const line of lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        additions++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        deletions++;
      } else if (line.startsWith('+++ b/')) {
        modifiedFiles++;
      } else if (line.match(/^new file mode/)) {
        newFiles++;
      } else if (line.match(/^deleted file mode/)) {
        deletedFiles++;
      }
    }

    return { additions, deletions, newFiles, deletedFiles, modifiedFiles };
  }

  /**
   * Get file name from path
   */
  private getFileName(path: string): string {
    return path.split('/').pop() || path;
  }

  /**
   * Format commit message with template
   */
  formatWithTemplate(
    message: GeneratedCommitMessage,
    template?: string,
  ): string {
    if (!template) {
      return message.full;
    }

    return template
      .replace('{type}', message.type)
      .replace('{scope}', message.scope || '')
      .replace('{subject}', message.subject)
      .replace('{body}', message.body || '')
      .replace('{footer}', message.footer || '')
      .replace('{breaking}', message.breaking ? '!' : '');
  }

  /**
   * Validate commit message format
   */
  validateFormat(message: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const lines = message.split('\n');

    // Check subject line
    const subject = lines[0];
    if (!subject) {
      errors.push('Subject line is required');
      return { valid: false, errors };
    }

    if (subject.length > 72) {
      errors.push('Subject line should be 72 characters or less');
    }

    if (
      !/^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?!?:\s.+/.test(
        subject,
      )
    ) {
      errors.push('Subject should follow format: type(scope): description');
    }

    if (subject.endsWith('.')) {
      errors.push('Subject should not end with a period');
    }

    // Check body line length
    for (let i = 2; i < lines.length; i++) {
      if (lines[i].length > 72 && !lines[i].startsWith('http')) {
        errors.push(`Line ${i + 1} exceeds 72 characters`);
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
