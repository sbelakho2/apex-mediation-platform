import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

export interface CommitInfo {
  hash: string;
  type: string;
  scope?: string;
  subject: string;
  body?: string;
  breaking: boolean;
  author: string;
  date: string;
}

export interface ChangelogSection {
  title: string;
  commits: CommitInfo[];
}

export interface ReleaseNotes {
  version: string;
  date: string;
  breaking_changes: boolean;
  sections: ChangelogSection[];
  raw_changelog: string;
  migration_guide?: string;
}

/**
 * Service for generating changelogs from conventional commits
 * Follows Angular convention: type(scope): subject
 * 
 * Types:
 * - feat: New feature
 * - fix: Bug fix
 * - docs: Documentation changes
 * - style: Formatting, missing semicolons, etc.
 * - refactor: Code restructuring
 * - perf: Performance improvements
 * - test: Adding tests
 * - chore: Maintenance tasks
 * 
 * Breaking changes: Footer starting with "BREAKING CHANGE:" or ! after type/scope
 */
export class ChangelogGenerationService {
  private readonly repoPath: string;

  constructor(repoPath: string = process.cwd()) {
    this.repoPath = repoPath;
  }

  /**
   * Generate full changelog and update CHANGELOG.md
   */
  async generateChangelog(version: string): Promise<ReleaseNotes> {
    console.log(`📝 Generating changelog for v${version}...`);

    // Get commits since last tag
    const commits = await this.getCommitsSinceLastTag();
    console.log(`Found ${commits.length} commits`);

    // Parse conventional commits
    const parsedCommits = this.parseConventionalCommits(commits);

    // Group by type
    const sections = this.groupCommitsByType(parsedCommits);

    // Check for breaking changes
    const breaking_changes = parsedCommits.some(c => c.breaking);

    // Generate markdown
    const raw_changelog = this.generateMarkdown(version, sections, breaking_changes);

    // Update CHANGELOG.md
    await this.updateChangelogFile(raw_changelog);

    // Generate migration guide if breaking changes
    let migration_guide: string | undefined;
    if (breaking_changes) {
      migration_guide = await this.generateMigrationGuide(version, parsedCommits);
    }

    console.log('✅ Changelog generated');

    return {
      version,
      date: new Date().toISOString().split('T')[0],
      breaking_changes,
      sections,
      raw_changelog,
      migration_guide,
    };
  }

  /**
   * Get commits since last git tag
   */
  private async getCommitsSinceLastTag(): Promise<string[]> {
    try {
      // Get last tag
      const { stdout: lastTag } = await execAsync('git describe --tags --abbrev=0 HEAD^', {
        cwd: this.repoPath,
      });

      // Get commits since last tag
      const { stdout: commits } = await execAsync(
        `git log ${lastTag.trim()}..HEAD --format=%H|||%s|||%b|||%an|||%ad --date=short`,
        { cwd: this.repoPath }
      );

      return commits
        .trim()
        .split('\n')
        .filter(line => line.length > 0);
    } catch (error) {
      // No previous tag, get all commits
      console.log('No previous tag found, getting all commits');
      const { stdout: commits } = await execAsync(
        'git log --format=%H|||%s|||%b|||%an|||%ad --date=short',
        { cwd: this.repoPath }
      );

      return commits
        .trim()
        .split('\n')
        .filter(line => line.length > 0);
    }
  }

  /**
   * Parse conventional commit format
   * Format: type(scope): subject
   * Example: feat(ios): add new banner ad format
   */
  private parseConventionalCommits(commits: string[]): CommitInfo[] {
    const parsed: CommitInfo[] = [];

    // Regex: type(optional-scope): subject
    const conventionalRegex = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;

    for (const commit of commits) {
      const [hash, subject, body, author, date] = commit.split('|||');

      const match = subject.match(conventionalRegex);
      if (!match) {
        // Not a conventional commit, skip or treat as chore
        console.log(`⚠️ Non-conventional commit: ${subject}`);
        parsed.push({
          hash: hash.substring(0, 7),
          type: 'chore',
          subject: subject,
          body: body || undefined,
          breaking: body?.includes('BREAKING CHANGE:') || false,
          author,
          date,
        });
        continue;
      }

      const [, type, scope, breaking_marker, message] = match;

      parsed.push({
        hash: hash.substring(0, 7),
        type: type.toLowerCase(),
        scope: scope || undefined,
        subject: message,
        body: body || undefined,
        breaking: breaking_marker === '!' || body?.includes('BREAKING CHANGE:'),
        author,
        date,
      });
    }

    return parsed;
  }

