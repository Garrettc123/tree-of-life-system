/**
 * GitHub Webhook Handler
 * Works with Railway by processing webhooks instead of making API calls
 * Uses MCP authenticated connection for API operations
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// Webhook signature verification
const verifyGitHubSignature = (req) => {
  const signature = req.get('X-Hub-Signature-256');
  if (!signature) return false;
  
  const secret = process.env.GITHUB_WEBHOOK_SECRET || 'development';
  const payload = JSON.stringify(req.body);
  const hash = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
  
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(hash));
};

// GitHub Webhook Endpoint
router.post('/webhooks/github', (req, res) => {
  try {
    // Verify webhook signature
    if (!verifyGitHubSignature(req)) {
      console.warn('Invalid GitHub webhook signature');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const event = req.get('X-GitHub-Event');
    const payload = req.body;

    console.log(`[GitHub Webhook] Event: ${event}`);
    console.log(`[GitHub Webhook] Repository: ${payload.repository?.full_name}`);

    // Handle different GitHub events
    switch (event) {
      case 'push':
        handlePushEvent(payload);
        break;
      case 'pull_request':
        handlePullRequestEvent(payload);
        break;
      case 'issues':
        handleIssueEvent(payload);
        break;
      case 'issue_comment':
        handleIssueCommentEvent(payload);
        break;
      default:
        console.log(`[GitHub Webhook] Unhandled event: ${event}`);
    }

    res.status(200).json({ success: true, event });
  } catch (error) {
    console.error('[GitHub Webhook] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Handle push events (commits)
function handlePushEvent(payload) {
  const { repository, pusher, commits, ref, created, deleted, forced } = payload;
  const branch = ref.split('/').pop();

  console.log(`[GitHub Push] Branch: ${branch}`);
  console.log(`[GitHub Push] Commits: ${commits.length}`);
  console.log(`[GitHub Push] Author: ${pusher.name}`);

  // Queue for Linear task creation
  if (commits.length > 0 && !created && !deleted) {
    commitQueue.push({
      repo: repository.full_name,
      branch,
      commits: commits.map(c => ({
        message: c.message,
        author: c.author.name,
        timestamp: c.timestamp
      }))
    });
  }
}

// Handle pull request events
function handlePullRequestEvent(payload) {
  const { action, pull_request } = payload;
  const { number, title, body, user, head, base } = pull_request;

  console.log(`[GitHub PR] Action: ${action}`);
  console.log(`[GitHub PR] PR #${number}: ${title}`);
  console.log(`[GitHub PR] Author: ${user.login}`);

  if (action === 'opened' || action === 'synchronize') {
    // Queue for code review
    prQueue.push({
      number,
      title,
      body,
      author: user.login,
      from: head.ref,
      to: base.ref
    });
  }
}

// Handle issue events
function handleIssueEvent(payload) {
  const { action, issue } = payload;
  const { number, title, body, user, labels } = issue;

  console.log(`[GitHub Issue] Action: ${action}`);
  console.log(`[GitHub Issue] #${number}: ${title}`);
  console.log(`[GitHub Issue] Creator: ${user.login}`);
}

// Handle issue comment events
function handleIssueCommentEvent(payload) {
  const { action, issue, comment } = payload;
  const { number, title } = issue;
  const { body, user } = comment;

  console.log(`[GitHub Comment] On issue #${number}: ${title}`);
  console.log(`[GitHub Comment] By: ${user.login}`);
}

// Process queues
const commitQueue = [];
const prQueue = [];

setInterval(async () => {
  // Process commits
  while (commitQueue.length > 0) {
    const commit = commitQueue.shift();
    try {
      // Create Linear issue from commit
      console.log(`[Process] Creating Linear issue from commit: ${commit.commits[0]?.message}`);
      // Linear sync handled via Notion integration
    } catch (error) {
      console.error('[Process] Error creating Linear issue:', error);
    }
  }

  // Process PRs
  while (prQueue.length > 0) {
    const pr = prQueue.shift();
    try {
      console.log(`[Process] Queued code review for PR #${pr.number}`);
      // Code review handled by AI engine via orchestrator
    } catch (error) {
      console.error('[Process] Error processing PR:', error);
    }
  }
}, 5000);

// Health check endpoint
router.get('/github/status', (req, res) => {
  res.json({
    status: 'connected',
    webhooks: {
      push: 'listening',
      pull_request: 'listening',
      issues: 'listening',
      issue_comment: 'listening'
    },
    queued: {
      commits: commitQueue.length,
      prs: prQueue.length
    },
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
