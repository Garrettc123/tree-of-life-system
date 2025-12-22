"""Blockchain client for interacting with NWU Protocol smart contracts"""
from web3 import Web3
from web3.middleware import geth_poa_middleware
from typing import Dict, Any, List
import json
import logging
from ..config import settings

logger = logging.getLogger(__name__)

# NWU Protocol Contract ABI
PROTOCOL_ABI = [
    {
        "inputs": [{"internalType": "string", "name": "contributionId", "type": "string"}],
        "name": "getContribution",
        "outputs": [
            {"internalType": "address", "name": "contributor", "type": "address"},
            {"internalType": "string", "name": "dataHash", "type": "string"},
            {"internalType": "string", "name": "category", "type": "string"},
            {"internalType": "uint256", "name": "timestamp", "type": "uint256"},
            {"internalType": "bool", "name": "verified", "type": "bool"}
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {"internalType": "string", "name": "contributionId", "type": "string"},
            {"internalType": "uint8", "name": "qualityScore", "type": "uint8"}
        ],
        "name": "verifyContribution",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{"internalType": "address", "name": "verifierAddress", "type": "address"}],
        "name": "verifiers",
        "outputs": [
            {"internalType": "uint256", "name": "reputation", "type": "uint256"},
            {"internalType": "bool", "name": "active", "type": "bool"},
            {"internalType": "uint256", "name": "verificationsCount", "type": "uint256"}
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "registerVerifier",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True, "internalType": "string", "name": "contributionId", "type": "string"},
            {"indexed": True, "internalType": "address", "name": "contributor", "type": "address"},
            {"indexed": False, "internalType": "string", "name": "category", "type": "string"}
        ],
        "name": "ContributionSubmitted",
        "type": "event"
    },
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True, "internalType": "string", "name": "contributionId", "type": "string"},
            {"indexed": True, "internalType": "address", "name": "verifier", "type": "address"},
            {"indexed": False, "internalType": "uint8", "name": "qualityScore", "type": "uint8"}
        ],
        "name": "VerificationSubmitted",
        "type": "event"
    }
]


class BlockchainClient:
    """Client for interacting with blockchain smart contracts"""
    
    def __init__(self):
        self.w3 = Web3(Web3.HTTPProvider(settings.ethereum_rpc_url))
        self.w3.middleware_onion.inject(geth_poa_middleware, layer=0)
        
        self.protocol_contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(settings.protocol_contract_address),
            abi=PROTOCOL_ABI
        )
        
        if not self.w3.is_connected():
            raise ConnectionError("Failed to connect to Ethereum node")
            
        logger.info(f"✓ Connected to blockchain: {settings.ethereum_rpc_url}")
        logger.info(f"✓ Protocol contract: {settings.protocol_contract_address}")
        logger.info(f"✓ Current block: {self.w3.eth.block_number}")
    
    async def get_contribution(self, contribution_id: str) -> Dict[str, Any]:
        """Fetch contribution details from blockchain"""
        try:
            result = self.protocol_contract.functions.getContribution(contribution_id).call()
            return {
                'id': contribution_id,
                'contributor': result[0],
                'dataHash': result[1],
                'category': result[2],
                'timestamp': result[3],
                'verified': result[4]
            }
        except Exception as e:
            logger.error(f"Error fetching contribution {contribution_id}: {e}")
            raise
    
    async def submit_verification(self, contribution_id: str, quality_score: int, signer) -> str:
        """Submit verification to blockchain"""
        try:
            if not 0 <= quality_score <= 100:
                raise ValueError("Quality score must be between 0 and 100")
            
            tx = self.protocol_contract.functions.verifyContribution(
                contribution_id, quality_score
            ).build_transaction({
                'from': signer.address,
                'nonce': self.w3.eth.get_transaction_count(signer.address),
                'gas': settings.gas_limit,
                'gasPrice': self.w3.eth.gas_price,
            })
            
            signed_tx = signer.sign_transaction(tx)
            tx_hash = self.w3.eth.send_raw_transaction(signed_tx.rawTransaction)
            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            
            if receipt['status'] == 1:
                logger.info(f"✓ Verification submitted: {tx_hash.hex()}")
                return tx_hash.hex()
            else:
                raise Exception("Transaction failed")
        except Exception as e:
            logger.error(f"Error submitting verification: {e}")
            raise
    
    def listen_for_events(self, event_name: str, from_block: int = 'latest'):
        """Create event filter for listening to contract events"""
        try:
            event = getattr(self.protocol_contract.events, event_name)
            return event.create_filter(fromBlock=from_block)
        except Exception as e:
            logger.error(f"Error creating event filter: {e}")
            return None