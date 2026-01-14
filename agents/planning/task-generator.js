class TaskGenerator {
  constructor() {
    this.taskQueue = [];
  }

  async generate(gaps) {
    this.taskQueue = gaps.map((gap, idx) => ({
      id: `task-${idx}`,
      title: `${gap.type} for ${gap.repository}`,
      description: gap.description,
      repository: gap.repository,
      priority: gap.severity === 1 ? 'High' : gap.severity === 2 ? 'Medium' : 'Low',
      type: gap.type,
      status: 'pending',
      createdAt: new Date().toISOString()
    }));

    return this.taskQueue;
  }
}

module.exports = TaskGenerator;
