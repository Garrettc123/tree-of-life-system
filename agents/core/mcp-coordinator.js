class MCPCoordinator {
  constructor() {
    this.agents = new Map();
  }

  async registerAgent(agentConfig) {
    this.agents.set(agentConfig.id, agentConfig);
    console.log(`[MCP] Registered agent: ${agentConfig.name}`);
  }

  getAgent(agentId) {
    return this.agents.get(agentId);
  }

  getAgentStatus() {
    return Array.from(this.agents.values());
  }

  async callAgent(agentId, method, params) {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);
    
    console.log(`[MCP] Calling ${agentId}.${method}`);
    return { success: true, result: {} };
  }
}

module.exports = MCPCoordinator;
