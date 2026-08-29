'use strict';

/**
 * Unit tests for TaskGenerator (agents/planning/task-generator.js)
 */

const TaskGenerator = require('../../agents/planning/task-generator');

describe('TaskGenerator', () => {
  let generator;

  beforeEach(() => {
    generator = new TaskGenerator({ env: 'test' });
  });

  describe('constructor', () => {
    it('should initialize with an empty task queue', () => {
      expect(generator.taskQueue).toEqual([]);
    });
  });

  describe('generateTasks', () => {
    it('should return an empty array when no gaps are provided', () => {
      const tasks = generator.generateTasks([]);
      expect(tasks).toEqual([]);
    });

    it('should generate a task for a missing_readme gap', () => {
      const gaps = [
        {
          type: 'missing_readme',
          severity: 'medium',
          repo: 'my-repo',
          description: 'Missing README',
          action: 'create_readme'
        }
      ];
      const tasks = generator.generateTasks(gaps);
      expect(tasks.length).toBe(1);
      expect(tasks[0].type).toBe('create_file');
      expect(tasks[0].params.repo).toBe('my-repo');
    });

    it('should generate a task for a missing_cicd gap', () => {
      const gaps = [
        {
          type: 'missing_cicd',
          severity: 'high',
          repo: 'my-repo',
          description: 'Missing CI/CD',
          action: 'create_github_actions'
        }
      ];
      const tasks = generator.generateTasks(gaps);
      expect(tasks.length).toBe(1);
    });

    it('should skip unknown gap types gracefully', () => {
      const gaps = [
        {
          type: 'unknown_gap_type',
          severity: 'low',
          description: 'Unknown gap'
        }
      ];
      const tasks = generator.generateTasks(gaps);
      expect(tasks.length).toBe(0);
    });

    it('should generate tasks for multiple gaps', () => {
      const gaps = [
        { type: 'missing_readme', severity: 'medium', repo: 'repo-1', description: 'No readme', action: 'create_readme' },
        { type: 'missing_license', severity: 'low', repo: 'repo-1', description: 'No license', action: 'create_license' }
      ];
      const tasks = generator.generateTasks(gaps);
      expect(tasks.length).toBe(2);
    });
  });
});
