/**
 * GitHub Discussions Integration
 * Community forum, Q&A, announcements
 */

const express = require('express');
const router = express.Router();

// List discussions
router.get('/discussions', async (req, res) => {
  const { category, state = 'open' } = req.query;

  const discussions = [
    {
      id: 'disc_1',
      title: 'Welcome to Tree of Life!',
      category: 'Announcements',
      author: 'Garrettc123',
      upvotes: 15,
      comments: 8,
      state: 'open',
      url: 'https://github.com/Garrettc123/tree-of-life-system/discussions/1'
    },
    {
      id: 'disc_2',
      title: 'How to integrate with Linear?',
      category: 'Q&A',
      author: 'user123',
      upvotes: 5,
      comments: 3,
      state: 'answered',
      url: 'https://github.com/Garrettc123/tree-of-life-system/discussions/2'
    }
  ];

  const filtered = category 
    ? discussions.filter(d => d.category === category)
    : discussions;

  res.json({ discussions: filtered, total: filtered.length });
});

// Create discussion
router.post('/discussions', async (req, res) => {
  const { title, body, category = 'General' } = req.body;

  const discussion = {
    id: `disc_${Date.now()}`,
    title,
    body,
    category,
    author: 'Garrettc123',
    upvotes: 0,
    comments: 0,
    state: 'open',
    createdAt: new Date().toISOString()
  };

  res.json({
    success: true,
    discussion,
    message: 'Discussion created'
  });
});

// Add comment to discussion
router.post('/discussions/:id/comments', async (req, res) => {
  const { id } = req.params;
  const { body } = req.body;

  const comment = {
    id: `comment_${Date.now()}`,
    discussionId: id,
    body,
    author: 'Garrettc123',
    upvotes: 0,
    createdAt: new Date().toISOString()
  };

  res.json({
    success: true,
    comment,
    message: 'Comment added'
  });
});

// Mark answer
router.post('/discussions/:id/mark-answer', async (req, res) => {
  const { id } = req.params;
  const { commentId } = req.body;

  res.json({
    success: true,
    discussionId: id,
    answerId: commentId,
    message: 'Answer marked'
  });
});

module.exports = router;
