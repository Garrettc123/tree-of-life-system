/**
 * Gap Analyzer - identifies implementation and documentation gaps using
 * observable GitHub/Linear API results. Unsupported sources are marked as
 * incomplete instead of silently represented as having zero gaps.
 */

class GapAnalyzer {
  constructor(config = {}) {
    this.githubToken = config.githubToken;
    this.linearApiKey = config.linearApiKey;
    this.notionToken = config.notionToken;
    this.fetchImpl = config.fetchImpl || globalThis.fetch;
    this.gaps = [];
    this.analysisStatus = {
      state: 'not_run',
      partial: true,
      sources: {},
      warnings: [],
    };
    if (typeof this.fetchImpl !== 'function') {
      throw new TypeError('GapAnalyzer requires a fetch implementation');
    }
  }

  async _githubGet(path) {
    if (!this.githubToken) throw new Error('GITHUB_TOKEN is not configured');
    const response = await this.fetchImpl(`https://api.github.com${path}`, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.githubToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'tree-of-life-gap-analyzer',
      },
    });
    if (!response.ok) {
      const error = new Error(`GitHub API returned HTTP ${response.status} for ${path}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  async analyzeSystem(owner, teamId) {
    console.log('[GapAnalyzer] Starting system analysis...');
    const sources = {
      github: { status: 'pending', repositoriesScanned: 0 },
      linear: { status: 'not_configured', projectsScanned: 0 },
      notion: { status: 'not_implemented' },
      crossPlatformLinkage: { status: 'not_implemented' },
    };
    const warnings = [];

    if (!this.githubToken) {
      this.analysisStatus = {
        state: 'failed',
        partial: true,
        sources: { ...sources, github: { status: 'not_configured', repositoriesScanned: 0 } },
        warnings: ['GitHub analysis requires GITHUB_TOKEN.'],
      };
      throw new Error('GitHub analysis unavailable: GITHUB_TOKEN is not configured');
    }
    if (!owner || typeof owner !== 'string') {
      throw new Error('GitHub owner is required for repository analysis');
    }

    let repositories;
    try {
      repositories = await this.analyzeRepositories(owner);
      sources.github = { status: 'complete', repositoriesScanned: this.lastRepositoryCount || 0 };
    } catch (error) {
      sources.github = {
        status: 'failed',
        repositoriesScanned: this.lastRepositoryCount || 0,
        error: error instanceof Error ? error.message : 'Unknown GitHub analysis failure',
      };
      this.analysisStatus = {
        state: 'failed',
        partial: true,
        sources,
        warnings: [sources.github.error],
      };
      throw error;
    }

    let linearProjects = [];
    if (this.linearApiKey && teamId) {
      try {
        linearProjects = await this.analyzeLinearProjects(teamId);
        sources.linear = {
          status: 'complete',
          projectsScanned: this.lastLinearProjectCount || 0,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown Linear analysis failure';
        sources.linear = { status: 'failed', projectsScanned: 0, error: message };
        warnings.push(message);
      }
    } else {
      sources.linear = {
        status: 'not_configured',
        projectsScanned: 0,
        reason: !this.linearApiKey ? 'LINEAR_API_KEY is not configured' : 'LINEAR_TEAM_ID is not configured',
      };
    }

    const documentation = await this.analyzeDocumentation();
    const integration = await this.analyzeIntegration();
    const categories = { repositories, linearProjects, documentation, integration };
    this.gaps = this._consolidateGaps(categories);

    const partial = Object.values(sources).some((source) => source.status !== 'complete') || warnings.length > 0;
    this.analysisStatus = {
      state: warnings.length > 0 ? 'degraded' : partial ? 'partial' : 'complete',
      partial,
      sources,
      warnings,
      gapCount: this.gaps.length,
      updatedAt: new Date().toISOString(),
    };

    console.log(
      `[GapAnalyzer] Found ${this.gaps.length} gaps; coverage=${this.analysisStatus.state}`,
    );
    return this.gaps;
  }

  getStatus() {
    return JSON.parse(JSON.stringify(this.analysisStatus));
  }

  async analyzeRepositories(owner) {
    const gaps = [];
    const repos = [];
    this.lastRepositoryCount = 0;

    for (let page = 1; page <= 50; page += 1) {
      const pageRepos = await this._githubGet(
        `/users/${encodeURIComponent(owner)}/repos?type=owner&sort=updated&per_page=100&page=${page}`,
      );
      if (!Array.isArray(pageRepos)) {
        throw new Error('GitHub repository listing returned an unexpected response');
      }
      repos.push(...pageRepos);
      if (pageRepos.length < 100) break;
    }

    if (repos.length >= 5000) {
      throw new Error('Repository scan reached the 5,000-repository safety limit');
    }
    this.lastRepositoryCount = repos.length;

    // Bound concurrent API requests to avoid creating a request burst on large accounts.
    const repoGaps = [];
    const warnings = [];
    const concurrency = 6;

    for (let start = 0; start < repos.length; start += concurrency) {
      const batch = repos.slice(start, start + concurrency);
      const batchResults = await Promise.all(batch.map(async (repo) => {
        const repoGapsForItem = [];
        const repoPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo.name)}`;

        try {
          const contents = await this._githubGet(`${repoPath}/contents`);
          if (!Array.isArray(contents)) {
            throw new Error('Root contents endpoint returned an unexpected response');
          }

          const hasReadme = contents.some((file) => /^README(?:\..+)?$/i.test(file.name));
          if (!hasReadme) {
            repoGapsForItem.push({
              type: 'missing_readme',
              severity: 'medium',
              repo: repo.name,
              description: `Repository ${repo.name} is missing README documentation`,
              action: 'create_readme',
            });
          }

          const hasLicense = contents.some((file) => /license/i.test(file.name));
          if (!hasLicense) {
            repoGapsForItem.push({
              type: 'missing_license',
              severity: 'low',
              repo: repo.name,
              description: `Repository ${repo.name} is missing LICENSE file`,
              action: 'create_license',
            });
          }

          let hasWorkflow = false;
          try {
            const workflows = await this._githubGet(`${repoPath}/contents/.github/workflows`);
            hasWorkflow = Array.isArray(workflows)
              && workflows.some((file) => file.type === 'file' && /\.ya?ml$/i.test(file.name));
          } catch (error) {
            if (!error || error.status !== 404) throw error;
          }

          if (!hasWorkflow && !repo.archived) {
            repoGapsForItem.push({
              type: 'missing_cicd',
              severity: 'high',
              repo: repo.name,
              description: `Repository ${repo.name} has no GitHub Actions workflow file in .github/workflows`,
              action: 'create_github_actions',
            });
          }

          return { gaps: repoGapsForItem };
        } catch (error) {
          return {
            gaps: [],
            warning: `Unable to inspect repository ${repo.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          };
        }
      }));

      for (const result of batchResults) {
        repoGaps.push(...result.gaps);
        if (result.warning) warnings.push(result.warning);
      }
    }

    if (warnings.length > 0) {
      this.lastRepositoryWarnings = warnings;
      throw new Error(
        `GitHub repository analysis incomplete for ${warnings.length} repository/repositories: ${warnings.slice(0, 3).join('; ')}`,
      );
    }

    this.lastRepositoryWarnings = [];
    gaps.push(...repoGaps);
    return gaps;
  }

  async analyzeLinearProjects(teamId) {
    const gaps = [];
    this.lastLinearProjectCount = 0;
    if (!this.linearApiKey) throw new Error('LINEAR_API_KEY is not configured');
    if (!teamId) throw new Error('LINEAR_TEAM_ID is not configured');

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
                state { name type }
              }
            }
          }
        }
      }
    `;

    const response = await this.fetchImpl('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.linearApiKey,
      },
      body: JSON.stringify({ query, variables: { teamId } }),
    });

    if (!response.ok) {
      throw new Error(`Linear API returned HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
      throw new Error(`Linear GraphQL error: ${payload.errors.map((item) => item.message || 'Unknown error').join('; ')}`);
    }

    const projects = payload?.data?.projects?.nodes;
    if (!Array.isArray(projects)) {
      throw new Error('Linear GraphQL response did not contain a project list');
    }
    this.lastLinearProjectCount = projects.length;

    for (const project of projects) {
      const issues = project.issues?.nodes;
      if (!Array.isArray(issues)) {
        throw new Error(`Linear project "${project.name}" returned an invalid issues list`);
      }

      if (issues.length === 0 && project.state === 'backlog') {
        gaps.push({
          type: 'empty_project',
          severity: 'medium',
          project: project.name,
          description: `Project "${project.name}" has no issues created`,
          action: 'generate_project_issues',
        });
      }

      if (!project.description || project.description.length < 50) {
        gaps.push({
          type: 'incomplete_description',
          severity: 'low',
          project: project.name,
          description: `Project "${project.name}" has incomplete description`,
          action: 'enhance_project_description',
        });
      }
    }

    return gaps;
  }

  async analyzeDocumentation() {
    // Notion analysis has not been implemented yet; report that limitation in
    // analysisStatus rather than inventing documentation gaps.
    return [];
  }

  async analyzeIntegration() {
    // Cross-platform linkage queries have not been implemented yet. Do not
    // create missing-linkage work until the underlying links are queried.
    return [];
  }

  _consolidateGaps(gapCategories) {
    const allGaps = [
      ...gapCategories.repositories,
      ...gapCategories.linearProjects,
      ...gapCategories.documentation,
      ...gapCategories.integration,
    ];
    const severityOrder = { high: 0, medium: 1, low: 2 };
    return allGaps.sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3));
  }

  getGapsByType(type) {
    return this.gaps.filter((gap) => gap.type === type);
  }

  getGapsBySeverity(severity) {
    return this.gaps.filter((gap) => gap.severity === severity);
  }
}

module.exports = GapAnalyzer;
