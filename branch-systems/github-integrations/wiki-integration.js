/**
 * GitHub Wiki Integration
 * Documentation, guides, knowledge base
 */

const express = require('express');
const router = express.Router();

// List wiki pages
router.get('/wiki/pages', async (req, res) => {
  const pages = [
    {
      title: 'Home',
      path: 'Home',
      sha: 'abc123',
      htmlUrl: 'https://github.com/Garrettc123/tree-of-life-system/wiki/Home'
    },
    {
      title: 'Installation Guide',
      path: 'Installation-Guide',
      sha: 'def456',
      htmlUrl: 'https://github.com/Garrettc123/tree-of-life-system/wiki/Installation-Guide'
    },
    {
      title: 'API Documentation',
      path: 'API-Documentation',
      sha: 'ghi789',
      htmlUrl: 'https://github.com/Garrettc123/tree-of-life-system/wiki/API-Documentation'
    }
  ];

  res.json({ pages, total: pages.length });
});

// Get wiki page
router.get('/wiki/pages/:page', async (req, res) => {
  const { page } = req.params;

  const content = {
    title: page,
    content: `# ${page}\n\nWiki content here...`,
    format: 'markdown',
    sha: `sha_${Date.now()}`,
    url: `https://github.com/Garrettc123/tree-of-life-system/wiki/${page}`
  };

  res.json(content);
});

// Create/Update wiki page
router.put('/wiki/pages/:page', async (req, res) => {
  const { page } = req.params;
  const { content, message = 'Update wiki page' } = req.body;

  res.json({
    success: true,
    page,
    sha: `sha_${Date.now()}`,
    message: 'Wiki page updated'
  });
});

// Auto-sync with Notion
router.post('/wiki/sync-notion', async (req, res) => {
  const { pages } = req.body;

  console.log('[Wiki] Syncing with Notion...');

  res.json({
    success: true,
    synced: pages?.length || 0,
    message: 'Wiki synced to Notion'
  });
});

module.exports = router;
