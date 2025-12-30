/**
 * Event Bus - Central event-driven coordination system
 * Handles events from GitHub, Linear, Notion, and internal agents
 */

const EventEmitter = require('events');

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.eventLog = [];
    this.maxLogSize = 10000;
    this.handlers = new Map();
  }

  /**
   * Publish an event to the bus
   */
  publish(eventType, data, source = 'unknown') {
    const event = {
      id: this._generateEventId(),
      type: eventType,
      data,
      source,
      timestamp: new Date(),
      processed: false
    };

    // Log the event
    this._logEvent(event);

    // Emit to subscribers
    this.emit(eventType, event);
    this.emit('*', event); // Global listener

    console.log(`[EventBus] Published: ${eventType} from ${source}`);
    return event;
  }

  /**
   * Subscribe to specific event types
   */
  subscribe(eventType, handler, subscriberId = 'anonymous') {
    const handlerId = `${subscriberId}:${eventType}:${Date.now()}`;
    
    this.handlers.set(handlerId, {
      eventType,
      handler,
      subscriberId,
      subscribedAt: new Date()
    });

    this.on(eventType, handler);

    console.log(`[EventBus] Subscribed: ${subscriberId} -> ${eventType}`);
    return handlerId;
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(handlerId) {
    const handlerInfo = this.handlers.get(handlerId);
    if (!handlerInfo) return false;

    this.off(handlerInfo.eventType, handlerInfo.handler);
    this.handlers.delete(handlerId);

    console.log(`[EventBus] Unsubscribed: ${handlerInfo.subscriberId} from ${handlerInfo.eventType}`);
    return true;
  }

  /**
   * Get recent events (for debugging/monitoring)
   */
  getRecentEvents(limit = 100, eventType = null) {
    let events = this.eventLog;
    
    if (eventType) {
      events = events.filter(e => e.type === eventType);
    }

    return events.slice(-limit);
  }

  /**
   * Get event statistics
   */
  getStats() {
    const stats = {
      totalEvents: this.eventLog.length,
      subscribers: this.handlers.size,
      eventTypes: {}
    };

    for (const event of this.eventLog) {
      stats.eventTypes[event.type] = (stats.eventTypes[event.type] || 0) + 1;
    }

    return stats;
  }

  /**
   * Internal event logging
   */
  _logEvent(event) {
    this.eventLog.push(event);

    // Trim log if it exceeds max size
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog = this.eventLog.slice(-this.maxLogSize);
    }
  }

  _generateEventId() {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Event type constants
EventBus.Events = {
  // GitHub events
  GITHUB_PUSH: 'github:push',
  GITHUB_PR_OPENED: 'github:pr:opened',
  GITHUB_PR_MERGED: 'github:pr:merged',
  GITHUB_ISSUE_OPENED: 'github:issue:opened',
  GITHUB_REPO_CREATED: 'github:repo:created',

  // Linear events
  LINEAR_ISSUE_CREATED: 'linear:issue:created',
  LINEAR_ISSUE_UPDATED: 'linear:issue:updated',
  LINEAR_ISSUE_COMPLETED: 'linear:issue:completed',
  LINEAR_PROJECT_CREATED: 'linear:project:created',

  // Notion events
  NOTION_PAGE_CREATED: 'notion:page:created',
  NOTION_PAGE_UPDATED: 'notion:page:updated',
  NOTION_DATABASE_UPDATED: 'notion:database:updated',

  // Agent events
  AGENT_TASK_STARTED: 'agent:task:started',
  AGENT_TASK_COMPLETED: 'agent:task:completed',
  AGENT_TASK_FAILED: 'agent:task:failed',
  AGENT_ERROR: 'agent:error',

  // System events
  SYSTEM_HEALTH_CHECK: 'system:health',
  SYSTEM_ERROR: 'system:error'
};

module.exports = EventBus;