  /**
   * Group commits by type for changelog sections
   */
  private groupCommitsByType(commits: CommitInfo[]): ChangelogSection[] {
    const sections: Map<string, CommitInfo[]> = new Map();

    for (const commit of commits) {
      const existing = sections.get(commit.type) || [];
      existing.push(commit);
      sections.set(commit.type, existing);
    }

    // Map types to human-readable titles
    const titleMap: Record<string, string> = {
      feat: '🚀 Features',
      fix: '🐛 Bug Fixes',
      perf: '⚡ Performance Improvements',
      refactor: '♻️ Code Refactoring',
      docs: '📚 Documentation',
      test: '✅ Tests',
      style: '💄 Styling',
      chore: '🔧 Maintenance',
      ci: '👷 CI/CD',
      build: '📦 Build System',
    };

    const result: ChangelogSection[] = [];

    // Order: feat, fix, perf, refactor, others
    const order = ['feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'style', 'chore', 'ci', 'build'];

    for (const type of order) {
      const commits = sections.get(type);
      if (commits && commits.length > 0) {
        result.push({
          title: titleMap[type] || type.toUpperCase(),
          commits,
        });
      }
    }

    // Add remaining types not in order
    for (const [type, commits] of sections.entries()) {
      if (!order.includes(type)) {
        result.push({
          title: titleMap[type] || type.toUpperCase(),
          commits,
        });
      }
    }

    return result;
  }

  /**
   * Generate markdown changelog
   */
  private generateMarkdown(
    version: string,
    sections: ChangelogSection[],
    breaking: boolean
  ): string {
    const date = new Date().toISOString().split('T')[0];
    let markdown = `## [${version}] - ${date}\n\n`;

    if (breaking) {
      markdown += '### ⚠️ BREAKING CHANGES\n\n';
      for (const section of sections) {
        for (const commit of section.commits) {
          if (commit.breaking) {
            const scope = commit.scope ? `**${commit.scope}**: ` : '';
            markdown += `- ${scope}${commit.subject} ([${commit.hash}](../../commit/${commit.hash}))\n`;
            if (commit.body) {
              const breakingSection = commit.body.split('BREAKING CHANGE:')[1];
              if (breakingSection) {
                markdown += `  ${breakingSection.trim()}\n`;
              }
            }
          }
        }
      }
      markdown += '\n';
    }

    for (const section of sections) {
      markdown += `### ${section.title}\n\n`;
      for (const commit of section.commits) {
        const scope = commit.scope ? `**${commit.scope}**: ` : '';
        const breaking = commit.breaking ? ' 🔥' : '';
        markdown += `- ${scope}${commit.subject}${breaking} ([${commit.hash}](../../commit/${commit.hash}))\n`;
      }
      markdown += '\n';
    }

    return markdown;
  }

  /**
   * Update CHANGELOG.md file
   */
  private async updateChangelogFile(newContent: string): Promise<void> {
    const changelogPath = path.join(this.repoPath, 'CHANGELOG.md');

    try {
      // Read existing changelog
      const existing = await fs.readFile(changelogPath, 'utf-8');

      // Insert new content after header
      const lines = existing.split('\n');
      const headerEnd = lines.findIndex(line => line.startsWith('## ['));
      
      let updated: string;
      if (headerEnd === -1) {
        // No previous releases, add header
        updated = `# Changelog\n\nAll notable changes to this project will be documented in this file.\n\nThe format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),\nand this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).\n\n${newContent}`;
      } else {
        // Insert before first existing release
        lines.splice(headerEnd, 0, newContent);
        updated = lines.join('\n');
      }

      await fs.writeFile(changelogPath, updated, 'utf-8');
      console.log('✅ CHANGELOG.md updated');
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Create new CHANGELOG.md
        const content = `# Changelog\n\nAll notable changes to this project will be documented in this file.\n\nThe format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),\nand this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).\n\n${newContent}`;
        await fs.writeFile(changelogPath, content, 'utf-8');
        console.log('✅ CHANGELOG.md created');
      } else {
        throw error;
      }
    }
  }

