#!/usr/bin/env python3
"""
Immutable Logging System with Cloud Backup
Append-only, tamper-proof logging with cryptographic verification
S3/GCS replication for disaster recovery
"""

import os
import json
import hashlib
from datetime import datetime
from pathlib import Path
import gzip
import shutil
from typing import Dict, List, Optional
import uuid
from concurrent.futures import ThreadPoolExecutor
import threading

# Cloud storage imports (optional)
try:
    import boto3
    from botocore.exceptions import ClientError
    HAS_BOTO3 = True
except ImportError:
    HAS_BOTO3 = False

try:
    from google.cloud import storage as gcs_storage
    HAS_GCS = True
except ImportError:
    HAS_GCS = False


class CloudBackupProvider:
    """Base class for cloud backup providers"""
    
    def upload_block(self, block: Dict, key: str) -> bool:
        raise NotImplementedError
    
    def upload_file(self, local_path: str, remote_key: str) -> bool:
        raise NotImplementedError
    
    def download_block(self, key: str) -> Optional[Dict]:
        raise NotImplementedError
    
    def list_blocks(self, prefix: str = '') -> List[str]:
        raise NotImplementedError


class S3BackupProvider(CloudBackupProvider):
    """AWS S3 backup provider with encryption"""
    
    def __init__(self, bucket_name: str, region: str = 'us-east-1', **kwargs):
        if not HAS_BOTO3:
            raise ImportError('boto3 not installed. Run: pip install boto3')
        
        self.bucket_name = bucket_name
        self.region = region
        
        # Initialize S3 client
        self.s3 = boto3.client(
            's3',
            region_name=region,
            aws_access_key_id=kwargs.get('aws_access_key_id'),
            aws_secret_access_key=kwargs.get('aws_secret_access_key')
        )
        
        # Create bucket if not exists
        self._ensure_bucket_exists()
    
    def _ensure_bucket_exists(self):
        """Create bucket if it doesn't exist"""
        try:
            self.s3.head_bucket(Bucket=self.bucket_name)
        except ClientError:
            try:
                if self.region == 'us-east-1':
                    self.s3.create_bucket(Bucket=self.bucket_name)
                else:
                    self.s3.create_bucket(
                        Bucket=self.bucket_name,
                        CreateBucketConfiguration={'LocationConstraint': self.region}
                    )
                print(f'✅ Created S3 bucket: {self.bucket_name}')
            except ClientError as e:
                print(f'⚠️  Could not create bucket: {e}')
    
    def upload_block(self, block: Dict, key: str) -> bool:
        """Upload block to S3 with server-side encryption"""
        try:
            self.s3.put_object(
                Bucket=self.bucket_name,
                Key=key,
                Body=json.dumps(block),
                ContentType='application/json',
                ServerSideEncryption='AES256',
                Metadata={
                    'block-index': str(block['index']),
                    'block-hash': block['hash'],
                    'timestamp': block['timestamp']
                }
            )
            return True
        except ClientError as e:
            print(f'❌ S3 upload failed: {e}')
            return False
    
    def upload_file(self, local_path: str, remote_key: str) -> bool:
        """Upload file to S3"""
        try:
            self.s3.upload_file(
                local_path,
                self.bucket_name,
                remote_key,
                ExtraArgs={'ServerSideEncryption': 'AES256'}
            )
            return True
        except ClientError as e:
            print(f'❌ S3 file upload failed: {e}')
            return False
    
    def download_block(self, key: str) -> Optional[Dict]:
        """Download block from S3"""
        try:
            response = self.s3.get_object(Bucket=self.bucket_name, Key=key)
            return json.loads(response['Body'].read())
        except ClientError:
            return None
    
    def list_blocks(self, prefix: str = '') -> List[str]:
        """List all blocks in S3"""
        try:
            response = self.s3.list_objects_v2(
                Bucket=self.bucket_name,
                Prefix=prefix
            )
            return [obj['Key'] for obj in response.get('Contents', [])]
        except ClientError:
            return []


