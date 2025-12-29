/**
 * Main server entrypoint for tree-of-life-system
 */
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Tree of Life System',
    version: '1.0.0'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.get('/api/v1/status', (req, res) => {
  res.json({ status: 'operational' });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Tree of Life System API listening on port ${PORT}`);
  console.log(`Health check at http://0.0.0.0:${PORT}/health`);
});

module.exports = app;
