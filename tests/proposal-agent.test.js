const MCPCoordinator = require('../agents/core/mcp-coordinator');
const ProposalAgent = require('../agents/planning/proposal-agent');

describe('proposal-only workforce agents', () => {
  test('all three generated-task recipients accept proposals without external side effects', async () => {
    const mcp = new MCPCoordinator({ maxRetries: 0, timeout: 100 });
    const definitions = [
      { id: 'development', name: 'Development Proposal Agent', capabilities: ['file-change-proposal'] },
      { id: 'project-management', name: 'Project Management Proposal Agent', capabilities: ['issue-outline-proposal'] },
      { id: 'documentation', name: 'Documentation Proposal Agent', capabilities: ['documentation-draft-proposal'] },
    ];
    const agents = definitions.map((definition) => new ProposalAgent(definition, mcp));

    const assignments = [
      { agent: 'development', task: { id: 'dev-1', agent: 'development', type: 'create_file', title: 'Create a README', params: { repo: 'sample-repo', file: 'README.md' } } },
      { agent: 'project-management', task: { id: 'pm-1', agent: 'project-management', type: 'create_issues', title: 'Outline project issues', params: { project: 'sample-project' } } },
      { agent: 'documentation', task: { id: 'doc-1', agent: 'documentation', type: 'enhance_description', title: 'Improve project description', params: { project: 'sample-project' } } },
    ];

    for (const assignment of assignments) {
      const result = await mcp.sendMessage('planning', assignment.agent, {
        type: 'task-assignment',
        tasks: [assignment.task],
      });
      expect(result.success).toBe(true);
      expect(result.accepted).toBe(true);
      expect(result.acceptedCount).toBe(1);
      expect(result.proposals[0].state).toBe('draft_pending_review');
      expect(result.proposals[0].requiresHumanApproval).toBe(true);
      expect(result.proposals[0].policyLevel).toBe(3);
      expect(result.proposals[0].sideEffectsPerformed).toBe(false);
    }

    expect(agents.map((agent) => agent.getStatus().pendingTasks)).toEqual([1, 1, 1]);
    expect(agents.every((agent) => agent.listProposals().every((proposal) => proposal.sideEffectsPerformed === false))).toBe(true);
  });

  test('rejects unsupported external actions rather than accepting the task', async () => {
    const mcp = new MCPCoordinator({ maxRetries: 0, timeout: 100 });
    new ProposalAgent({ id: 'development' }, mcp);
    const result = await mcp.sendMessage('planning', 'development', {
      type: 'task-assignment',
      tasks: [{ id: 'bad-1', agent: 'development', type: 'deploy_production', title: 'Deploy' }],
    });
    expect(result.success).toBe(false);
    expect(result.accepted).toBe(false);
    expect(result.rejected[0].error).toMatch(/Unsupported proposal type/);
  });

  test('does not mutate the task queue when an assignment contains invalid items', async () => {
    const mcp = new MCPCoordinator({ maxRetries: 0, timeout: 100 });
    const agent = new ProposalAgent({ id: 'documentation' }, mcp);
    const result = await mcp.sendMessage('planning', 'documentation', {
      type: 'task-assignment',
      tasks: [
        { id: 'valid-1', agent: 'documentation', type: 'create_file', title: 'Draft a README' },
        { type: 'create_issues', title: 'Missing task id' },
      ],
    });
    expect(result.accepted).toBe(false);
    expect(agent.listProposals()).toHaveLength(0);
  });
});