class GCSBackupProvider(CloudBackupProvider):
    """Google Cloud Storage backup provider"""
    
    def __init__(self, bucket_name: str, project_id: Optional[str] = None, **kwargs):
        if not HAS_GCS:
            raise ImportError('google-cloud-storage not installed. Run: pip install google-cloud-storage')
        
        self.bucket_name = bucket_name
        self.project_id = project_id
        
        # Initialize GCS client
        self.client = gcs_storage.Client(project=project_id)
        
        # Get or create bucket
        try:
            self.bucket = self.client.get_bucket(bucket_name)
        except Exception:
            self.bucket = self.client.create_bucket(bucket_name)
            print(f'✅ Created GCS bucket: {bucket_name}')
    
    def upload_block(self, block: Dict, key: str) -> bool:
        """Upload block to GCS"""
        try:
            blob = self.bucket.blob(key)
            blob.metadata = {
                'block-index': str(block['index']),
                'block-hash': block['hash'],
                'timestamp': block['timestamp']
            }
            blob.upload_from_string(
                json.dumps(block),
                content_type='application/json'
            )
            return True
        except Exception as e:
            print(f'❌ GCS upload failed: {e}')
            return False
    
    def upload_file(self, local_path: str, remote_key: str) -> bool:
        """Upload file to GCS"""
        try:
            blob = self.bucket.blob(remote_key)
            blob.upload_from_filename(local_path)
            return True
        except Exception as e:
            print(f'❌ GCS file upload failed: {e}')
            return False
    
    def download_block(self, key: str) -> Optional[Dict]:
        """Download block from GCS"""
        try:
            blob = self.bucket.blob(key)
            return json.loads(blob.download_as_string())
        except Exception:
            return None
    
    def list_blocks(self, prefix: str = '') -> List[str]:
        """List all blocks in GCS"""
        return [blob.name for blob in self.bucket.list_blobs(prefix=prefix)]


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
        
        # Cloud backup options
        self.enable_cloud_backup = options.get('enable_cloud_backup', False)
        self.backup_provider = options.get('backup_provider', 's3')  # 's3' or 'gcs'
        self.backup_async = options.get('backup_async', True)
        self.backup_batch_size = options.get('backup_batch_size', 100)
        
        # Initialize cloud backup
        self.cloud = None
        if self.enable_cloud_backup:
            self._initialize_cloud_backup(options)
        
        # Backup queue for async uploads
        self.backup_queue = []
        self.backup_lock = threading.Lock()
        self.executor = ThreadPoolExecutor(max_workers=4)
        
        # Initialize
        self.initialize()
        
        # Blockchain chain
        self.chain: List[Dict] = []
        self.load_chain()
    
    def _initialize_cloud_backup(self, options):
        """Initialize cloud backup provider"""
        try:
            if self.backup_provider == 's3':
                self.cloud = S3BackupProvider(
                    bucket_name=options.get('s3_bucket', 'immutable-logs-backup'),
                    region=options.get('s3_region', 'us-east-1'),
                    aws_access_key_id=options.get('aws_access_key_id'),
                    aws_secret_access_key=options.get('aws_secret_access_key')
                )
                print(f'☁️  S3 backup enabled: {options.get("s3_bucket", "immutable-logs-backup")}')
            
            elif self.backup_provider == 'gcs':
                self.cloud = GCSBackupProvider(
                    bucket_name=options.get('gcs_bucket', 'immutable-logs-backup'),
                    project_id=options.get('gcs_project_id')
                )
                print(f'☁️  GCS backup enabled: {options.get("gcs_bucket", "immutable-logs-backup")}')
            
            else:
                raise ValueError(f'Unknown backup provider: {self.backup_provider}')
        
        except Exception as e:
            print(f'⚠️  Cloud backup initialization failed: {e}')
            self.enable_cloud_backup = False
    
    def initialize(self):
        """Initialize log directory and files"""
        self.log_dir.mkdir(parents=True, exist_ok=True)
        
        if not self.log_file.exists():
            self.log_file.touch(mode=0o444)
        
        if not self.index_file.exists():
            self.index_file.write_text(json.dumps({'entries': []}, indent=2))
        
        if not self.hash_file.exists():
            self.hash_file.write_text(json.dumps({'hashes': []}, indent=2))
        
        if not self.chain_file.exists():
            self.chain_file.write_text(json.dumps([], indent=2))
    
    def log(self, level: str, message: str, metadata: Optional[Dict] = None) -> Dict:
        """Log an entry (immutable)"""
        metadata = metadata or {}
        
        entry = self.create_entry(level, message, metadata)
        data = json.dumps(entry)
        entry_hash = self.hash(data)
        
        block = {
            'index': len(self.chain),
            'timestamp': entry['timestamp'],
            'data': data,
            'hash': entry_hash,
            'previousHash': self.chain[-1]['hash'] if self.chain else '0'
        }
        
        if self.enable_blockchain and not self.is_valid_block(block):
            raise ValueError('Invalid block - blockchain verification failed')
        
        self.append_to_log(data + '\n')
        self.update_index(entry, entry_hash)
        self.update_hash_chain(entry_hash)
        
        self.chain.append(block)
        self.save_chain()
        
        # Backup to cloud
        if self.enable_cloud_backup:
            self.backup_to_cloud(block)
        
        self.check_rotation()
        
        return {'success': True, 'hash': entry_hash, 'index': block['index']}
    
    def backup_to_cloud(self, block: Dict):
        """Backup block to cloud storage"""
        if not self.cloud:
            return
        
        key = f'blocks/{block["hash"]}.json'
        
        if self.backup_async:
            # Async backup via thread pool
            with self.backup_lock:
                self.backup_queue.append((block, key))
                
                # Batch upload when queue is full
                if len(self.backup_queue) >= self.backup_batch_size:
                    self._flush_backup_queue()
        else:
            # Synchronous backup
            success = self.cloud.upload_block(block, key)
            if success:
                print(f'☁️  Backed up block {block["index"]} to cloud')
    
    def _flush_backup_queue(self):
        """Upload all queued blocks to cloud"""
        if not self.backup_queue:
            return
        
        queue_copy = self.backup_queue.copy()
        self.backup_queue.clear()
        
        def upload_batch():
            success_count = 0
            for block, key in queue_copy:
                if self.cloud.upload_block(block, key):
                    success_count += 1
            print(f'☁️  Backed up {success_count}/{len(queue_copy)} blocks to cloud')
        
        self.executor.submit(upload_batch)
    
    def restore_from_cloud(self, block_hash: Optional[str] = None) -> Optional[Dict]:
        """Restore block(s) from cloud backup"""
        if not self.cloud:
            print('❌ Cloud backup not enabled')
            return None
        
        if block_hash:
            # Restore specific block
            key = f'blocks/{block_hash}.json'
            return self.cloud.download_block(key)
        else:
            # Restore all blocks
            keys = self.cloud.list_blocks('blocks/')
            restored = []
            for key in keys:
                block = self.cloud.download_block(key)
                if block:
                    restored.append(block)
            
            # Sort by index and rebuild chain
            restored.sort(key=lambda b: b['index'])
            print(f'📥 Restored {len(restored)} blocks from cloud')
            return restored
    
    def verify_cloud_backup(self) -> Dict:
        """Verify cloud backup integrity"""
        if not self.cloud:
            return {'error': 'Cloud backup not enabled'}
        
        print('☁️  Verifying cloud backup integrity...')
        
        local_blocks = len(self.chain)
        cloud_blocks = len(self.cloud.list_blocks('blocks/'))
        
        missing = []
        for block in self.chain:
            key = f'blocks/{block["hash"]}.json'
            cloud_block = self.cloud.download_block(key)
            if not cloud_block:
                missing.append(block['index'])
        
        result = {
            'local_blocks': local_blocks,
            'cloud_blocks': cloud_blocks,
            'missing_blocks': missing,
            'sync_status': 'synced' if not missing else 'out_of_sync',
            'sync_percentage': ((local_blocks - len(missing)) / local_blocks * 100) if local_blocks > 0 else 0
        }
        
        if not missing:
            print(f'✅ Cloud backup verified: {local_blocks} blocks synced')
        else:
            print(f'⚠️  Cloud backup incomplete: {len(missing)} blocks missing')
        
        return result
    
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
        os.chmod(self.log_file, 0o644)
        with open(self.log_file, 'a') as f:
            f.write(data)
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
        
        if self.enable_blockchain:
            for i in range(1, len(self.chain)):
                current = self.chain[i]
                previous = self.chain[i - 1]
                
                if current['hash'] != self.hash(current['data']):
                    print(f'❌ Block {i} hash mismatch!')
                    return False
                
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
        
        if level:
            entries = [e for e in entries if e['level'] == level]
        
        if start_date:
            entries = [e for e in entries if e['timestamp'] >= start_date]
        if end_date:
            entries = [e for e in entries if e['timestamp'] <= end_date]
        
        entries = entries[-limit:]
        
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
        
        stats = {
            'totalEntries': len(index['entries']),
            'fileSize': self.log_file.stat().st_size if self.log_file.exists() else 0,
            'blockchainLength': len(self.chain),
            'levels': levels,
            'verified': self.verify(),
            'oldestEntry': index['entries'][0]['timestamp'] if index['entries'] else None,
            'newestEntry': index['entries'][-1]['timestamp'] if index['entries'] else None,
            'cloudBackupEnabled': self.enable_cloud_backup
        }
        
        if self.enable_cloud_backup:
            cloud_status = self.verify_cloud_backup()
            stats['cloudBackup'] = cloud_status
        
        return stats
    
    def check_rotation(self):
        """Check if rotation needed"""
        if self.log_file.stat().st_size >= self.rotate_size:
            self.rotate()
    
    def rotate(self):
        """Rotate logs with cloud backup"""
        timestamp = datetime.utcnow().isoformat().replace(':', '-')
        archive_file = self.log_dir / f'immutable-{timestamp}.log'
        
        shutil.copy2(self.log_file, archive_file)
        
        with open(archive_file, 'rb') as f_in:
            with gzip.open(str(archive_file) + '.gz', 'wb') as f_out:
                shutil.copyfileobj(f_in, f_out)
        
        # Backup to cloud
        if self.enable_cloud_backup and self.cloud:
            remote_key = f'archives/immutable-{timestamp}.log.gz'
            if self.cloud.upload_file(str(archive_file) + '.gz', remote_key):
                print(f'☁️  Uploaded archive to cloud: {remote_key}')
        
        archive_file.unlink()
        
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
    
    def shutdown(self):
        """Graceful shutdown - flush backup queue"""
        if self.enable_cloud_backup and self.backup_queue:
            print('🔄 Flushing backup queue...')
            self._flush_backup_queue()
            self.executor.shutdown(wait=True)
            print('✅ Backup queue flushed')


# CLI usage
if __name__ == '__main__':
    import sys
    
    # Example with S3 backup
    if len(sys.argv) > 1 and sys.argv[1] == 's3':
        logger = ImmutableLogger('./logs', 
            enable_blockchain=True,
            enable_cloud_backup=True,
            backup_provider='s3',
            s3_bucket='immutable-logs-backup',
            s3_region='us-east-1',
            backup_async=True,
            backup_batch_size=10
        )
    
    # Example with GCS backup
    elif len(sys.argv) > 1 and sys.argv[1] == 'gcs':
        logger = ImmutableLogger('./logs',
            enable_blockchain=True,
            enable_cloud_backup=True,
            backup_provider='gcs',
            gcs_bucket='immutable-logs-backup',
            gcs_project_id='my-project-id',
            backup_async=True
        )
    
    # No cloud backup (default)
    else:
        logger = ImmutableLogger('./logs', enable_blockchain=True)
    
    # Test logging
    logger.info('System started', {'version': '2.0.0', 'cloud_backup': logger.enable_cloud_backup})
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
    
    # Graceful shutdown
    logger.shutdown()
