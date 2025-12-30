/**
 * Gap Analyzer - Identifies missing implementations and documentation
 * Scans GitHub repos, Linear projects, and Notion pages to find gaps
 */

const { Octokit } = require('@octokit/rest');

class GapAnalyzer {
  constructor(config) {
    this.github = new Octokit({ auth: config.githubToken });
    this.linearApiKey = config.linearApiKey;
    this.notionToken = config.notionToken;
    this.gaps = [];
  }

  /**
   * Analyze entire system for gaps
   */
  async analyzeSystem(owner, teamId) {
    console.log('[GapAnalyzer] Starting system analysis...');
    
    const gaps = {
      repositories: await this.analyzeRepositories(owner),
      linearProjects: await this.analyzeLinearProjects(teamId),
      documentation: await this.analyzeDocumentation(),
      integration: await this.analyzeIntegration()
    };

    this.gaps = this._consolidateGaps(gaps);
    
    console.log(`[GapAnalyzer] Found ${this.gaps.length} gaps`);
    return this.gaps;
  }

  /**
   * Analyze GitHub repositories
   */
  async analyzeRepositories(owner) {
    const gaps = [];

    try {
      const { data: repos } = await this.github.repos.listForUser({ username: owner });

      for (const repo of repos) {
        // Check for missing README
        if (!repo.has_readme) {
          gaps.push({
            type: 'missing_readme',
            severity: 'medium',
            repo: repo.name,
            description: `Repository ${repo.name} is missing README documentation`,
            action: 'create_readme'
          });
        }

        // Check for missing LICENSE
        const { data: contents } = await this.github.repos.getContent({
          owner,
          repo: repo.name,
          path: ''
        });

        const hasLicense = contents.some(file => file.name.toLowerCase().includes('license'));
        if (!hasLicense) {
          gaps.push({
            type: 'missing_license',
            severity: 'low',
            repo: repo.name,
            description: `Repository ${repo.name} is missing LICENSE file`,
            action: 'create_license'
          });
        }

        // Check for missing CI/CD
        const hasGithubActions = contents.some(file => file.name === '.github');
        if (!hasGithubActions && !repo.archived) {
          gaps.push({
            type: 'missing_cicd',
            severity: 'high',
            repo: repo.name,
            description: `Repository ${repo.name} lacks CI/CD automation`,
            action: 'create_github_actions'
          });
        }
      }
    } catch (error) {
      console.error('[GapAnalyzer] Error analyzing repositories:', error);
    }

    return gaps;
  }

  /**
   * Analyze Linear projects
   */
  async analyzeLinearProjects(teamId) {
    const gaps = [];

    try {
      const query = `
        query GetProjects($teamId: String!) {
          projects(filter: { team: { id: { eq: $teamId } } }) {
            nodes {
              id
              name
              description
              state
              issues {
                nodes {
                  id
                  title
                  state {
                    name
                    type
                  }
                }
              }
            }
          }
        }
      `;

      const response = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.linearApiKey
        },
        body: JSON.stringify({ query, variables: { teamId } })
      });

      const { data } = await response.json();
      const projects = data.projects.nodes;

      for (const project of projects) {
        // Check for projects without issues
        if (project.issues.nodes.length === 0 && project.state === 'backlog') {
          gaps.push({
            type: 'empty_project',
            severity: 'medium',
            project: project.name,
            description: `Project "${project.name}" has no issues created`,
            action: 'generate_project_issues'
          });
        }

        // Check for missing descriptions
        if (!project.description || project.description.length < 50) {
          gaps.push({
            type: 'incomplete_description',
            severity: 'low',
            project: project.name,
            description: `Project "${project.name}" has incomplete description`,
            action: 'enhance_project_description'
          });
        }
      }
    } catch (error) {
      console.error('[GapAnalyzer] Error analyzing Linear projects:', error);
    }

    return gaps;
  }

  /**
   * Analyze Notion documentation
   */
  async analyzeDocumentation() {
    const gaps = [];

    // TODO: Implement Notion analysis via MCP
    // Check for:
    // - Missing API documentation
    // - Outdated architecture diagrams
    // - Incomplete integration guides

    return gaps;
  }

  /**
   * Analyze integration between platforms
   */
  async analyzeIntegration() {
    const gaps = [];

    // Check for:
    // - GitHub repos without corresponding Linear issues
    // - Linear projects without GitHub repos
    // - Notion pages not linked to projects

    gaps.push({
      type: 'integration_sync',
      severity: 'medium',
      description: 'Some GitHub repositories are not linked to Linear projects',
      action: 'create_integration_links'
    });

    return gaps;
  }

  /**
   * Consolidate and prioritize gaps
   */
  _consolidateGaps(gapCategories) {
    const allGaps = [
      ...gapCategories.repositories,
      ...gapCategories.linearProjects,
      ...gapCategories.documentation,
      ...gapCategories.integration
    ];

    // Sort by severity
    const severityOrder = { high: 0, medium: 1, low: 2 };
    return allGaps.sort((a, b) => {
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  /**
   * Get gaps by type
   */
  getGapsByType(type) {
    return this.gaps.filter(gap => gap.type === type);
  }

  /**
   * Get gaps by severity
   */
  getGapsBySeverity(severity) {
    return this.gaps.filter(gap => gap.severity === severity);
  }
}

module.exports = GapAnalyzer;
