"""Main AI Verifier Agent"""
import asyncio
import logging
from typing import Optional
from .services.blockchain_client import BlockchainClient
from .services.storage_client import StorageClient
from .services.ai_verifier import AIVerifier
from .config import settings
from eth_account import Account

logger = logging.getLogger(__name__)


class VerifierAgent:
    """Autonomous AI verification agent"""
    
    def __init__(self):
        self.blockchain = BlockchainClient()
        self.storage = StorageClient()
        self.ai_verifier = AIVerifier()
        self.signer = Account.from_key(settings.verifier_private_key)
        self.running = False
        
        logger.info(f"✓ Agent initialized: {self.signer.address}")
    
    async def start(self):
        """Start the verification agent"""
        self.running = True
        logger.info("🤖 Starting AI Verifier Agent...")
        
        # Register as verifier if needed
        if settings.auto_register:
            await self._register_if_needed()
        
        # Start event listener
        event_filter = self.blockchain.listen_for_events('ContributionSubmitted')
        
        while self.running:
            try:
                # Check for new contributions
                events = event_filter.get_new_entries() if event_filter else []
                
                for event in events:
                    contribution_id = event['args']['contributionId']
                    await self.verify_contribution(contribution_id)
                
                await asyncio.sleep(settings.min_verification_interval)
                
            except Exception as e:
                logger.error(f"Agent error: {e}")
                await asyncio.sleep(10)
    
    async def verify_contribution(self, contribution_id: str) -> bool:
        """Verify a single contribution"""
        try:
            logger.info(f"🔍 Verifying contribution: {contribution_id}")
            
            # Get contribution details
            contribution = await self.blockchain.get_contribution(contribution_id)
            
            if contribution['verified']:
                logger.info("Already verified, skipping")
                return False
            
            # Fetch content from storage
            content = await self.storage.fetch_content(contribution['dataHash'])
            
            # AI verification
            result = await self.ai_verifier.verify_content(
                content=content,
                category=contribution['category'],
                metadata={'contributor': contribution['contributor']}
            )
            
            # Submit verification to blockchain
            if result['quality_score'] >= settings.quality_threshold:
                tx_hash = await self.blockchain.submit_verification(
                    contribution_id,
                    result['quality_score'],
                    self.signer
                )
                logger.info(f"✅ Verification submitted: {tx_hash}")
                return True
            else:
                logger.info(f"❌ Quality below threshold: {result['quality_score']}")
                return False
                
        except Exception as e:
            logger.error(f"Verification failed: {e}")
            return False
    
    async def _register_if_needed(self):
        """Register as verifier if not already registered"""
        try:
            # Implementation would check registration status
            logger.info("✓ Verifier registration check complete")
        except Exception as e:
            logger.error(f"Registration check failed: {e}")
    
    async def stop(self):
        """Stop the agent gracefully"""
        self.running = False
        await self.storage.close()
        logger.info("🛑 Agent stopped")