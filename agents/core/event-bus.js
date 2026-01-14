class EventBus {
  constructor() {
    this.subscribers = new Map();
    this.eventHistory = [];
  }

  on(eventType, callback) {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, []);
    }
    this.subscribers.get(eventType).push(callback);
  }

  async emit(event) {
    this.eventHistory.push(event);

    // Call specific subscribers
    if (this.subscribers.has(event.type)) {
      for (const callback of this.subscribers.get(event.type)) {
        await callback(event);
      }
    }

    // Call wildcard subscribers
    if (this.subscribers.has('*')) {
      for (const callback of this.subscribers.get('*')) {
        await callback(event);
      }
    }
  }

  getStats() {
    return {
      totalEvents: this.eventHistory.length,
      subscribers: this.subscribers.size
    };
  }
}

module.exports = EventBus;
