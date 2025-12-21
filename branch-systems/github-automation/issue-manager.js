/**
 * GitHub Issue Automation
 * Auto-label, assign, manage issues with AI
 */

const express = require('express');
const router = express.Router();

// Issue categories for auto-labeling
const labelRules = {
  bug: ['error', 'crash', 'broken', 'not working', 'failed'],
  feature: ['add', 'implement', 'new', 'feature request'],
  documentation: ['docs', 'readme', 'documentation', 'guide'],
  performance: ['slow', 'performance', 'optimization', 'speed'],
  security: ['vulnerability', 'security', 'exploit', 'xss', 'sql injection'],
  enhancement: ['improve', 'better', 'enhance', 'upgrade']
};

// Team assignment rules
const assignmentRules = {
  bug: ['@tech-lead', '@qa-engineer'],
  security: ['@security-lead', '@tech-lead'],
  documentation: ['@technical-writer'],
  feature: ['@product-manager', '@tech-lead']
};

// Auto-label issues
router.post('/issue/auto-label', async (req, res) => {
  const { issueNumber, title, body } = req.body;

  const content = `${title} ${body}`.toLowerCase();
  const detectedLabels = [];

  // Detect labels based on content
  for (const [label, keywords] of Object.entries(labelRules)) {
    if (keywords.some(keyword => content.includes(keyword))) {
      detectedLabels.push(label);
    }
  }

  // Priority detection
  if (content.includes('urgent') || content.includes('critical')) {
    detectedLabels.push('priority:high');
  } else if (content.includes('nice to have') || content.includes('low priority')) {
    detectedLabels.push('priority:low');
  } else {
    detectedLabels.push('priority:medium');
  }

  console.log(`[Issue] Auto-labeled #${issueNumber}: ${detectedLabels.join(', ')}`);

  res.json({
    success: true,
    issueNumber,
    labels: detectedLabels,
    message: 'Issue automatically labeled'
  });
});

// Auto-assign issues
router.post('/issue/auto-assign', async (req, res) => {
  const { issueNumber, labels } = req.body;

  let assignees = [];

  // Assign based on labels
  for (const label of labels) {
    if (assignmentRules[label]) {
      assignees = assignees.concat(assignmentRules[label]);
    }
  }

  // Remove duplicates
  assignees = [...new Set(assignees)];

  console.log(`[Issue] Auto-assigned #${issueNumber} to: ${assignees.join(', ')}`);

  res.json({
    success: true,
    issueNumber,
    assignees,
    message: 'Issue automatically assigned'
  });
});

// Duplicate detection
router.post('/issue/detect-duplicate', async (req, res) => {
  const { issueNumber, title, body } = req.body;

  // Simulate duplicate detection with AI
  const similarIssues = [
    // Would query existing issues and use AI to find similarities
  ];

  const isDuplicate = similarIssues.length > 0;

  if (isDuplicate) {
    console.log(`[Issue] Detected duplicate: #${issueNumber}`);
  }

  res.json({
    success: true,
    isDuplicate,
    similarIssues,
    confidence: isDuplicate ? 0.85 : 0,
    action: isDuplicate ? 'mark_duplicate' : 'keep_open'
  });
});

// Template enforcement
router.post('/issue/validate-template', async (req, res) => {
  const { issueNumber, body } = req.body;

  const requiredSections = [
    'Description',
    'Steps to Reproduce',
    'Expected Behavior',
    'Actual Behavior'
  ];

  const missingSections = requiredSections.filter(
    section => !body.includes(section)
  );

  const isValid = missingSections.length === 0;

  res.json({
    success: true,
    isValid,
    missingSections,
    message: isValid 
      ? 'Issue follows template' 
      : 'Issue missing required sections'
  });
});

// Issue Status
router.get('/issue/status', (req, res) => {
  res.json({
    features: [
      'Auto-labeling',
      'Auto-assignment',
      'Duplicate detection',
      'Template validation',
      'Priority scoring'
    ],
    rules: {
      labels: Object.keys(labelRules).length,
      assignments: Object.keys(assignmentRules).length
    }
  });
});

module.exports = router;
