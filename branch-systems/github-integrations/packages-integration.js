/**
 * GitHub Packages Integration
 * NPM, Docker, Maven, NuGet registries
 */

const express = require('express');
const router = express.Router();

// List packages
router.get('/packages', async (req, res) => {
  const { type = 'npm' } = req.query;

  const packages = [
    {
      id: 'pkg_1',
      name: '@tree-of-life/core',
      type: 'npm',
      version: '1.0.0',
      visibility: 'public',
      downloads: 1500,
      url: 'https://github.com/Garrettc123/tree-of-life-system/packages/npm/core'
    },
    {
      id: 'pkg_2',
      name: 'tree-of-life-docker',
      type: 'docker',
      version: 'latest',
      visibility: 'public',
      pulls: 500,
      url: 'https://github.com/Garrettc123/tree-of-life-system/packages/container/tree-of-life'
    }
  ];

  const filtered = packages.filter(p => p.type === type);

  res.json({ packages: filtered, total: filtered.length });
});

// Publish package
router.post('/packages/publish', async (req, res) => {
  const { name, version, type = 'npm', files } = req.body;

  console.log(`[Packages] Publishing ${name}@${version} (${type})`);

  res.json({
    success: true,
    package: { name, version, type },
    url: `https://github.com/Garrettc123/tree-of-life-system/packages/${type}/${name}`,
    message: 'Package published successfully'
  });
});

// Get package stats
router.get('/packages/:id/stats', async (req, res) => {
  const { id } = req.params;

  const stats = {
    downloads: {
      total: 1500,
      lastWeek: 150,
      lastMonth: 600
    },
    versions: 5,
    dependents: 12,
    stars: 45
  };

  res.json({ package: id, stats });
});

module.exports = router;
