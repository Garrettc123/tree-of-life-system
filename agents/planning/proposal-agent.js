/**
 * Proposal-only workforce agent.
 *
 * It receives planning assignments and creates reviewable proposals in memory.
 * It never writes to GitHub, Linear, Notion, or a deployment target.
 */
class ProposalAgent {
  constructor({ id, name, capabilities = [] } = {}, coordinator) {
    if (!id || typeof id !== 'string') throw new TypeError('ProposalAgent id is required');
    if (!coordinator || typeof coordinator.registerAgent !== 'function') {
      throw new TypeError('ProposalAgent requires a coordinator');
    }
    this.id = id;
    this.name = name || id;
    this.coordinator = coordinator;
    this.capabilities = capabilities;
    this.state = 'initializing';
    this.proposals = new Map();
    this.lastAssignmentAt = null;
    this.coordinator.registerAgent(this.id, this);
    this.state = 'ready';
  }

  _prepareProposal(task) {
    if (!task || typeof task !== 'object' || Array.isArray(task)) {
      return { accepted: false, error: 'Task must be an object' };
    }
    if (typeof task.id !== 'string' || !task.id.trim()) {
      return { accepted: false, error: 'Task id is required' };
    }
    if (typeof task.type !== 'string' || !task.type.trim()) {
      return { accepted: false, error: 'Task type is required' };
    }

    const supportedTypes = new Set([
      'create_file',
      'setup_cicd',
      'create_issues',
      'enhance_description',
    ]);
    if (!supportedTypes.has(task.type)) {
      return {
        accepted: false,
        error: `Unsupported proposal type: ${task.type}`,
        taskId: task.id,
      };
    }

    const params = task.params && typeof task.params === 'object' ? task.params : {};
    const subject = params.repo || params.project || task.title || task.id;
    const requiresApproval = true;
    let reviewNotes;

    switch (task.type) {
      case 'create_file':
        reviewNotes = params.file === 'LICENSE'
          ? 'Choose and approve the license terms before generating or adding a license file.'
          : 'Prepare file contents from verified repository facts, then review the draft before any write.';
        break;
      case 'setup_cicd':
        reviewNotes = 'Inspect the repository package/build/test commands and existing workflows before proposing a workflow. No workflow file is created.';
        break;
      case 'create_issues':
        reviewNotes = 'Prepare an issue outline from verified project requirements; do not create Linear issues until a human approves the exact issue list.';
        break;
      case 'enhance_description':
        reviewNotes = 'Draft only from verified project facts. Do not invent integrations, metrics, readiness, customers, or deployment state.';
        break;
      default:
        reviewNotes = 'Human review is required before any external change.';
    }

    const proposal = {
      proposalId: `proposal:${this.id}:${task.id}`,
      taskId: task.id,
      agentId: this.id,
      taskType: task.type,
      title: task.title || `Review proposal for ${subject}`,
      subject,
      priority: task.priority || 'medium',
      state: 'draft_pending_review',
      executionMode: 'proposal_only',
      sideEffectsPerformed: false,
      requiresHumanApproval: requiresApproval,
      policyLevel: 3,
      reviewNotes,
      createdAt: new Date().toISOString(),
    };

    return { accepted: true, proposal };
  }

  async handleMessage(envelope = {}) {
    const message = envelope.message || {};
    if (message.type !== 'task-assignment') {
      return {
        success: false,
        accepted: false,
        agentId: this.id,
        error: `Unsupported message type: ${String(message.type || 'missing')}`,
      };
    }

    if (!Array.isArray(message.tasks) || message.tasks.length === 0) {
      return {
        success: false,
        accepted: false,
        agentId: this.id,
        error: 'task-assignment requires a non-empty tasks array',
      };
    }

    const prepared = message.tasks.map((task) => this._prepareProposal(task));
    const rejected = prepared.filter((item) => !item.accepted);
    if (rejected.length > 0) {
      return {
        success: false,
        accepted: false,
        agentId: this.id,
        rejected: rejected.map((item) => ({ taskId: item.taskId, error: item.error })),
        acceptedCount: 0,
      };
    }

    const proposals = prepared.map((item) => item.proposal);
    for (const proposal of proposals) {
      this.proposals.set(proposal.proposalId, proposal);
    }
    this.lastAssignmentAt = new Date().toISOString();

    return {
      success: true,
      accepted: true,
      agentId: this.id,
      acceptedCount: proposals.length,
      taskIds: proposals.map((proposal) => proposal.taskId),
      proposals,
      note: 'Proposals queued for review only; no external side effects were performed.',
    };
  }

  getStatus() {
    return {
      agent: this.id,
      state: this.state,
      mode: 'proposal_only',
      capabilities: this.capabilities,
      pendingTasks: Array.from(this.proposals.values()).filter(
        (proposal) => proposal.state === 'draft_pending_review',
      ).length,
      lastAssignmentAt: this.lastAssignmentAt,
      sideEffectsPerformed: false,
    };
  }

  listProposals() {
    return Array.from(this.proposals.values()).map((proposal) => ({ ...proposal }));
  }
}

module.exports = ProposalAgent;
