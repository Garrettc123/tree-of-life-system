const GapAnalyzer = require('../agents/planning/gap-analyzer');

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function githubFetchForRepository(rootContents) {
  return async (url, init = {}) => {
    if (url.includes('/users/owner/repos?')) {
      expect(init.headers.Authorization).toBe('Bearer test-token');
      return response(200, [{
        name: 'sample-repo',
        archived: false,
        default_branch: 'main',
      }]);
    }
    if (url.endsWith('/repos/owner/sample-repo/contents')) {
      return response(200, rootContents);
    }
    if (url.endsWith('/repos/owner/sample-repo/contents/.github/workflows')) {
      return response(404, { message: 'Not Found' });
    }
    throw new Error('Unexpected request: ' + url);
  };
}

describe('GapAnalyzer source coverage and evidence', () => {
  test('reports a real README gap and flags unsupported sources as partial', async () => {
    const analyzer = new GapAnalyzer({
      githubToken: 'test-token',
      fetchImpl: githubFetchForRepository([
        { name: 'package.json', type: 'file' },
      ]),
    });

    const gaps = await analyzer.analyzeSystem('owner');
    expect(gaps.map((gap) => gap.type)).toEqual(
      expect.arrayContaining(['missing_readme', 'missing_license', 'missing_cicd']),
    );
    const status = analyzer.getStatus();
    expect(status.state).toBe('partial');
    expect(status.partial).toBe(true);
    expect(status.sources.github.status).toBe('complete');
    expect(status.sources.github.repositoriesScanned).toBe(1);
    expect(status.sources.linear.status).toBe('not_configured');
    expect(status.sources.notion.status).toBe('not_implemented');
    expect(status.sources.crossPlatformLinkage.status).toBe('not_implemented');
  });

  test('does not turn missing GitHub credentials into an empty successful scan', async () => {
    const analyzer = new GapAnalyzer({ fetchImpl: async () => response(200, []) });
    await expect(analyzer.analyzeSystem('owner')).rejects.toThrow('GITHUB_TOKEN is not configured');
    expect(analyzer.getStatus().state).toBe('failed');
    expect(analyzer.getStatus().sources.github.status).toBe('not_configured');
  });

  test('propagates GitHub API failures rather than reporting zero gaps', async () => {
    const analyzer = new GapAnalyzer({
      githubToken: 'test-token',
      fetchImpl: async () => response(403, { message: 'Forbidden' }),
    });
    await expect(analyzer.analyzeSystem('owner')).rejects.toThrow('HTTP 403');
    expect(analyzer.getStatus().state).toBe('failed');
    expect(analyzer.getStatus().sources.github.status).toBe('failed');
  });

  test('records Linear API failure and marks analysis degraded', async () => {
    const fetchImpl = async (url) => {
      if (url.includes('api.github.com/users/owner/repos?')) return response(200, []);
      if (url === 'https://api.linear.app/graphql') return response(401, { errors: [{ message: 'Unauthorized' }] });
      throw new Error('Unexpected request: ' + url);
    };
    const analyzer = new GapAnalyzer({
      githubToken: 'test-token',
      linearApiKey: 'bad-token',
      fetchImpl,
    });

    await analyzer.analyzeSystem('owner', 'team-id');
    expect(analyzer.getStatus().state).toBe('degraded');
    expect(analyzer.getStatus().sources.linear.status).toBe('failed');
    expect(analyzer.getStatus().warnings.join(' ')).toMatch(/HTTP 401/);
  });
});
