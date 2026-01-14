class BaseAgent {
  constructor(agentId, config, mcpCoordinator, eventBus) {
    this.agentId = agentId;
    this.config = config;
    this.mcpCoordinator = mcpCoordinator;
    this.eventBus = eventBus;
    this.capabilities = [];
  }

  async initialize() {
    throw new Error('initialize() must be implemented');
  }

  async execute() {
    throw new Error('execute() must be implemented');
  }

  getStatus() {
    return {
      agent: this.agentId,
      state: 'unknown',
      capabilities: this.capabilities
    };
  }
}

module.exports = BaseAgent;
