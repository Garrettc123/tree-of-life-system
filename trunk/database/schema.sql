-- NWU Protocol Database Schema

-- Contributions table
CREATE TABLE IF NOT EXISTS contributions (
    id SERIAL PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL,
    ipfs_hash VARCHAR(100) NOT NULL UNIQUE,
    contributor_address VARCHAR(42) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    verification_tx VARCHAR(66),
    reward_amount NUMERIC(20, 8),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verified_at TIMESTAMP,
    
    CHECK (status IN ('pending', 'verifying', 'approved', 'rejected'))
);

-- Verifications table
CREATE TABLE IF NOT EXISTS verifications (
    id SERIAL PRIMARY KEY,
    contribution_id INTEGER REFERENCES contributions(id),
    verifier_address VARCHAR(42) NOT NULL,
    approved BOOLEAN NOT NULL,
    feedback TEXT,
    tx_hash VARCHAR(66),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(contribution_id, verifier_address)
);

-- Contributors table
CREATE TABLE IF NOT EXISTS contributors (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(42) NOT NULL UNIQUE,
    reputation_score NUMERIC(10, 2) DEFAULT 0,
    total_contributions INTEGER DEFAULT 0,
    approved_contributions INTEGER DEFAULT 0,
    total_rewards NUMERIC(20, 8) DEFAULT 0,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AI verification results
CREATE TABLE IF NOT EXISTS ai_verifications (
    id SERIAL PRIMARY KEY,
    contribution_id INTEGER REFERENCES contributions(id),
    agent_type VARCHAR(50) NOT NULL,
    quality_score NUMERIC(3, 2),
    plagiarism_detected BOOLEAN,
    format_valid BOOLEAN,
    coherence_score NUMERIC(3, 2),
    suggestions TEXT[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Rewards history
CREATE TABLE IF NOT EXISTS rewards (
    id SERIAL PRIMARY KEY,
    contribution_id INTEGER REFERENCES contributions(id),
    recipient_address VARCHAR(42) NOT NULL,
    amount NUMERIC(20, 8) NOT NULL,
    tx_hash VARCHAR(66) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_contributions_status ON contributions(status);
CREATE INDEX idx_contributions_contributor ON contributions(contributor_address);
CREATE INDEX idx_contributions_category ON contributions(category);
CREATE INDEX idx_contributions_created_at ON contributions(created_at DESC);
CREATE INDEX idx_verifications_contribution ON verifications(contribution_id);
CREATE INDEX idx_contributors_reputation ON contributors(reputation_score DESC);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_contributions_updated_at BEFORE UPDATE ON contributions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();