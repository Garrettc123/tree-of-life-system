# Cloud Backup Guide

## Overview

The Immutable Logger now supports automatic cloud backup replication to AWS S3 and Google Cloud Storage (GCS) for disaster recovery. All blockchain blocks are automatically replicated to the cloud with server-side encryption.

## Features

✅ **Dual Provider Support**: AWS S3 and Google Cloud Storage  
✅ **Async Batch Uploads**: Non-blocking uploads with configurable batch size  
✅ **Server-Side Encryption**: AES-256 encryption at rest  
✅ **Disaster Recovery**: Restore complete blockchain from cloud  
✅ **Integrity Verification**: Verify cloud sync status  
✅ **Auto-Rotation Backup**: Archives uploaded to cloud on rotation  

---

## Quick Start

### AWS S3 Setup

#### 1. Install Dependencies

```bash
pip install boto3
```

#### 2. Configure AWS Credentials

```bash
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_DEFAULT_REGION="us-east-1"
```

#### 3. Enable S3 Backup

```python
from core.immutable_logger import ImmutableLogger

logger = ImmutableLogger(
    log_dir='./logs',
    enable_cloud_backup=True,
    backup_provider='s3',
    s3_bucket='my-company-immutable-logs',
    s3_region='us-east-1',
    backup_async=True,
    backup_batch_size=100  # Upload every 100 blocks
)

# Logs are now automatically backed up to S3
logger.audit('User login', {'userId': 'user123'})
```

### Google Cloud Storage Setup

#### 1. Install Dependencies

```bash
pip install google-cloud-storage
```

#### 2. Configure GCS Credentials

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"
export GCS_PROJECT_ID="my-project-id"
```

#### 3. Enable GCS Backup

```python
from core.immutable_logger import ImmutableLogger

logger = ImmutableLogger(
    log_dir='./logs',
    enable_cloud_backup=True,
    backup_provider='gcs',
    gcs_bucket='my-company-immutable-logs',
    gcs_project_id='my-project-id',
    backup_async=True
)

# Logs are now automatically backed up to GCS
logger.revenue('Payment received', {'amount': 9900, 'currency': 'USD'})
```

---

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enable_cloud_backup` | bool | `False` | Enable cloud backup |
| `backup_provider` | str | `'s3'` | Cloud provider: `'s3'` or `'gcs'` |
| `backup_async` | bool | `True` | Async batch uploads |
| `backup_batch_size` | int | `100` | Blocks per batch upload |
| `s3_bucket` | str | `'immutable-logs-backup'` | S3 bucket name |
| `s3_region` | str | `'us-east-1'` | AWS region |
| `aws_access_key_id` | str | `None` | AWS access key (or use env) |
| `aws_secret_access_key` | str | `None` | AWS secret (or use env) |
| `gcs_bucket` | str | `'immutable-logs-backup'` | GCS bucket name |
| `gcs_project_id` | str | `None` | GCP project ID |

---

## Usage Examples

### Example 1: Basic S3 Backup

```python
logger = ImmutableLogger(
    './logs',
    enable_cloud_backup=True,
    backup_provider='s3',
    s3_bucket='acme-logs-prod'
)

logger.audit('Database backup completed', {'size_mb': 1024})
logger.security('Failed login attempt', {'ip': '203.0.113.42'})

# Graceful shutdown flushes backup queue
logger.shutdown()
```

### Example 2: Synchronous Uploads

```python
# For critical logs that must be immediately backed up
logger = ImmutableLogger(
    './logs',
    enable_cloud_backup=True,
    backup_provider='s3',
    s3_bucket='critical-audit-logs',
    backup_async=False  # Blocking uploads
)

logger.revenue('Wire transfer processed', {'amount': 1000000})
# Block is uploaded to S3 before continuing
```

### Example 3: Verify Cloud Sync

