/**
 * GitHub Projects Integration
 * Manage project boards, cards, automation
 */

const express = require('express');
const router = express.Router();

const projects = [];

// List projects
router.get('/projects', async (req, res) => {
  const projectsList = [
    {
      id: 'proj_1',
      name: 'Tree of Life - Root Systems',
      state: 'open',
      body: 'Foundation infrastructure',
      number: 1,
      url: 'https://github.com/users/Garrettc123/projects/1'
    },
    {
      id: 'proj_2',
      name: 'Revenue Generation',
      state: 'open',
      body: 'Money-making systems',
      number: 2,
      url: 'https://github.com/users/Garrettc123/projects/2'
    }
  ];

  res.json({ projects: projectsList, total: projectsList.length });
});

// Create project
router.post('/projects', async (req, res) => {
  const { name, body, template = 'basic' } = req.body;

  const project = {
    id: `proj_${Date.now()}`,
    name,
    body,
    template,
    state: 'open',
    columns: ['To Do', 'In Progress', 'Done'],
    createdAt: new Date().toISOString()
  };

  projects.push(project);

  res.json({
    success: true,
    project,
    message: 'Project created successfully'
  });
});

// Add card to project
router.post('/projects/:id/cards', async (req, res) => {
  const { id } = req.params;
  const { note, column = 'To Do', issueId } = req.body;

  const card = {
    id: `card_${Date.now()}`,
    projectId: id,
    note,
    column,
    issueId,
    createdAt: new Date().toISOString()
  };

  res.json({
    success: true,
    card,
    message: 'Card added to project'
  });
});

// Move card
router.patch('/projects/cards/:cardId/move', async (req, res) => {
  const { cardId } = req.params;
  const { column, position = 'top' } = req.body;

  res.json({
    success: true,
    cardId,
    newColumn: column,
    position,
    message: 'Card moved successfully'
  });
});

// Project automation rules
router.post('/projects/:id/automation', async (req, res) => {
  const { id } = req.params;
  const { trigger, action } = req.body;

  const rule = {
    id: `rule_${Date.now()}`,
    projectId: id,
    trigger, // 'issue_opened', 'pr_merged', etc.
    action,  // 'add_to_column', 'move_card', etc.
    enabled: true
  };

  res.json({
    success: true,
    rule,
    message: 'Automation rule created'
  });
});

module.exports = router;
