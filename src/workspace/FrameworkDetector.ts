import { FileInfo, FrameworkInfo } from '../types';
import { Logger } from '../utils/Logger';

/**
 * Detects the project framework, build tools, test framework, and package manager.
 */
export class FrameworkDetector {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('FrameworkDetector');
  }

  detect(files: Map<string, FileInfo>): FrameworkInfo | null {
    // Check for package.json-based (Node/JS)
    const pkgInfo = this.detectFromPackageJson(files);
    if (pkgInfo) { return pkgInfo; }

    // Python frameworks
    const pyInfo = this.detectPython(files);
    if (pyInfo) { return pyInfo; }

    // Rust
    if (files.has('Cargo.toml')) {
      return { name: 'Rust', version: '', type: 'library', buildTool: 'cargo' };
    }

    // Go
    if (files.has('go.mod')) {
      return { name: 'Go', version: '', type: 'backend', buildTool: 'go' };
    }

    // Java
    if (files.has('pom.xml')) {
      return { name: 'Java (Maven)', version: '', type: 'backend', buildTool: 'maven' };
    }
    if (files.has('build.gradle') || files.has('build.gradle.kts')) {
      return { name: 'Java (Gradle)', version: '', type: 'backend', buildTool: 'gradle' };
    }

    // Ruby
    if (files.has('Gemfile')) {
      const gemfile = files.get('Gemfile')?.content || '';
      if (gemfile.includes('rails')) {
        return { name: 'Ruby on Rails', version: '', type: 'fullstack', buildTool: 'bundler', testFramework: 'rspec' };
      }
      return { name: 'Ruby', version: '', type: 'backend', buildTool: 'bundler' };
    }

    // PHP
    if (files.has('composer.json')) {
      const composer = files.get('composer.json')?.content || '';
      if (composer.includes('laravel')) {
        return { name: 'Laravel', version: '', type: 'fullstack', buildTool: 'composer', testFramework: 'phpunit' };
      }
      return { name: 'PHP', version: '', type: 'backend', buildTool: 'composer' };
    }

    // Dart/Flutter
    if (files.has('pubspec.yaml')) {
      const pubspec = files.get('pubspec.yaml')?.content || '';
      if (pubspec.includes('flutter')) {
        return { name: 'Flutter', version: '', type: 'frontend', buildTool: 'flutter' };
      }
      return { name: 'Dart', version: '', type: 'library', buildTool: 'dart' };
    }

    // C/C++
    if (files.has('CMakeLists.txt')) {
      return { name: 'C/C++ (CMake)', version: '', type: 'library', buildTool: 'cmake' };
    }

    // .NET
    const csprojFiles = Array.from(files.keys()).filter(f => f.endsWith('.csproj'));
    if (csprojFiles.length > 0) {
      return { name: '.NET', version: '', type: 'backend', buildTool: 'dotnet' };
    }

    return null;
  }

  private detectFromPackageJson(files: Map<string, FileInfo>): FrameworkInfo | null {
    const pkgFile = files.get('package.json');
    if (!pkgFile) { return null; }

    try {
      const pkg = JSON.parse(pkgFile.content);
      const allDeps: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies };
      const packageManager = this.detectPackageManager(files);
      const testFramework = this.detectTestFramework(allDeps);

      // Next.js
      if (allDeps['next']) {
        return { name: 'Next.js', version: allDeps['next'], type: 'fullstack', buildTool: 'next', testFramework, packageManager };
      }

      // Nuxt
      if (allDeps['nuxt'] || allDeps['nuxt3']) {
        return { name: 'Nuxt', version: allDeps['nuxt'] || allDeps['nuxt3'], type: 'fullstack', buildTool: 'nuxt', testFramework, packageManager };
      }

      // Remix
      if (allDeps['@remix-run/react']) {
        return { name: 'Remix', version: allDeps['@remix-run/react'], type: 'fullstack', buildTool: 'remix', testFramework, packageManager };
      }

      // SvelteKit
      if (allDeps['@sveltejs/kit']) {
        return { name: 'SvelteKit', version: allDeps['@sveltejs/kit'], type: 'fullstack', buildTool: 'vite', testFramework, packageManager };
      }

      // React
      if (allDeps['react']) {
        const buildTool = allDeps['vite'] ? 'vite' : allDeps['react-scripts'] ? 'cra' : 'webpack';
        return { name: 'React', version: allDeps['react'], type: 'frontend', buildTool, testFramework, packageManager };
      }

      // Vue
      if (allDeps['vue']) {
        const buildTool = allDeps['vite'] ? 'vite' : 'webpack';
        return { name: 'Vue', version: allDeps['vue'], type: 'frontend', buildTool, testFramework, packageManager };
      }

      // Svelte
      if (allDeps['svelte']) {
        return { name: 'Svelte', version: allDeps['svelte'], type: 'frontend', buildTool: 'vite', testFramework, packageManager };
      }

      // Angular
      if (allDeps['@angular/core']) {
        return { name: 'Angular', version: allDeps['@angular/core'], type: 'frontend', buildTool: 'angular-cli', testFramework: testFramework || 'karma', packageManager };
      }

      // Express
      if (allDeps['express']) {
        return { name: 'Express', version: allDeps['express'], type: 'backend', testFramework, packageManager };
      }

      // Fastify
      if (allDeps['fastify']) {
        return { name: 'Fastify', version: allDeps['fastify'], type: 'backend', testFramework, packageManager };
      }

      // NestJS
      if (allDeps['@nestjs/core']) {
        return { name: 'NestJS', version: allDeps['@nestjs/core'], type: 'backend', testFramework: testFramework || 'jest', packageManager };
      }

      // Electron
      if (allDeps['electron']) {
        return { name: 'Electron', version: allDeps['electron'], type: 'fullstack', testFramework, packageManager };
      }

      // VS Code Extension
      if (allDeps['@types/vscode'] || pkg.engines?.vscode) {
        return { name: 'VS Code Extension', version: pkg.engines?.vscode || '', type: 'library', buildTool: allDeps['esbuild'] ? 'esbuild' : 'tsc', testFramework, packageManager };
      }

      // Generic Node.js
      return { name: 'Node.js', version: '', type: 'backend', testFramework, packageManager };
    } catch {
      return null;
    }
  }

  private detectPython(files: Map<string, FileInfo>): FrameworkInfo | null {
    const hasRequirements = files.has('requirements.txt');
    const hasPyproject = files.has('pyproject.toml');
    const hasSetupPy = files.has('setup.py');
    const hasManagePy = files.has('manage.py');

    if (!hasRequirements && !hasPyproject && !hasSetupPy && !hasManagePy) {
      return null;
    }

    const reqContent = files.get('requirements.txt')?.content || '';
    const pyprojectContent = files.get('pyproject.toml')?.content || '';
    const allContent = reqContent + pyprojectContent;

    if (hasManagePy || allContent.includes('django')) {
      return { name: 'Django', version: '', type: 'fullstack', testFramework: 'pytest', packageManager: 'pip' };
    }
    if (allContent.includes('flask')) {
      return { name: 'Flask', version: '', type: 'backend', testFramework: 'pytest', packageManager: 'pip' };
    }
    if (allContent.includes('fastapi')) {
      return { name: 'FastAPI', version: '', type: 'backend', testFramework: 'pytest', packageManager: 'pip' };
    }
    if (allContent.includes('streamlit')) {
      return { name: 'Streamlit', version: '', type: 'frontend', testFramework: 'pytest', packageManager: 'pip' };
    }
    if (allContent.includes('torch') || allContent.includes('tensorflow')) {
      return { name: 'Python ML', version: '', type: 'library', testFramework: 'pytest', packageManager: 'pip' };
    }

    return { name: 'Python', version: '', type: 'library', testFramework: 'pytest', packageManager: 'pip' };
  }

  private detectTestFramework(deps: Record<string, string>): string | undefined {
    if (deps['vitest']) { return 'vitest'; }
    if (deps['jest']) { return 'jest'; }
    if (deps['mocha']) { return 'mocha'; }
    if (deps['ava']) { return 'ava'; }
    if (deps['@playwright/test']) { return 'playwright'; }
    if (deps['cypress']) { return 'cypress'; }
    if (deps['@testing-library/react']) { return 'testing-library'; }
    return undefined;
  }

  private detectPackageManager(files: Map<string, FileInfo>): string {
    if (files.has('bun.lockb') || files.has('bun.lock')) { return 'bun'; }
    if (files.has('pnpm-lock.yaml')) { return 'pnpm'; }
    if (files.has('yarn.lock')) { return 'yarn'; }
    return 'npm';
  }
}
