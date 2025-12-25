"""JWT Token Management - Access & Refresh Tokens with Rotation"""
import os
import jwt
from datetime import datetime, timedelta
from typing import Dict, Optional
from uuid import uuid4
import redis
import json

class JWTManager:
    """Manages JWT token generation, validation, and rotation"""
    
    def __init__(self):
        self.secret_key = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-this")
        self.algorithm = "HS256"
        self.access_token_expire = 15  # minutes
        self.refresh_token_expire = 30  # days
        
        # Redis for token blacklist and session management
        self.redis_client = redis.Redis(
            host=os.getenv("REDIS_HOST", "localhost"),
            port=int(os.getenv("REDIS_PORT", 6379)),
            db=0,
            decode_responses=True
        )
    
    def create_access_token(self, user_id: str, email: str, additional_claims: Optional[Dict] = None) -> str:
        """Create short-lived access token (15 min)"""
        expire = datetime.utcnow() + timedelta(minutes=self.access_token_expire)
        
        payload = {
            "user_id": user_id,
            "email": email,
            "type": "access",
            "exp": expire,
            "iat": datetime.utcnow(),
            "jti": str(uuid4())  # Unique token ID
        }
        
        if additional_claims:
            payload.update(additional_claims)
        
        token = jwt.encode(payload, self.secret_key, algorithm=self.algorithm)
        return token
    
    def create_refresh_token(self, user_id: str, email: str) -> str:
        """Create long-lived refresh token (30 days)"""
        expire = datetime.utcnow() + timedelta(days=self.refresh_token_expire)
        
        payload = {
            "user_id": user_id,
            "email": email,
            "type": "refresh",
            "exp": expire,
            "iat": datetime.utcnow(),
            "jti": str(uuid4())
        }
        
        token = jwt.encode(payload, self.secret_key, algorithm=self.algorithm)
        
        # Store refresh token in Redis for tracking
        self.redis_client.setex(
            f"refresh_token:{payload['jti']}",
            timedelta(days=self.refresh_token_expire),
            json.dumps({"user_id": user_id, "email": email})
        )
        
        return token
    
    def verify_token(self, token: str) -> Dict:
        """Verify and decode JWT token"""
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
            
            # Check if token is blacklisted
            if self.is_token_blacklisted(payload["jti"]):
                raise jwt.InvalidTokenError("Token has been revoked")
            
            return payload
        
        except jwt.ExpiredSignatureError:
            raise jwt.InvalidTokenError("Token has expired")
        except jwt.InvalidTokenError as e:
            raise jwt.InvalidTokenError(f"Invalid token: {str(e)}")
    
    def refresh_access_token(self, refresh_token: str) -> Dict[str, str]:
        """Generate new access token from refresh token"""
        try:
            payload = self.verify_token(refresh_token)
            
            if payload["type"] != "refresh":
                raise jwt.InvalidTokenError("Not a refresh token")
            
            # Check if refresh token exists in Redis
            token_data = self.redis_client.get(f"refresh_token:{payload['jti']}")
            if not token_data:
                raise jwt.InvalidTokenError("Refresh token not found or expired")
            
            # Create new access token
            new_access_token = self.create_access_token(
                user_id=payload["user_id"],
                email=payload["email"]
            )
            
            return {
                "access_token": new_access_token,
                "token_type": "bearer"
            }
        
        except Exception as e:
            raise jwt.InvalidTokenError(f"Token refresh failed: {str(e)}")
    
    def revoke_token(self, token: str) -> bool:
        """Add token to blacklist (revoke)"""
        try:
            payload = self.verify_token(token)
            jti = payload["jti"]
            exp = payload["exp"]
            
            # Calculate TTL (time until expiration)
            ttl = exp - datetime.utcnow().timestamp()
            
            if ttl > 0:
                self.redis_client.setex(
                    f"blacklist:{jti}",
                    int(ttl),
                    "revoked"
                )
            
            # Also remove refresh token if exists
            self.redis_client.delete(f"refresh_token:{jti}")
            
            return True
        
        except Exception:
            return False
    
    def is_token_blacklisted(self, jti: str) -> bool:
        """Check if token is blacklisted"""
        return self.redis_client.exists(f"blacklist:{jti}") > 0
    
    def create_token_pair(self, user_id: str, email: str) -> Dict[str, str]:
        """Create both access and refresh tokens"""
        access_token = self.create_access_token(user_id, email)
        refresh_token = self.create_refresh_token(user_id, email)
        
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": self.access_token_expire * 60  # seconds
        }
    
    def revoke_all_user_tokens(self, user_id: str) -> int:
        """Revoke all refresh tokens for a user (logout from all devices)"""
        pattern = f"refresh_token:*"
        revoked_count = 0
        
        for key in self.redis_client.scan_iter(match=pattern):
            token_data = self.redis_client.get(key)
            if token_data:
                data = json.loads(token_data)
                if data.get("user_id") == user_id:
                    self.redis_client.delete(key)
                    revoked_count += 1
        
        return revoked_count

# Global instance
jwt_manager = JWTManager()
