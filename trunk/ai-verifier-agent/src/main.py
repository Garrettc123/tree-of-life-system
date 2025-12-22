"""Main entry point for AI Verifier Agent"""
import asyncio
import logging
import sys
from .agent import VerifierAgent
from .config import settings

logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def main():
    """Main entry point"""
    agent = VerifierAgent()
    
    try:
        await agent.start()
    except KeyboardInterrupt:
        logger.info("\n⏸️  Shutting down gracefully...")
        await agent.stop()
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())