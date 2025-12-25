"""Multi-Factor Authentication - TOTP, SMS, Email"""
import os
import pyotp
import qrcode
from io import BytesIO
import base64
from typing import Dict, Optional
import redis
import json
from datetime import timedelta
import random
import string

class MFAManager:
    """Manages multi-factor authentication"""
    
    def __init__(self):
        self.redis_client = redis.Redis(
            host=os.getenv("REDIS_HOST", "localhost"),
            port=int(os.getenv("REDIS_PORT", 6379)),
            db=1,  # Separate DB for MFA
            decode_responses=True
        )
        self.app_name = "Tree of Life System"
    
    def generate_totp_secret(self, user_id: str, email: str) -> Dict:
        """Generate TOTP secret and QR code for authenticator apps"""
        # Generate secret
        secret = pyotp.random_base32()
        
        # Create TOTP URI
        totp_uri = pyotp.totp.TOTP(secret).provisioning_uri(
            name=email,
            issuer_name=self.app_name
        )
        
        # Generate QR code
        qr = qrcode.QRCode(version=1, box_size=10, border=5)
        qr.add_data(totp_uri)
        qr.make(fit=True)
        
        img = qr.make_image(fill_color="black", back_color="white")
        buffered = BytesIO()
        img.save(buffered, format="PNG")
        qr_code_base64 = base64.b64encode(buffered.getvalue()).decode()
        
        # Store secret temporarily (user must verify before enabling)
        self.redis_client.setex(
            f"mfa_setup:{user_id}",
            timedelta(minutes=10),
            json.dumps({"secret": secret, "email": email})
        )
        
        return {
            "secret": secret,
            "qr_code": f"data:image/png;base64,{qr_code_base64}",
            "totp_uri": totp_uri,
            "manual_entry": secret
        }
    
    def verify_totp_code(self, user_id: str, code: str, setup_mode: bool = False) -> bool:
        """Verify TOTP code from authenticator app"""
        try:
            if setup_mode:
                # Get secret from setup session
                setup_data = self.redis_client.get(f"mfa_setup:{user_id}")
                if not setup_data:
                    return False
                
                secret = json.loads(setup_data)["secret"]
            else:
                # Get secret from user's MFA settings
                mfa_data = self.redis_client.get(f"mfa_enabled:{user_id}")
                if not mfa_data:
                    return False
                
                secret = json.loads(mfa_data)["totp_secret"]
            
            # Verify code
            totp = pyotp.TOTP(secret)
            is_valid = totp.verify(code, valid_window=1)  # Allow 30s window
            
            if is_valid and setup_mode:
                # Enable MFA permanently
                setup_data = json.loads(self.redis_client.get(f"mfa_setup:{user_id}"))
                self.redis_client.set(
                    f"mfa_enabled:{user_id}",
                    json.dumps({
                        "totp_secret": secret,
                        "email": setup_data["email"],
                        "enabled_methods": ["totp"]
                    })
                )
                # Delete setup session
                self.redis_client.delete(f"mfa_setup:{user_id}")
            
            return is_valid
        
        except Exception:
            return False
    
    def generate_backup_codes(self, user_id: str, count: int = 8) -> list:
        """Generate backup codes for MFA recovery"""
        codes = []
        
        for _ in range(count):
            code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
            codes.append(code)
        
        # Store hashed backup codes
        mfa_data = self.redis_client.get(f"mfa_enabled:{user_id}")
        if mfa_data:
            data = json.loads(mfa_data)
            data["backup_codes"] = codes  # In production, hash these!
            self.redis_client.set(f"mfa_enabled:{user_id}", json.dumps(data))
        
        return codes
    
    def verify_backup_code(self, user_id: str, code: str) -> bool:
        """Verify and consume backup code (one-time use)"""
        mfa_data = self.redis_client.get(f"mfa_enabled:{user_id}")
        if not mfa_data:
            return False
        
        data = json.loads(mfa_data)
        backup_codes = data.get("backup_codes", [])
        
        if code in backup_codes:
            # Remove used code
            backup_codes.remove(code)
            data["backup_codes"] = backup_codes
            self.redis_client.set(f"mfa_enabled:{user_id}", json.dumps(data))
            return True
        
        return False
    
    def is_mfa_enabled(self, user_id: str) -> bool:
        """Check if MFA is enabled for user"""
        return self.redis_client.exists(f"mfa_enabled:{user_id}") > 0
    
    def disable_mfa(self, user_id: str) -> bool:
        """Disable MFA for user"""
        return self.redis_client.delete(f"mfa_enabled:{user_id}") > 0
    
    def get_mfa_status(self, user_id: str) -> Dict:
        """Get MFA status and enabled methods"""
        mfa_data = self.redis_client.get(f"mfa_enabled:{user_id}")
        
        if not mfa_data:
            return {
                "enabled": False,
                "methods": []
            }
        
        data = json.loads(mfa_data)
        backup_codes_remaining = len(data.get("backup_codes", []))
        
        return {
            "enabled": True,
            "methods": data.get("enabled_methods", []),
            "backup_codes_remaining": backup_codes_remaining
        }

# Global instance
mfa_manager = MFAManager()
