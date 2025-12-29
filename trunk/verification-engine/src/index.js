const express = require('express');
const { ethers } = require('ethers');
const Redis = require('ioredis');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(express.json());

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Blockchain connection
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.VERIFIER_PRIVATE_KEY, provider);
const protocolAddress = process.env.PROTOCOL_CONTRACT_ADDRESS;
const protocolABI = require('./abis/NWUProtocol.json');
const protocol = new ethers.Contract(protocolAddress, protocolABI, wallet);

/**
 * Process verification queue
 */
async function processVerificationQueue() {
  console.log('Starting verification queue processor...');
  
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      // Pop from queue (blocking)
      const item = await redis.brpop('verification:queue', 5);
      
      if (!item) continue;
      
      const data = JSON.parse(item[1]);
      const { contributionId } = data;
      
      console.log(`Processing verification for contribution ${contributionId}`);
      
      // Get AI verification results
      const aiResults = await getAIVerificationResults(contributionId);
      
      if (!aiResults) {
        console.log('Waiting for AI verification results...');
        // Re-queue with delay
        await redis.lpush('verification:queue', item[1]);
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }
      
      // Make verification decision
      const approved = aiResults.quality_score >= 0.7 && 
                      !aiResults.plagiarism_detected &&
                      aiResults.format_valid;
      
      const feedback = generateFeedback(aiResults);
      
      // Submit to blockchain
      const tx = await protocol.verifyContribution(
        contributionId,
        approved,
        feedback
      );
      
      await tx.wait();
      console.log(`Verification submitted: ${tx.hash}`);
      
      // Update database
      await pool.query(
        'UPDATE contributions SET status = $1, verification_tx = $2 WHERE id = $3',
        [approved ? 'approved' : 'rejected', tx.hash, contributionId]
      );
      
      // Publish event
      await redis.publish('verification:completed', JSON.stringify({
        contributionId,
        approved,
        txHash: tx.hash,
      }));
      
    } catch (error) {
      console.error('Error processing verification:', error);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

/**
 * Get AI verification results from Redis
 */
async function getAIVerificationResults(contributionId) {
  const key = `ai:verification:${contributionId}`;
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}

/**
 * Generate human-readable feedback
 */
function generateFeedback(aiResults) {
  const feedback = [];
  
  if (aiResults.quality_score < 0.7) {
    feedback.push(`Quality score: ${aiResults.quality_score.toFixed(2)} (minimum 0.7 required)`);
  }
  
  if (aiResults.plagiarism_detected) {
    feedback.push('Plagiarism detected');
  }
  
  if (!aiResults.format_valid) {
    feedback.push('Invalid format');
  }
  
  if (aiResults.suggestions && aiResults.suggestions.length > 0) {
    feedback.push('Suggestions: ' + aiResults.suggestions.join(', '));
  }
  
  return feedback.length > 0 ? feedback.join('. ') : 'Approved';
}

/**
 * Manual verification endpoint
 */
app.post('/api/verify', async (req, res) => {
  try {
    const { contributionId, approved, feedback } = req.body;
    
    if (!contributionId || approved === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const tx = await protocol.verifyContribution(
      contributionId,
      approved,
      feedback || ''
    );
    
    const receipt = await tx.wait();
    
    await pool.query(
      'UPDATE contributions SET status = $1, verification_tx = $2 WHERE id = $3',
      [approved ? 'approved' : 'rejected', tx.hash, contributionId]
    );
    
    res.json({
      success: true,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
    });
    
  } catch (error) {
    console.error('Error verifying:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get verification status
 */
app.get('/api/verify/:contributionId', async (req, res) => {
  try {
    const { contributionId } = req.params;
    
    const result = await pool.query(
      'SELECT status, verification_tx FROM contributions WHERE id = $1',
      [contributionId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contribution not found' });
    }
    
    const aiResults = await getAIVerificationResults(contributionId);
    
    res.json({
      ...result.rows[0],
      ai_verification: aiResults,
    });
    
  } catch (error) {
    console.error('Error fetching verification:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'verification-engine' });
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Verification Engine running on port ${PORT}`);
  processVerificationQueue();
});