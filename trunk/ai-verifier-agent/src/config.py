"""Configuration management for AI Verifier Agent"""
from pydantic_settings import BaseSettings
from typing import List, Optional
import os


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # Blockchain Configuration
    ethereum_rpc_url: str
    protocol_contract_address: str
    verifier_private_key: str
    chain_id: int = 80001  # Polygon Mumbai testnet
    gas_limit: int = 200000
    max_gas_price_gwei: int = 100
    
    # AI Configuration
    anthropic_api_key: str
    model_name: str = "claude-3-5-sonnet-20241022"
    max_tokens: int = 4096
    temperature: float = 0.3
    
    # Storage Configuration
    ipfs_gateway: str = "http://localhost:5001"
    ipfs_public_gateway: str = "https://ipfs.io"
    
    # Agent Configuration
    min_verification_interval: int = 60  # seconds
    max_concurrent_verifications: int = 5
    quality_threshold: int = 70  # 0-100
    auto_register: bool = True
    verifier_name: str = "AI-Verifier-001"
    verifier_specializations: str = "text,code,data"
    
    # Database Configuration
    database_url: str = "sqlite+aiosqlite:///./verifier.db"
    
    # Monitoring Configuration
    metrics_port: int = 8080
    log_level: str = "INFO"
    enable_prometheus: bool = True
    
    # Security
    encrypt_private_key: bool = True
    keystore_password: Optional[str] = None
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False
    
    @property
    def specializations_list(self) -> List[str]:
        """Parse comma-separated specializations into list"""
        return [s.strip() for s in self.verifier_specializations.split(",")]
    
    def validate_config(self) -> None:
        """Validate critical configuration"""
        if not self.ethereum_rpc_url:
            raise ValueError("ETHEREUM_RPC_URL must be set")
        if not self.protocol_contract_address:
            raise ValueError("PROTOCOL_CONTRACT_ADDRESS must be set")
        if not self.verifier_private_key:
            raise ValueError("VERIFIER_PRIVATE_KEY must be set")
        if not self.anthropic_api_key:
            raise ValueError("ANTHROPIC_API_KEY must be set")
        if not 0 <= self.quality_threshold <= 100:
            raise ValueError("QUALITY_THRESHOLD must be between 0 and 100")


# Global settings instance
settings = Settings()

# Validate on import
settings.validate_config()