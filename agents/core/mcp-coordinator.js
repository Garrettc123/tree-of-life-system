/**
 * MCP Coordinator - Model Context Protocol Implementation
 * Manages agent-to-agent communication and coordination
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

class MCPCoordinator extends EventEmitter {
  constructor(config = {}) {
    super();
    this.agents = new Map();
    this.sessions = new Map();
    this.messageQueue = [];
    this.config = {
      maxRetries: 3,
      timeout: 30000, // 30 seconds
      ...config
    };
  }

  /**
   * Register an agent with the MCP coordinator
   */
  registerAgent(agentId, agent) {
    if (this.agents.has(agentId)) {
      throw new Error(`Agent ${agentId} already registered`);
    }

    this.agents.set(agentId, {
      id: agentId,
      instance: agent,
      capabilities: agent.capabilities || [],
      status: 'active',
      registeredAt: new Date()
    });

    console.log(`[MCP] Agent registered: ${agentId}`);
    this.emit('agent:registered', { agentId, agent });
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId) {
    if (!this.agents.has(agentId)) {
      return false;
    }

    this.agents.delete(agentId);
    console.log(`[MCP] Agent unregistered: ${agentId}`);
    this.emit('agent:unregistered', { agentId });
    return true;
  }

  /**
   * Send a message from one agent to another
   */
  async sendMessage(fromAgentId, toAgentId, message, context = {}) {
    const sessionId = uuidv4();
    const messageId = uuidv4();

    const envelope = {
      id: messageId,
      sessionId,
      from: fromAgentId,
      to: toAgentId,
      message,
      context,
      timestamp: new Date(),
      retries: 0
    };

    try {
      const response = await this._deliverMessage(envelope);
      this.emit('message:delivered', { envelope, response });
      return response;
    } catch (error) {
      console.error(`[MCP] Failed to deliver message ${messageId}:`, error);
      this.emit('message:failed', { envelope, error });
      throw error;
    }
  }

  /**
   * Broadcast a message to all agents
   */
  async broadcast(fromAgentId, message, context = {}) {
    const responses = [];
    
    for (const [agentId, agent] of this.agents) {
      if (agentId === fromAgentId) continue; // Don't send to self
      
      try {
        const response = await this.sendMessage(fromAgentId, agentId, message, context);
        responses.push({ agentId, response });
      } catch (error) {
        console.error(`[MCP] Broadcast to ${agentId} failed:`, error);
        responses.push({ agentId, error: error.message });
      }
    }

    return responses;
  }

  /**
   * Request a capability from the agent network
   */
  async requestCapability(requesterId, capability, params = {}) {
    // Find agents with the requested capability
    const capableAgents = Array.from(this.agents.values())
      .filter(a => a.capabilities.includes(capability) && a.status === 'active');

    if (capableAgents.length === 0) {
      throw new Error(`No agent found with capability: ${capability}`);
    }

    // Use the first capable agent (can be enhanced with load balancing)
    const targetAgent = capableAgents[0];
    
    return await this.sendMessage(
      requesterId,
      targetAgent.id,
      { type: 'capability-request', capability, params },
      { requestType: 'capability' }
    );
  }

  /**
   * Get status of all registered agents
   */
  getAgentStatus() {
    return Array.from(this.agents.values()).map(agent => ({
      id: agent.id,
      capabilities: agent.capabilities,
      status: agent.status,
      registeredAt: agent.registeredAt
    }));
  }

  /**
   * Internal message delivery with retry logic
   */
  async _deliverMessage(envelope) {
    const targetAgent = this.agents.get(envelope.to);

    if (!targetAgent) {
      throw new Error(`Target agent not found: ${envelope.to}`);
    }

    if (targetAgent.status !== 'active') {
      throw new Error(`Target agent is not active: ${envelope.to}`);
    }

    try {
      // Call the agent's message handler
      const response = await Promise.race([
        targetAgent.instance.handleMessage(envelope),
        this._timeout(this.config.timeout)
      ]);

      return response;
    } catch (error) {
      // Retry logic
      if (envelope.retries < this.config.maxRetries) {
        envelope.retries++;
        console.log(`[MCP] Retrying message ${envelope.id} (attempt ${envelope.retries})`);
        await this._delay(1000 * envelope.retries); // Exponential backoff
        return await this._deliverMessage(envelope);
      }
      throw error;
    }
  }

  _timeout(ms) {
    return new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Message delivery timeout')), ms)
    );
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = MCPCoordinator;