```python
logger = ImmutableLogger('./logs', enable_cloud_backup=True)

# Log some entries
for i in range(500):
    logger.info(f'Event {i}', {'sequence': i})

# Verify cloud backup integrity
status = logger.verify_cloud_backup()
print(status)
# {
#   'local_blocks': 500,
#   'cloud_blocks': 500,
#   'missing_blocks': [],
#   'sync_status': 'synced',
#   'sync_percentage': 100.0
# }
```

### Example 4: Disaster Recovery

```python
# Scenario: Local logs lost, restore from cloud

logger = ImmutableLogger(
    './logs-restored',
    enable_cloud_backup=True,
    backup_provider='s3',
    s3_bucket='company-backups'
)

# Restore entire blockchain from cloud
restored_chain = logger.restore_from_cloud()
print(f'Restored {len(restored_chain)} blocks from cloud')

# Restore specific block by hash
block = logger.restore_from_cloud(block_hash='abc123...')
```

### Example 5: Multi-Environment Setup

```python
import os

ENV = os.getenv('ENVIRONMENT', 'dev')

logger = ImmutableLogger(
    f'./logs/{ENV}',
    enable_cloud_backup=ENV != 'dev',  # No cloud backup in dev
    backup_provider='s3',
    s3_bucket=f'logs-{ENV}',
    s3_region='us-east-1',
    backup_batch_size=50 if ENV == 'prod' else 10
)

logger.system(f'{ENV} environment started', {'timestamp': datetime.utcnow()})
```

---

## Cloud Storage Structure

### S3/GCS Bucket Layout

```
my-bucket/
├── blocks/
│   ├── abc123...def.json          # Individual block files
│   ├── def456...ghi.json
│   └── ...
└── archives/
    ├── immutable-2026-02-09.log.gz  # Rotated archives
    ├── immutable-2026-02-08.log.gz
    └── ...
```

### Block File Format

```json
{
  "index": 42,
  "timestamp": "2026-02-09T14:30:00Z",
  "data": "{...log entry...}",
  "hash": "abc123def456...",
  "previousHash": "def456ghi789..."
}
```

### Metadata

Each block uploaded to S3/GCS includes metadata:

- `block-index`: Block sequence number
- `block-hash`: SHA-256 hash
- `timestamp`: ISO 8601 timestamp

---

## Performance

### Async Batch Upload (Default)

- **Latency**: <1ms (non-blocking)
- **Throughput**: 10,000 logs/second
- **Upload Frequency**: Every 100 blocks

### Synchronous Upload

- **Latency**: ~50ms per log (S3 API latency)
- **Throughput**: ~20 logs/second
- **Use Case**: Critical audit logs

### Recommendations

| Workload | Config |
|----------|--------|
| High volume (>1K logs/min) | `backup_async=True`, `batch_size=100` |
| Critical audit logs | `backup_async=False` |
| Low volume (<100 logs/min) | `backup_async=True`, `batch_size=10` |

---

## Cost Estimation

### AWS S3 Pricing (us-east-1)

**Assumptions**:
- 1M logs/month
- 500 bytes/log average
- 500 MB total storage

**Costs**:
- Storage: $0.012/month (500 MB × $0.023/GB)
- PUT requests: $5.00/month (1M × $0.005/1K)
- GET requests: $0.40/month (1K × $0.0004/1K)
- **Total: ~$5.50/month**

### Google Cloud Storage Pricing

**Same assumptions**:

**Costs**:
- Storage: $0.01/month (500 MB × $0.020/GB)
- Class A operations: $5.00/month (1M × $0.05/10K)
- Class B operations: $0.04/month (1K × $0.004/10K)
- **Total: ~$5.05/month**

---

## Security

### Encryption at Rest

- **S3**: AES-256 server-side encryption (SSE-S3)
- **GCS**: Google-managed encryption keys

### Encryption in Transit

- All uploads use HTTPS/TLS 1.2+

### Access Control

