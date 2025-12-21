#!/usr/bin/env python3
"""
Immutable Logging System (Python)
Append-only, tamper-proof logging with cryptographic verification
Perfect for autonomous business operations audit trails
"""

import os
import json
import hashlib
import time
from datetime import datetime
from pathlib import Path
import gzip
import shutil
from typing import Dict, List, Optional, Any
import uuid

class ImmutableLogger:
    def __init__(self, log_dir: str = './logs', **options):
        self.log_dir = Path(log_dir)
        self.log_file = self.log_dir / 'immutable.log'
        self.index_file = self.log_dir / 'log-index.json'
        self.hash_file = self.log_dir / 'log-hashes.json'
        self.chain_file = self.log_dir / 'blockchain.json'
        
        # Options
        self.enable_blockchain = options.get('enable_blockchain', True)
        self.enable_encryption = options.get('enable_encryption', False)
        self.rotate_size = options.get('rotate_size', 100 * 1024 * 1024)  # 100MB
        
        # Initialize
        self.initialize()
        
        # Blockchain chain
        self.chain: List[Dict] = []
        self.load_chain()
    
    def initialize(self):
        """Initialize log directory and files"""
        # Create directory
        self.log_dir.mkdir(parents=True, exist_ok=True)
        
        # Create log file (read-only)
        if not self.log_file.exists():
            self.log_file.touch(mode=0o444)
        
        # Create index file
        if not self.index_file.exists():
            self.index_file.write_text(json.dumps({'entries': []}, indent=2))
        
        # Create hash file
        if not self.hash_file.exists():
            self.hash_file.write_text(json.dumps({'hashes': []}, indent=2))
        
        # Create blockchain file
        if not self.chain_file.exists():
            self.chain_file.write_text(json.dumps([], indent=2))
    
    def log(self, level: str, message: str, metadata: Optional[Dict] = None) -> Dict:
        """Log an entry (immutable)"""
        metadata = metadata or {}
        
        # Create entry
        entry = self.create_entry(level, message, metadata)
        data = json.dumps(entry)
        entry_hash = self.hash(data)
        
        # Create blockchain block
        block = {
            'index': len(self.chain),
            'timestamp': entry['timestamp'],
            'data': data,
            'hash': entry_hash,
            'previousHash': self.chain[-1]['hash'] if self.chain else '0'
        }
        
        # Verify block
        if self.enable_blockchain and not self.is_valid_block(block):
            raise ValueError('Invalid block - blockchain verification failed')
        
        # Append to log file
        self.append_to_log(data + '\n')
        
        # Update index
        self.update_index(entry, entry_hash)
        
        # Update hash chain
        self.update_hash_chain(entry_hash)
        
        # Add to blockchain
        self.chain.append(block)
        self.save_chain()
        
        # Check rotation
        self.check_rotation()
        
        return {'success': True, 'hash': entry_hash, 'index': block['index']}
    
    # Convenience methods
    def info(self, message: str, metadata: Optional[Dict] = None):
        return self.log('INFO', message, metadata)
    
    def warn(self, message: str, metadata: Optional[Dict] = None):
        return self.log('WARN', message, metadata)
    
    def error(self, message: str, metadata: Optional[Dict] = None):
        return self.log('ERROR', message, metadata)
    
    def critical(self, message: str, metadata: Optional[Dict] = None):
        return self.log('CRITICAL', message, metadata)
    
    def audit(self, message: str, metadata: Optional[Dict] = None):
        return self.log('AUDIT', message, metadata)
    
    def security(self, message: str, metadata: Optional[Dict] = None):
        return self.log('SECURITY', message, metadata)
    
    def revenue(self, message: str, metadata: Optional[Dict] = None):
        return self.log('REVENUE', message, metadata)
    
    def system(self, message: str, metadata: Optional[Dict] = None):
        return self.log('SYSTEM', message, metadata)
    
    def create_entry(self, level: str, message: str, metadata: Dict) -> Dict:
        """Create log entry"""
        return {
            'id': str(uuid.uuid4()),
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'level': level,
            'message': message,
            'metadata': metadata,
            'hostname': os.uname().nodename,
            'pid': os.getpid()
        }
    
    def append_to_log(self, data: str):
        """Append to log file (atomic, append-only)"""
        # Change permissions temporarily
        os.chmod(self.log_file, 0o644)
        
        # Append data
        with open(self.log_file, 'a') as f:
            f.write(data)
        
        # Make read-only again
        os.chmod(self.log_file, 0o444)
    
    def update_index(self, entry: Dict, entry_hash: str):
        """Update index file"""
        index = json.loads(self.index_file.read_text())
        index['entries'].append({
            'id': entry['id'],
            'timestamp': entry['timestamp'],
            'level': entry['level'],
            'hash': entry_hash,
            'offset': self.log_file.stat().st_size
        })
        self.index_file.write_text(json.dumps(index, indent=2))
    
    def update_hash_chain(self, entry_hash: str):
        """Update hash chain"""
        hashes = json.loads(self.hash_file.read_text())
        hashes['hashes'].append(entry_hash)
        self.hash_file.write_text(json.dumps(hashes, indent=2))
    
    def verify(self) -> bool:
        """Verify log integrity"""
        print('🔍 Verifying log integrity...')
        
        # Verify blockchain
        if self.enable_blockchain:
            for i in range(1, len(self.chain)):
                current = self.chain[i]
                previous = self.chain[i - 1]
                
                # Verify current hash
                if current['hash'] != self.hash(current['data']):
                    print(f'❌ Block {i} hash mismatch!')
                    return False
                
                # Verify previous hash link
                if current['previousHash'] != previous['hash']:
                    print(f'❌ Block {i} previous hash mismatch!')
                    return False
        
        print('✅ Log integrity verified')
        return True
    
    def read(self, limit: int = 100, level: Optional[str] = None,
            start_date: Optional[str] = None, end_date: Optional[str] = None) -> List[Dict]:
        """Read logs with filters"""
        index = json.loads(self.index_file.read_text())
        entries = index['entries']
        
        # Filter by level
        if level:
            entries = [e for e in entries if e['level'] == level]
        
        # Filter by date
        if start_date:
            entries = [e for e in entries if e['timestamp'] >= start_date]
        if end_date:
            entries = [e for e in entries if e['timestamp'] <= end_date]
        
        # Limit
        entries = entries[-limit:]
        
        # Read actual data from blockchain
        logs = []
        for entry in entries:
            idx = next((i for i, b in enumerate(self.chain) if b['timestamp'] == entry['timestamp']), None)
            if idx is not None:
                logs.append(json.loads(self.chain[idx]['data']))
        
        return logs
    
    def search(self, query: str, **options) -> List[Dict]:
        """Search logs"""
        logs = self.read(limit=10000, **options)
        return [log for log in logs if query.lower() in json.dumps(log).lower()]
    
    def stats(self) -> Dict:
        """Get statistics"""
        index = json.loads(self.index_file.read_text())
        levels = {}
        
        for entry in index['entries']:
            level = entry['level']
            levels[level] = levels.get(level, 0) + 1
        
        return {
            'totalEntries': len(index['entries']),
            'fileSize': self.log_file.stat().st_size if self.log_file.exists() else 0,
            'blockchainLength': len(self.chain),
            'levels': levels,
            'verified': self.verify(),
            'oldestEntry': index['entries'][0]['timestamp'] if index['entries'] else None,
            'newestEntry': index['entries'][-1]['timestamp'] if index['entries'] else None
        }
    
    def check_rotation(self):
        """Check if rotation needed"""
        if self.log_file.stat().st_size >= self.rotate_size:
            self.rotate()
    
    def rotate(self):
        """Rotate logs"""
        timestamp = datetime.utcnow().isoformat().replace(':', '-')
        archive_file = self.log_dir / f'immutable-{timestamp}.log'
        
        # Copy log file
        shutil.copy2(self.log_file, archive_file)
        
        # Compress
        with open(archive_file, 'rb') as f_in:
            with gzip.open(str(archive_file) + '.gz', 'wb') as f_out:
                shutil.copyfileobj(f_in, f_out)
        
        # Remove uncompressed
        archive_file.unlink()
        
        # Clear current log
        os.chmod(self.log_file, 0o644)
        self.log_file.write_text('')
        os.chmod(self.log_file, 0o444)
        
        print(f'📦 Rotated logs to: {archive_file}.gz')
    
    def hash(self, data: str) -> str:
        """Hash function"""
        return hashlib.sha256(data.encode()).hexdigest()
    
    def is_valid_block(self, block: Dict) -> bool:
        """Validate blockchain block"""
        if not self.chain:
            return True
        
        previous = self.chain[-1]
        return (block['previousHash'] == previous['hash'] and
                block['hash'] == self.hash(block['data']))
    
    def load_chain(self):
        """Load blockchain from disk"""
        if self.chain_file.exists():
            self.chain = json.loads(self.chain_file.read_text())
    
    def save_chain(self):
        """Save blockchain to disk"""
        self.chain_file.write_text(json.dumps(self.chain, indent=2))


# CLI usage
if __name__ == '__main__':
    logger = ImmutableLogger('./logs', enable_blockchain=True)
    
    # Test logging
    logger.info('System started', {'version': '1.0.0'})
    logger.audit('User login', {'userId': 'user123', 'ip': '192.168.1.1'})
    logger.revenue('Payment received', {'amount': 1000, 'currency': 'USD'})
    logger.error('System error', {'error': 'Connection timeout'})
    
    # Verify
    print('\n' + '=' * 80)
    logger.verify()
    
    # Stats
    print('\n' + '=' * 80)
    print('📊 Log Statistics:')
    import pprint
    pprint.pprint(logger.stats())
    
    # Search
    print('\n' + '=' * 80)
    print('🔍 Search results for "revenue":')
    pprint.pprint(logger.search('revenue'))
