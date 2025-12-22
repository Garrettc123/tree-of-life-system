const express = require('express');
const { ethers } = require('ethers');
const { create } = require('ipfs-http-client');
const Redis = require('ioredis');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(express.json());

// Initialize connections
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const ipfs = create({ url: process.env.IPFS_URL || 'http://localhost:5001' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Blockchain connection
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const protocolAddress = process.env.PROTOCOL_CONTRACT_ADDRESS;
const protocolABI = require('./abis/NWUProtocol.json');
const protocol = new ethers.Contract(protocolAddress, protocolABI, provider);

/**
 * Submit a new contribution
 */
app.post('/api/contributions/submit', async (req, res) => {
  try {
    const { title, description, category, content, metadata, walletAddress } = req.body;
    
    // Validate input
    if (!title || !content || !category || !walletAddress) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Upload content to IPFS
    const contentData = {
      title,
      description,
      content,
      metadata,
      timestamp: new Date().toISOString(),
      version: '1.0',
    };
    
    const { cid } = await ipfs.add(JSON.stringify(contentData));
    const ipfsHash = `ipfs://${cid}`;
    
    console.log(`Content uploaded to IPFS: ${ipfsHash}`);
    
    // Store in database
    const query = `
      INSERT INTO contributions (title, description, category, ipfs_hash, contributor_address, status, created_at)
      VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
      RETURNING id, created_at
    `;
    
    const result = await pool.query(query, [
      title,
      description,
      category,
      ipfsHash,
      walletAddress,
    ]);
    
    const contributionId = result.rows[0].id;
    
    // Publish to Redis for AI verification
    await redis.publish('contributions:new', JSON.stringify({
      contributionId,
      ipfsHash,
      category,
      title,
    }));
    
    // Emit event for verification engine
    await redis.lpush('verification:queue', JSON.stringify({
      contributionId,
      ipfsHash,
      priority: category === 'Research' ? 'high' : 'normal',
    }));
    
    res.status(201).json({
      success: true,
      contributionId,
      ipfsHash,
      message: 'Contribution submitted successfully',
    });
    
  } catch (error) {
    console.error('Error submitting contribution:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get contribution by ID
 */
app.get('/api/contributions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check cache first
    const cached = await redis.get(`contribution:${id}`);
    if (cached) {
      return res.json(JSON.parse(cached));
    }
    
    const query = 'SELECT * FROM contributions WHERE id = $1';
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contribution not found' });
    }
    
    const contribution = result.rows[0];
    
    // Fetch from IPFS
    const ipfsHash = contribution.ipfs_hash.replace('ipfs://', '');
    const chunks = [];
    for await (const chunk of ipfs.cat(ipfsHash)) {
      chunks.push(chunk);
    }
    const contentData = JSON.parse(Buffer.concat(chunks).toString());
    
    const response = {
      ...contribution,
      content: contentData,
    };
    
    // Cache for 5 minutes
    await redis.setex(`contribution:${id}`, 300, JSON.stringify(response));
    
    res.json(response);
    
  } catch (error) {
    console.error('Error fetching contribution:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * List contributions with pagination
 */
app.get('/api/contributions', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, category } = req.query;
    const offset = (page - 1) * limit;
    
    let query = 'SELECT * FROM contributions WHERE 1=1';
    const params = [];
    let paramCount = 1;
    
    if (status) {
      query += ` AND status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }
    
    if (category) {
      query += ` AND category = $${paramCount}`;
      params.push(category);
      paramCount++;
    }
    
    query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    // Get total count
    const countQuery = 'SELECT COUNT(*) FROM contributions';
    const countResult = await pool.query(countQuery);
    const total = parseInt(countResult.rows[0].count);
    
    res.json({
      contributions: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
    
  } catch (error) {
    console.error('Error listing contributions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get contribution statistics
 */
app.get('/api/stats', async (req, res) => {
  try {
    const cacheKey = 'stats:contributions';
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      return res.json(JSON.parse(cached));
    }
    
    const query = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
        COUNT(DISTINCT contributor_address) as unique_contributors
      FROM contributions
    `;
    
    const result = await pool.query(query);
    const stats = result.rows[0];
    
    // Cache for 1 minute
    await redis.setex(cacheKey, 60, JSON.stringify(stats));
    
    res.json(stats);
    
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'contribution-manager' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Contribution Manager running on port ${PORT}`);
});