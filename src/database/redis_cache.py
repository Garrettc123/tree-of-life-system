"""Redis Caching Layer - High-Performance Data Caching"""
import os
import redis
import json
from typing import Any, Optional, List
from datetime import timedelta
import hashlib

class RedisCache:
    """Centralized Redis caching with intelligent TTL management"""
    
    def __init__(self):
        self.redis_client = redis.Redis(
            host=os.getenv("REDIS_HOST", "localhost"),
            port=int(os.getenv("REDIS_PORT", 6379)),
            db=2,  # DB 2 for caching (0=JWT, 1=MFA, 2=Cache)
            decode_responses=True
        )
        
        # Default TTLs by cache type
        self.ttls = {
            "user": timedelta(hours=1),
            "api_response": timedelta(minutes=5),
            "session": timedelta(days=30),
            "rate_limit": timedelta(hours=1),
            "metrics": timedelta(seconds=30),
            "long_term": timedelta(days=7)
        }
    
    def _make_key(self, namespace: str, key: str) -> str:
        """Create namespaced key"""
        return f"{namespace}:{key}"
    
    def get(self, namespace: str, key: str) -> Optional[Any]:
        """Get cached value"""
        try:
            full_key = self._make_key(namespace, key)
            value = self.redis_client.get(full_key)
            
            if value is None:
                return None
            
            # Try to parse as JSON, fallback to string
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return value
        
        except Exception as e:
            print(f"Cache get error: {e}")
            return None
    
    def set(self, namespace: str, key: str, value: Any, ttl: Optional[timedelta] = None) -> bool:
        """Set cached value with TTL"""
        try:
            full_key = self._make_key(namespace, key)
            
            # Serialize complex objects to JSON
            if isinstance(value, (dict, list)):
                value = json.dumps(value)
            elif not isinstance(value, str):
                value = str(value)
            
            # Use default TTL for namespace if not specified
            if ttl is None:
                ttl = self.ttls.get(namespace, timedelta(minutes=5))
            
            return self.redis_client.setex(full_key, ttl, value)
        
        except Exception as e:
            print(f"Cache set error: {e}")
            return False
    
    def delete(self, namespace: str, key: str) -> bool:
        """Delete cached value"""
        try:
            full_key = self._make_key(namespace, key)
            return self.redis_client.delete(full_key) > 0
        
        except Exception as e:
            print(f"Cache delete error: {e}")
            return False
    
    def exists(self, namespace: str, key: str) -> bool:
        """Check if key exists"""
        full_key = self._make_key(namespace, key)
        return self.redis_client.exists(full_key) > 0
    
    def increment(self, namespace: str, key: str, amount: int = 1) -> int:
        """Increment counter (for rate limiting)"""
        full_key = self._make_key(namespace, key)
        return self.redis_client.incrby(full_key, amount)
    
    def expire(self, namespace: str, key: str, ttl: timedelta) -> bool:
        """Set/update TTL on existing key"""
        full_key = self._make_key(namespace, key)
        return self.redis_client.expire(full_key, ttl)
    
    def get_many(self, namespace: str, keys: List[str]) -> dict:
        """Get multiple keys at once"""
        full_keys = [self._make_key(namespace, k) for k in keys]
        values = self.redis_client.mget(full_keys)
        
        result = {}
        for key, value in zip(keys, values):
            if value is not None:
                try:
                    result[key] = json.loads(value)
                except json.JSONDecodeError:
                    result[key] = value
        
        return result
    
    def set_many(self, namespace: str, mapping: dict, ttl: Optional[timedelta] = None) -> bool:
        """Set multiple keys at once"""
        pipeline = self.redis_client.pipeline()
        
        if ttl is None:
            ttl = self.ttls.get(namespace, timedelta(minutes=5))
        
        for key, value in mapping.items():
            full_key = self._make_key(namespace, key)
            
            if isinstance(value, (dict, list)):
                value = json.dumps(value)
            elif not isinstance(value, str):
                value = str(value)
            
            pipeline.setex(full_key, ttl, value)
        
        pipeline.execute()
        return True
    
    def clear_namespace(self, namespace: str) -> int:
        """Clear all keys in a namespace"""
        pattern = f"{namespace}:*"
        deleted = 0
        
        for key in self.redis_client.scan_iter(match=pattern):
            self.redis_client.delete(key)
            deleted += 1
        
        return deleted
    
    def get_stats(self) -> dict:
        """Get cache statistics"""
        info = self.redis_client.info()
        
        return {
            "used_memory": info.get("used_memory_human"),
            "total_keys": self.redis_client.dbsize(),
            "hit_rate": self._calculate_hit_rate(info),
            "connected_clients": info.get("connected_clients"),
            "uptime_days": info.get("uptime_in_days")
        }
    
    def _calculate_hit_rate(self, info: dict) -> float:
        """Calculate cache hit rate"""
        hits = info.get("keyspace_hits", 0)
        misses = info.get("keyspace_misses", 0)
        
        total = hits + misses
        if total == 0:
            return 0.0
        
        return (hits / total) * 100
    
    # Specialized caching methods
    
    def cache_user(self, user_id: str, user_data: dict) -> bool:
        """Cache user data for 1 hour"""
        return self.set("user", user_id, user_data, self.ttls["user"])
    
    def get_cached_user(self, user_id: str) -> Optional[dict]:
        """Get cached user data"""
        return self.get("user", user_id)
    
    def cache_api_response(self, endpoint: str, params: dict, response: Any) -> bool:
        """Cache API response for 5 minutes"""
        # Create cache key from endpoint + params
        cache_key = f"{endpoint}:{hashlib.md5(json.dumps(params, sort_keys=True).encode()).hexdigest()}"
        return self.set("api_response", cache_key, response, self.ttls["api_response"])
    
    def get_cached_api_response(self, endpoint: str, params: dict) -> Optional[Any]:
        """Get cached API response"""
        cache_key = f"{endpoint}:{hashlib.md5(json.dumps(params, sort_keys=True).encode()).hexdigest()}"
        return self.get("api_response", cache_key)
    
    def check_rate_limit(self, user_id: str, limit: int = 1000) -> tuple[bool, int]:
        """Check rate limit (requests per hour)"""
        key = f"rate_limit:{user_id}"
        current = self.redis_client.get(key)
        
        if current is None:
            self.redis_client.setex(key, self.ttls["rate_limit"], 1)
            return True, limit - 1
        
        current = int(current)
        
        if current >= limit:
            return False, 0
        
        self.redis_client.incr(key)
        return True, limit - (current + 1)

# Global cache instance
cache = RedisCache()
