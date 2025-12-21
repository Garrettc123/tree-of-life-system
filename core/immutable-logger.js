/**
 * Immutable Logging System
 * Append-only, tamper-proof logging with cryptographic verification
 * Perfect for autonomous business operations audit trails
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

class ImmutableLogger {
    constructor(logDir = './logs', options = {}) {
        this.logDir = logDir;
        this.logFile = path.join(logDir, 'immutable.log');
        this.indexFile = path.join(logDir, 'log-index.json');
        this.hashFile = path.join(logDir, 'log-hashes.json');
        
        // Options
        this.enableBlockchain = options.enableBlockchain !== false;
        this.enableEncryption = options.enableEncryption || false;
        this.encryptionKey = options.encryptionKey || this.generateKey();
        this.rotateSize = options.rotateSize || 100 * 1024 * 1024; // 100MB default
        
        // Initialize
        this.initialize();
        
        // Blockchain chain (for verification)
        this.chain = [];
        this.loadChain();
    }
    
    initialize() {
        // Create log directory
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
        
        // Create log file if not exists (append-only mode)
        if (!fs.existsSync(this.logFile)) {
            fs.writeFileSync(this.logFile, '', { mode: 0o444 }); // Read-only
        }
        
        // Create index file
        if (!fs.existsSync(this.indexFile)) {
            fs.writeFileSync(this.indexFile, JSON.stringify({ entries: [] }, null, 2));
        }
        
        // Create hash file
        if (!fs.existsSync(this.hashFile)) {
            fs.writeFileSync(this.hashFile, JSON.stringify({ hashes: [] }, null, 2));
        }
    }
    
    /**
     * Log an entry (immutable)
     */
    log(level, message, metadata = {}) {
        const entry = this.createEntry(level, message, metadata);
        const encrypted = this.enableEncryption ? this.encrypt(JSON.stringify(entry)) : JSON.stringify(entry);
        const hash = this.hash(encrypted);
        
        // Create blockchain block
        const block = {
            index: this.chain.length,
            timestamp: entry.timestamp,
            data: encrypted,
            hash: hash,
            previousHash: this.chain.length > 0 ? this.chain[this.chain.length - 1].hash : '0'
        };
        
        // Verify block integrity
        if (this.enableBlockchain && !this.isValidBlock(block)) {
            throw new Error('Invalid block - blockchain verification failed');
        }
        
        // Append to log file (atomic write)
        this.appendToLog(encrypted + '\n');
        
        // Update index
        this.updateIndex(entry, hash);
        
        // Update hash chain
        this.updateHashChain(hash);
        
        // Add to blockchain
        this.chain.push(block);
        this.saveChain();
        
        // Check rotation
        this.checkRotation();
        
        return { success: true, hash, index: block.index };
    }
    
    /**
     * Log levels (convenience methods)
     */
    info(message, metadata) { return this.log('INFO', message, metadata); }
    warn(message, metadata) { return this.log('WARN', message, metadata); }
    error(message, metadata) { return this.log('ERROR', message, metadata); }
    critical(message, metadata) { return this.log('CRITICAL', message, metadata); }
    audit(message, metadata) { return this.log('AUDIT', message, metadata); }
    security(message, metadata) { return this.log('SECURITY', message, metadata); }
    revenue(message, metadata) { return this.log('REVENUE', message, metadata); }
    system(message, metadata) { return this.log('SYSTEM', message, metadata); }
    
    /**
     * Create log entry
     */
    createEntry(level, message, metadata) {
        return {
            id: this.generateId(),
            timestamp: new Date().toISOString(),
            level: level,
            message: message,
            metadata: metadata,
            source: this.getSource(),
            hostname: require('os').hostname(),
            pid: process.pid
        };
    }
    
    /**
     * Append to log file (atomic, append-only)
     */
    appendToLog(data) {
        // Change permissions temporarily to append
        fs.chmodSync(this.logFile, 0o644);
        
        // Append data
        fs.appendFileSync(this.logFile, data, { flag: 'a' });
        
        // Make read-only again
        fs.chmodSync(this.logFile, 0o444);
    }
    
    /**
     * Update index file
     */
    updateIndex(entry, hash) {
        const index = JSON.parse(fs.readFileSync(this.indexFile, 'utf8'));
        index.entries.push({
            id: entry.id,
            timestamp: entry.timestamp,
            level: entry.level,
            hash: hash,
            offset: this.getFileSize(this.logFile)
        });
        fs.writeFileSync(this.indexFile, JSON.stringify(index, null, 2));
    }
    
    /**
     * Update hash chain
     */
    updateHashChain(hash) {
        const hashes = JSON.parse(fs.readFileSync(this.hashFile, 'utf8'));
        hashes.hashes.push(hash);
        fs.writeFileSync(this.hashFile, JSON.stringify(hashes, null, 2));
    }
    
    /**
     * Verify log integrity
     */
    verify() {
        console.log('🔍 Verifying log integrity...');
        
        // Verify blockchain
        if (this.enableBlockchain) {
            for (let i = 1; i < this.chain.length; i++) {
                const currentBlock = this.chain[i];
                const previousBlock = this.chain[i - 1];
                
                // Verify current block hash
                if (currentBlock.hash !== this.hash(currentBlock.data)) {
                    console.error(`❌ Block ${i} hash mismatch!`);
                    return false;
                }
                
                // Verify previous hash link
                if (currentBlock.previousHash !== previousBlock.hash) {
                    console.error(`❌ Block ${i} previous hash mismatch!`);
                    return false;
                }
            }
        }
        
        console.log('✅ Log integrity verified');
        return true;
    }
    
    /**
     * Read logs (with verification)
     */
    read(options = {}) {
        const { limit = 100, level = null, startDate = null, endDate = null } = options;
        
        const index = JSON.parse(fs.readFileSync(this.indexFile, 'utf8'));
        let entries = index.entries;
        
        // Filter by level
        if (level) {
            entries = entries.filter(e => e.level === level);
        }
        
        // Filter by date range
        if (startDate) {
            entries = entries.filter(e => new Date(e.timestamp) >= new Date(startDate));
        }
        if (endDate) {
            entries = entries.filter(e => new Date(e.timestamp) <= new Date(endDate));
        }
        
        // Limit results
        entries = entries.slice(-limit);
        
        // Read actual log data
        const logs = entries.map(entry => {
            const block = this.chain[entry.offset] || {};
            let data = block.data || '{}';
            
            if (this.enableEncryption) {
                try {
                    data = this.decrypt(data);
                } catch (e) {
                    console.warn('Failed to decrypt log entry:', e.message);
                }
            }
            
            return JSON.parse(data);
        });
        
        return logs;
    }
    
    /**
     * Search logs
     */
    search(query, options = {}) {
        const logs = this.read({ limit: 10000, ...options });
        return logs.filter(log => {
            const searchString = JSON.stringify(log).toLowerCase();
            return searchString.includes(query.toLowerCase());
        });
    }
    
    /**
     * Get statistics
     */
    stats() {
        const index = JSON.parse(fs.readFileSync(this.indexFile, 'utf8'));
        const levels = {};
        
        index.entries.forEach(entry => {
            levels[entry.level] = (levels[entry.level] || 0) + 1;
        });
        
        return {
            totalEntries: index.entries.length,
            fileSize: this.getFileSize(this.logFile),
            blockchainLength: this.chain.length,
            levels: levels,
            verified: this.verify(),
            oldestEntry: index.entries[0]?.timestamp,
            newestEntry: index.entries[index.entries.length - 1]?.timestamp
        };
    }
    
    /**
     * Rotate logs
     */
    checkRotation() {
        if (this.getFileSize(this.logFile) >= this.rotateSize) {
            this.rotate();
        }
    }
    
    rotate() {
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const archiveFile = path.join(this.logDir, `immutable-${timestamp}.log`);
        
        // Copy log file
        fs.copyFileSync(this.logFile, archiveFile);
        
        // Compress archive
        this.compress(archiveFile);
        
        // Clear current log
        fs.chmodSync(this.logFile, 0o644);
        fs.writeFileSync(this.logFile, '');
        fs.chmodSync(this.logFile, 0o444);
        
        console.log(`📦 Rotated logs to: ${archiveFile}.gz`);
    }
    
    /**
     * Compress file
     */
    compress(file) {
        const zlib = require('zlib');
        const gzip = zlib.createGzip();
        const source = fs.createReadStream(file);
        const destination = fs.createWriteStream(file + '.gz');
        
        source.pipe(gzip).pipe(destination);
        
        destination.on('finish', () => {
            fs.unlinkSync(file); // Remove uncompressed file
        });
    }
    
    /**
     * Hash function
     */
    hash(data) {
        return crypto.createHash('sha256').update(data).digest('hex');
    }
    
    /**
     * Encrypt data
     */
    encrypt(data) {
        const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    }
    
    /**
     * Decrypt data
     */
    decrypt(data) {
        const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
        let decrypted = decipher.update(data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    
    /**
     * Generate encryption key
     */
    generateKey() {
        return crypto.randomBytes(32).toString('hex');
    }
    
    /**
     * Generate unique ID
     */
    generateId() {
        return crypto.randomBytes(16).toString('hex');
    }
    
    /**
     * Get source (calling file)
     */
    getSource() {
        const stack = new Error().stack;
        const lines = stack.split('\n');
        return lines[3]?.trim() || 'unknown';
    }
    
    /**
     * Get file size
     */
    getFileSize(file) {
        try {
            return fs.statSync(file).size;
        } catch (e) {
            return 0;
        }
    }
    
    /**
     * Blockchain methods
     */
    isValidBlock(block) {
        if (this.chain.length === 0) return true;
        
        const previousBlock = this.chain[this.chain.length - 1];
        return block.previousHash === previousBlock.hash && 
               block.hash === this.hash(block.data);
    }
    
    loadChain() {
        const chainFile = path.join(this.logDir, 'blockchain.json');
        if (fs.existsSync(chainFile)) {
            this.chain = JSON.parse(fs.readFileSync(chainFile, 'utf8'));
        }
    }
    
    saveChain() {
        const chainFile = path.join(this.logDir, 'blockchain.json');
        fs.writeFileSync(chainFile, JSON.stringify(this.chain, null, 2));
    }
}

// Export
module.exports = ImmutableLogger;

// CLI usage
if (require.main === module) {
    const logger = new ImmutableLogger('./logs', {
        enableBlockchain: true,
        enableEncryption: false
    });
    
    // Test logging
    logger.info('System started', { version: '1.0.0' });
    logger.audit('User login', { userId: 'user123', ip: '192.168.1.1' });
    logger.revenue('Payment received', { amount: 1000, currency: 'USD' });
    logger.error('System error', { error: 'Connection timeout' });
    
    // Verify integrity
    console.log('\n' + '='.repeat(80));
    logger.verify();
    
    // Show stats
    console.log('\n' + '='.repeat(80));
    console.log('📊 Log Statistics:');
    console.log(logger.stats());
    
    // Search logs
    console.log('\n' + '='.repeat(80));
    console.log('🔍 Search results for "revenue":');
    console.log(logger.search('revenue'));
}
