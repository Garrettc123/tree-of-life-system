"""AI-powered verification using Claude"""
from anthropic import Anthropic
import logging
from typing import Dict, Any
from ..config import settings

logger = logging.getLogger(__name__)


class AIVerifier:
    """Claude AI verification service"""
    
    def __init__(self):
        self.client = Anthropic(api_key=settings.anthropic_api_key)
        self.model = settings.model_name
    
    async def verify_content(self, content: str, category: str, metadata: Dict = None) -> Dict[str, Any]:
        """Verify content quality using Claude AI"""
        try:
            prompt = self._build_verification_prompt(content, category, metadata or {})
            
            response = self.client.messages.create(
                model=self.model,
                max_tokens=settings.max_tokens,
                temperature=settings.temperature,
                messages=[{
                    "role": "user",
                    "content": prompt
                }]
            )
            
            result = self._parse_verification_response(response.content[0].text)
            logger.info(f"✓ Verification complete: Score={result['quality_score']}")
            return result
            
        except Exception as e:
            logger.error(f"AI verification error: {e}")
            raise
    
    def _build_verification_prompt(self, content: str, category: str, metadata: Dict) -> str:
        """Build verification prompt based on category"""
        base_prompt = f"""You are an expert verifier for the NWU Protocol.

Verify the following {category} contribution:

CONTENT:
{content[:4000]}

METADATA:
{metadata}

Provide your assessment in this format:

QUALITY_SCORE: [0-100]
REASONING: [Your detailed reasoning]
CATEGORY_SPECIFIC_NOTES: [Specific observations for {category}]
RECOMMENDATION: [APPROVE/REJECT/REVISE]
"""
        return base_prompt
    
    def _parse_verification_response(self, response_text: str) -> Dict[str, Any]:
        """Parse Claude's verification response"""
        lines = response_text.strip().split('\n')
        result = {
            'quality_score': 0,
            'reasoning': '',
            'notes': '',
            'recommendation': 'REJECT'
        }
        
        for line in lines:
            if line.startswith('QUALITY_SCORE:'):
                try:
                    result['quality_score'] = int(line.split(':')[1].strip())
                except:
                    result['quality_score'] = 50
            elif line.startswith('REASONING:'):
                result['reasoning'] = line.split(':', 1)[1].strip()
            elif line.startswith('RECOMMENDATION:'):
                result['recommendation'] = line.split(':')[1].strip()
        
        return result