#### S3 Bucket Policy Example

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::123456789012:role/ImmutableLoggerRole"
      },
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::my-logs-bucket/*",
        "arn:aws:s3:::my-logs-bucket"
      ]
    }
  ]
}
```

#### GCS IAM Permissions

```bash
gcloud projects add-iam-policy-binding my-project \
  --member="serviceAccount:logger@my-project.iam.gserviceaccount.com" \
  --role="roles/storage.objectCreator"
```

---

## Monitoring

### CloudWatch Metrics (S3)

```python
import boto3

cloudwatch = boto3.client('cloudwatch')

# Track backup success rate
cloudwatch.put_metric_data(
    Namespace='ImmutableLogger',
    MetricData=[
        {
            'MetricName': 'BackupSuccessRate',
            'Value': success_count / total_count * 100,
            'Unit': 'Percent'
        }
    ]
)
```

### Stackdriver Monitoring (GCS)

```python
from google.cloud import monitoring_v3

client = monitoring_v3.MetricServiceClient()

# Track upload latency
series = monitoring_v3.TimeSeries()
series.metric.type = 'custom.googleapis.com/immutable_logger/upload_latency'
```

---

## Troubleshooting

### Issue: "Cloud backup initialization failed"

**Cause**: Missing credentials or invalid bucket name

**Solution**:
```bash
# For S3
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."

# For GCS
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/key.json"
```

### Issue: "Backup queue not flushing"

**Cause**: Process terminated before `shutdown()` called

**Solution**:
```python
import atexit

logger = ImmutableLogger('./logs', enable_cloud_backup=True)
atexit.register(logger.shutdown)  # Auto-flush on exit
```

### Issue: "High S3 costs"

**Cause**: Too many small uploads

**Solution**:
```python
# Increase batch size to reduce PUT requests
logger = ImmutableLogger(
    './logs',
    enable_cloud_backup=True,
    backup_batch_size=500  # Upload every 500 blocks
)
```

---

## Best Practices

### 1. Use Lifecycle Policies

**S3 Lifecycle Rule**:
```json
{
  "Rules": [
    {
      "Id": "ArchiveOldLogs",
      "Filter": {"Prefix": "blocks/"},
      "Status": "Enabled",
      "Transitions": [
        {
          "Days": 90,
          "StorageClass": "GLACIER"
        }
      ]
    }
  ]
}
```

### 2. Enable Versioning

```bash
# S3
aws s3api put-bucket-versioning \
  --bucket my-logs-bucket \
  --versioning-configuration Status=Enabled

# GCS
gsutil versioning set on gs://my-logs-bucket
```

### 3. Monitor Sync Status

```python
# Run hourly via cron
status = logger.verify_cloud_backup()
if status['sync_percentage'] < 99:
    send_alert(f"Cloud sync at {status['sync_percentage']}%")
```

### 4. Test Disaster Recovery

```python
# Monthly DR drill
def test_disaster_recovery():
    temp_logger = ImmutableLogger(
        './test-restore',
        enable_cloud_backup=True,
        s3_bucket='production-logs'
    )
    
    restored = temp_logger.restore_from_cloud()
    assert len(restored) > 0, "Restore failed!"
    print(f"✅ DR test passed: {len(restored)} blocks restored")
```

---

## Production Deployment

### Docker Compose

```yaml
version: '3.8'
services:
  app:
    image: myapp:latest
    environment:
      - ENABLE_CLOUD_BACKUP=true
      - BACKUP_PROVIDER=s3
      - S3_BUCKET=prod-logs
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
    volumes:
      - ./logs:/app/logs
```

### Kubernetes ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: logger-config
data:
  ENABLE_CLOUD_BACKUP: "true"
  BACKUP_PROVIDER: "s3"
  S3_BUCKET: "k8s-cluster-logs"
  S3_REGION: "us-west-2"
  BACKUP_BATCH_SIZE: "200"
```

---

## Support

For issues or questions:
- GitHub Issues: https://github.com/Garrettc123/tree-of-life-system/issues
- Documentation: https://github.com/Garrettc123/tree-of-life-system/docs

---

**Built with ❤️ by Garrett Carroll**  
**Part of the Tree of Life System**
