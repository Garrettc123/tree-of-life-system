const MCPCoordinator = require('../agents/core/mcp-coordinator');
const EventBus = require('../agents/core/event-bus');
const PlanningAgent = require('../agents/planning');
const ProposalAgent = require('../agents/planning/proposal-agent');

function sampleGaps() {
  return [
    { type: 'missing_readme', severity: 'medium', repo: 'sample-repo', description: 'No README file', action: 'create_readme' },
    { type: 'missing_license', severity: 'low', repo: 'sample-repo', description: 'No license file', action: 'create_license' },
    { type: 'missing_cicd', severity: 'high', repo: 'sample-repo', description: 'No workflow files', action: 'create_github_actions' },
    { type: 'empty_project', severity: 'medium', project: 'Sample project', description: 'No project issues', action: 'generate_project_issues' },
    { type: 'incomplete_description', severity: 'low', project: 'Sample project', description: 'Description too short', action: 'enhance_project_description' },
  ];
}

describe('planning-to-proposal agent routing', () => {
  test('reports task proposals assigned while keeping them pending approval', async () => {
    const mcp = new MCPCoordinator({ maxRetries: 0, timeout: 100 });
    const eventBus = new EventBus();
    const planner = new PlanningAgent({}, mcp, eventBus);
    await planner.initialize();
    planner.gapAnalyzer.analyzeSystem = async () => sampleGaps();
    planner.gapAnalyzer.getStatus = () => ({
      state: 'partial',
      partial: true,
      sources: {
        github: { status: 'complete' },
        linear: { status: 'not_configured' },
        notion: { status: 'not_implemented' },
        crossPlatformLinkage: { status: 'not_implemented' },
      },
      warnings: [],
    });

    const development = new ProposalAgent({ id: 'development' }, mcp);
    const projectManagement = new ProposalAgent({ id: 'project-management' }, mcp);
    const documentation = new ProposalAgent({ id: 'documentation' }, mcp);

    const result = await planner.execute();
    expect(result.success).toBe(true);
    expect(result.complete).toBe(false);
    expect(result.partial).toBe(true);
    expect(result.gapsFound).toBe(5);
    expect(result.tasksGenerated).toBe(5);
    expect(result.tasksAssigned).toBe(5);
    expect(result.distribution.every((item) => item.status === 'assigned')).toBe(true);
    expect(development.listProposals()).toHaveLength(3);
    expect(projectManagement.listProposals()).toHaveLength(1);
    expect(documentation.listProposals()).toHaveLength(1);
    expect([
      ...development.listProposals(),
      ...projectManagement.listProposals(),
      ...documentation.listProposals(),
    ].every((proposal) => proposal.sideEffectsPerformed === false && proposal.requiresHumanApproval)).toBe(true);
  });

  test('fails closed if a task recipient is not registered', async () => {
    const mcp = new MCPCoordinator({ maxRetries: 0, timeout: 100 });
    const planner = new PlanningAgent({}, mcp, new EventBus());
    await planner.initialize();
    planner.gapAnalyzer.analyzeSystem = async () => [
      { type: 'missing_readme', severity: 'medium', repo: 'sample-repo', description: 'No README file' },
    ];
    planner.gapAnalyzer.getStatus = () => ({ partial: true, state: 'partial', sources: {}, warnings: [] });

    const result = await planner.execute();
    expect(result.success).toBe(false);
    expect(result.tasksGenerated).toBe(1);
    expect(result.tasksAssigned).toBe(0);
    expect(result.distribution[0].status).toBe('blocked');
    expect(result.distribution[0].reason).toBe('target_agent_not_registered');
  });
});
