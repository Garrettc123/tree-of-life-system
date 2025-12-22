"""Storage client for fetching contribution content from IPFS"""
import aiohttp
import logging
from typing import Dict, Any
from ..config import settings

logger = logging.getLogger(__name__)


class StorageClient:
    """Client for fetching content from distributed storage"""
    
    def __init__(self):
        self.ipfs_gateway = settings.ipfs_gateway
        self.session = None
    
    async def _ensure_session(self):
        if self.session is None:
            self.session = aiohttp.ClientSession()
    
    async def fetch_content(self, data_hash: str) -> str:
        """Fetch contribution content from storage"""
        try:
            await self._ensure_session()
            
            if data_hash.startswith('Qm') or data_hash.startswith('bafy'):
                return await self._fetch_from_ipfs(data_hash)
            elif data_hash.startswith('http'):
                return await self._fetch_from_url(data_hash)
            else:
                return await self._fetch_from_ipfs(data_hash)
        except Exception as e:
            logger.error(f"Error fetching content: {e}")
            raise
    
    async def _fetch_from_ipfs(self, ipfs_hash: str) -> str:
        """Fetch content from IPFS"""
        try:
            url = f"{self.ipfs_gateway}/api/v0/cat?arg={ipfs_hash}"
            async with self.session.post(url) as response:
                if response.status == 200:
                    return await response.text()
                else:
                    return await self._fetch_from_public_gateway(ipfs_hash)
        except Exception as e:
            logger.warning(f"Local IPFS failed, trying public gateway: {e}")
            return await self._fetch_from_public_gateway(ipfs_hash)
    
    async def _fetch_from_public_gateway(self, ipfs_hash: str) -> str:
        """Fetch from public IPFS gateway"""
        gateways = [
            f"https://ipfs.io/ipfs/{ipfs_hash}",
            f"https://cloudflare-ipfs.com/ipfs/{ipfs_hash}",
        ]
        
        for gateway_url in gateways:
            try:
                async with self.session.get(gateway_url, timeout=30) as response:
                    if response.status == 200:
                        return await response.text()
            except Exception:
                continue
        
        raise Exception(f"Failed to fetch from all gateways: {ipfs_hash}")
    
    async def _fetch_from_url(self, url: str) -> str:
        """Fetch content from HTTP URL"""
        async with self.session.get(url, timeout=30) as response:
            if response.status == 200:
                return await response.text()
            raise Exception(f"HTTP {response.status} from {url}")
    
    async def close(self):
        """Close aiohttp session"""
        if self.session:
            await self.session.close()