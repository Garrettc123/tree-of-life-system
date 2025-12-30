/**
 * Task Generator - Creates execution plans from identified gaps
 * Generates tasks for Development, PM, and Documentation agents
 */

class TaskGenerator {
  constructor(config) {
    this.config = config;
    this.taskQueue = [];
  }

  /**
   * Generate tasks from gaps
   */
  generateTasks(gaps) {
    console.log(`[TaskGenerator] Generating tasks from ${gaps.length} gaps...`);
    
    const tasks = [];

    for (const gap of gaps) {
      const task = this._createTaskFromGap(gap);
      if (task) {
        tasks.push(task);
      }
    }

    this.taskQueue = tasks;
    console.log(`[TaskGenerator] Generated ${tasks.length} tasks`);
    
    return tasks;
  }

  /**
   * Create a task from a gap
   */
  _createTaskFromGap(gap) {
    const taskMap = {
      'missing_readme': this._createReadmeTask,
      'missing_license': this._createLicenseTask,
      'missing_cicd': this._createCICDTask,
      'empty_project': this._createProjectIssuesTask,
      'incomplete_description': this._createDescriptionTask,
      'integration_sync': this._createIntegrationTask
    };

    const taskCreator = taskMap[gap.type];
    if (!taskCreator) {
      console.warn(`[TaskGenerator] No task creator for gap type: ${gap.type}`);
      return null;
    }

    return taskCreator.call(this, gap);
  }

  /**
   * Task creators for different gap types
   */
  _createReadmeTask(gap) {
    return {
      id: this._generateTaskId(),
      type: 'create_file',
      agent: 'development',
      priority: 'medium',
      title: `Create README for ${gap.repo}`,
      description: gap.description,
      params: {
        repo: gap.repo,
        file: 'README.md',
        template: 'readme_template'
      },
      dependencies: [],
      estimatedDuration: '15m'
    };
  }

  _createLicenseTask(gap) {
    return {
      id: this._generateTaskId(),
      type: 'create_file',
      agent: 'development',
      priority: 'low',
      title: `Add LICENSE to ${gap.repo}`,
      description: gap.description,
      params: {
        repo: gap.repo,
        file: 'LICENSE',
        template: 'mit_license'
      },
      dependencies: [],
      estimatedDuration: '5m'
    };
  }

  _createCICDTask(gap) {
    return {
      id: this._generateTaskId(),
      type: 'setup_cicd',
      agent: 'development',
      priority: 'high',
      title: `Setup CI/CD for ${gap.repo}`,
      description: gap.description,
      params: {
        repo: gap.repo,
        workflows: ['test', 'lint', 'deploy']
      },
      dependencies: [],
      estimatedDuration: '30m'
    };
  }

  _createProjectIssuesTask(gap) {
    return {
      id: this._generateTaskId(),
      type: 'create_issues',
      agent: 'project-management',
      priority: 'high',
      title: `Generate issues for ${gap.project}`,
      description: gap.description,
      params: {
        project: gap.project,
        issueCount: 5,
        categories: ['setup', 'implementation', 'testing', 'documentation', 'deployment']
      },
      dependencies: [],
      estimatedDuration: '20m'
    };
  }

  _createDescriptionTask(gap) {
    return {
      id: this._generateTaskId(),
      type: 'enhance_description',
      agent: 'documentation',
      priority: 'low',
      title: `Enhance description for ${gap.project}`,
      description: gap.description,
      params: {
        project: gap.project,
        minLength: 200
      },
      dependencies: [],
      estimatedDuration: '10m'
    };
  }

  _createIntegrationTask(gap) {
    return {
      id: this._generateTaskId(),
      type: 'sync_integration',
      agent: 'planning',
      priority: 'medium',
      title: 'Synchronize platform integrations',
      description: gap.description,
      params: {
        platforms: ['github', 'linear', 'notion']
      },
      dependencies: [],
      estimatedDuration: '45m'
    };
  }

  /**
   * Get tasks for a specific agent
   */
  getTasksForAgent(agentName) {
    return this.taskQueue.filter(task => task.agent === agentName);
  }

  /**
   * Get tasks by priority
   */
  getTasksByPriority(priority) {
    return this.taskQueue.filter(task => task.priority === priority);
  }

  /**
   * Mark task as completed
   */
  completeTask(taskId, result) {
    const taskIndex = this.taskQueue.findIndex(t => t.id === taskId);
    if (taskIndex === -1) return false;

    this.taskQueue[taskIndex].status = 'completed';
    this.taskQueue[taskIndex].completedAt = new Date();
    this.taskQueue[taskIndex].result = result;

    console.log(`[TaskGenerator] Task completed: ${taskId}`);
    return true;
  }

  _generateTaskId() {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = TaskGenerator;