  /**
   * Generate migration guide for breaking changes
   */
  private async generateMigrationGuide(
    version: string,
    commits: CommitInfo[]
  ): Promise<string> {
    console.log('📋 Generating migration guide for breaking changes...');

    const breakingCommits = commits.filter(c => c.breaking);

    let guide = `# Migration Guide: v${version}\n\n`;
    guide += `This release contains breaking changes. Please follow this guide to upgrade.\n\n`;
    guide += `## Breaking Changes\n\n`;

    for (const commit of breakingCommits) {
      guide += `### ${commit.subject}\n\n`;
      
      if (commit.body) {
        const breakingSection = commit.body.split('BREAKING CHANGE:')[1];
        if (breakingSection) {
          guide += `${breakingSection.trim()}\n\n`;
        }
      }

      guide += `**Commit:** [${commit.hash}](../../commit/${commit.hash})\n\n`;
    }

    guide += `## Migration Steps\n\n`;
    guide += `1. Update your dependency to v${version}\n`;
    guide += `2. Review breaking changes above\n`;
    guide += `3. Update your code according to changes\n`;
    guide += `4. Test thoroughly before deploying\n\n`;
    guide += `## Need Help?\n\n`;
    guide += `- Discord: https://discord.gg/apexmediation\n`;
    guide += `- Email: support@apexmediation.com\n`;
    guide += `- Docs: https://docs.apexmediation.com/migration/v${version}\n`;

    // Save to docs/migration/
    const migrationDir = path.join(this.repoPath, 'docs', 'migration');
    await fs.mkdir(migrationDir, { recursive: true });
    const migrationPath = path.join(migrationDir, `v${version}.md`);
    await fs.writeFile(migrationPath, guide, 'utf-8');

    console.log(`✅ Migration guide saved to docs/migration/v${version}.md`);

    return guide;
  }

  /**
   * Format changelog for email
   */
  formatForEmail(releaseNotes: ReleaseNotes): string {
    let email = `<h2>ApexMediation SDK v${releaseNotes.version}</h2>\n\n`;

    if (releaseNotes.breaking_changes) {
      email += `<p><strong>⚠️ This release contains breaking changes.</strong> Please review the <a href="https://docs.apexmediation.com/migration/v${releaseNotes.version}">migration guide</a>.</p>\n\n`;
    }

    email += `<h3>What's Changed</h3>\n\n`;

    for (const section of releaseNotes.sections) {
      email += `<h4>${section.title}</h4>\n<ul>\n`;
      for (const commit of section.commits) {
        const scope = commit.scope ? `<strong>${commit.scope}</strong>: ` : '';
        const breaking = commit.breaking ? ' 🔥' : '';
        email += `  <li>${scope}${commit.subject}${breaking}</li>\n`;
      }
      email += `</ul>\n\n`;
    }

    email += `<h3>Installation</h3>\n\n`;
    email += `<p><strong>iOS (CocoaPods)</strong></p>\n`;
    email += `<pre><code>pod 'ApexMediation', '~> ${releaseNotes.version}'</code></pre>\n\n`;
    email += `<p><strong>Android (Gradle)</strong></p>\n`;
    email += `<pre><code>implementation 'com.apexmediation:sdk:${releaseNotes.version}'</code></pre>\n\n`;
    email += `<p><strong>Unity (NPM)</strong></p>\n`;
    email += `<pre><code>npm install @apexmediation/unity-sdk@${releaseNotes.version}</code></pre>\n\n`;

    email += `<p>View full release notes on <a href="https://github.com/apexmediation/platform/releases/tag/v${releaseNotes.version}">GitHub</a>.</p>\n`;

    return email;
  }

  /**
   * Get release notes for specific version
   */
  async getReleaseNotes(version: string): Promise<ReleaseNotes> {
    console.log(`📖 Getting release notes for v${version}...`);

    const changelogPath = path.join(this.repoPath, 'CHANGELOG.md');
    const content = await fs.readFile(changelogPath, 'utf-8');

    // Extract section for this version
    const versionRegex = new RegExp(`## \\[${version}\\] - (\\d{4}-\\d{2}-\\d{2})(.*?)(?=## \\[|$)`, 's');
    const match = content.match(versionRegex);

    if (!match) {
      throw new Error(`Version ${version} not found in CHANGELOG.md`);
    }

    const [, date, sectionContent] = match;

    // Parse sections
    const sections: ChangelogSection[] = [];
    const sectionRegex = /### (.+?)\n((?:- .+\n?)+)/g;
    let sectionMatch;

    while ((sectionMatch = sectionRegex.exec(sectionContent)) !== null) {
      const [, title, commitsText] = sectionMatch;
      const commits: CommitInfo[] = [];

      const commitRegex = /- (?:\*\*(.+?)\*\*: )?(.+?)(?: 🔥)? \(\[(.+?)\]/g;
      let commitMatch;

      while ((commitMatch = commitRegex.exec(commitsText)) !== null) {
        const [, scope, subject, hash] = commitMatch;
        commits.push({
          hash,
          type: '',
          scope: scope || undefined,
          subject,
          breaking: commitsText.includes('🔥'),
          author: '',
          date: date,
        });
      }

      sections.push({ title, commits });
    }

    const breaking_changes = sectionContent.includes('⚠️ BREAKING CHANGES');

    return {
      version,
      date,
      breaking_changes,
      sections,
      raw_changelog: match[0],
    };
  }
}
