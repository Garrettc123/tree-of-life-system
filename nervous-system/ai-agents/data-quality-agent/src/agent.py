#!/usr/bin/env python3
"""
Data Quality AI Agent
Verifies contribution quality using NLP and machine learning
"""

import os
import json
import redis
import requests
from typing import Dict, List
import numpy as np
from transformers import AutoTokenizer, AutoModel
import torch
from sklearn.metrics.pairwise import cosine_similarity
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DataQualityAgent:
    def __init__(self):
        self.redis_client = redis.Redis(
            host=os.getenv('REDIS_HOST', 'localhost'),
            port=int(os.getenv('REDIS_PORT', 6379)),
            decode_responses=True
        )
        
        # Load pre-trained model for semantic analysis
        logger.info("Loading language model...")
        self.tokenizer = AutoTokenizer.from_pretrained('sentence-transformers/all-MiniLM-L6-v2')
        self.model = AutoModel.from_pretrained('sentence-transformers/all-MiniLM-L6-v2')
        
        # Quality thresholds
        self.min_word_count = 100
        self.min_coherence_score = 0.6
        self.plagiarism_threshold = 0.85
        
        logger.info("Data Quality Agent initialized")
    
    def run(self):
        """Main loop - listen for new contributions"""
        logger.info("Starting to listen for contributions...")
        
        pubsub = self.redis_client.pubsub()
        pubsub.subscribe('contributions:new')
        
        for message in pubsub.listen():
            if message['type'] == 'message':
                try:
                    data = json.loads(message['data'])
                    self.process_contribution(data)
                except Exception as e:
                    logger.error(f"Error processing message: {e}")
    
    def process_contribution(self, data: Dict):
        """Process a single contribution"""
        contribution_id = data['contributionId']
        ipfs_hash = data['ipfsHash']
        
        logger.info(f"Processing contribution {contribution_id}")
        
        # Fetch content from IPFS
        content = self.fetch_from_ipfs(ipfs_hash)
        if not content:
            logger.error(f"Failed to fetch content for {contribution_id}")
            return
        
        # Run quality checks
        results = {
            'contribution_id': contribution_id,
            'quality_score': self.calculate_quality_score(content),
            'plagiarism_detected': self.check_plagiarism(content),
            'format_valid': self.validate_format(content),
            'coherence_score': self.check_coherence(content),
            'word_count': len(content.get('content', '').split()),
            'suggestions': self.generate_suggestions(content),
        }
        
        logger.info(f"Quality analysis complete: {results['quality_score']:.2f}")
        
        # Store results in Redis
        self.redis_client.setex(
            f"ai:verification:{contribution_id}",
            3600,  # 1 hour expiry
            json.dumps(results)
        )
        
        # Publish completion event
        self.redis_client.publish(
            'ai:verification:completed',
            json.dumps({'contributionId': contribution_id})
        )
    
    def fetch_from_ipfs(self, ipfs_hash: str) -> Dict:
        """Fetch content from IPFS gateway"""
        try:
            gateway = os.getenv('IPFS_GATEWAY', 'http://localhost:8080')
            clean_hash = ipfs_hash.replace('ipfs://', '')
            url = f"{gateway}/ipfs/{clean_hash}"
            
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Error fetching from IPFS: {e}")
            return None
    
    def calculate_quality_score(self, content: Dict) -> float:
        """Calculate overall quality score (0-1)"""
        text = content.get('content', '')
        
        scores = []
        
        # Length check
        word_count = len(text.split())
        length_score = min(word_count / 500, 1.0)  # Ideal: 500+ words
        scores.append(length_score * 0.2)
        
        # Structure check
        has_title = bool(content.get('title'))
        has_description = bool(content.get('description'))
        structure_score = (has_title + has_description) / 2
        scores.append(structure_score * 0.1)
        
        # Content richness
        unique_words = len(set(text.lower().split()))
        richness_score = min(unique_words / 200, 1.0)
        scores.append(richness_score * 0.3)
        
        # Coherence
        coherence = self.check_coherence(content)
        scores.append(coherence * 0.4)
        
        return sum(scores)
    
    def check_coherence(self, content: Dict) -> float:
        """Check text coherence using sentence embeddings"""
        text = content.get('content', '')
        sentences = [s.strip() for s in text.split('.') if len(s.strip()) > 10]
        
        if len(sentences) < 2:
            return 0.5
        
        # Get embeddings
        embeddings = []
        for sentence in sentences[:10]:  # Limit to first 10 sentences
            inputs = self.tokenizer(sentence, return_tensors='pt', truncation=True, max_length=128)
            with torch.no_grad():
                outputs = self.model(**inputs)
                embedding = outputs.last_hidden_state.mean(dim=1).numpy()
                embeddings.append(embedding)
        
        # Calculate coherence as average cosine similarity between consecutive sentences
        if len(embeddings) < 2:
            return 0.5
        
        similarities = []
        for i in range(len(embeddings) - 1):
            sim = cosine_similarity(embeddings[i], embeddings[i + 1])[0][0]
            similarities.append(sim)
        
        return np.mean(similarities)
    
    def check_plagiarism(self, content: Dict) -> bool:
        """Check for plagiarism (simplified - would use external API in production)"""
        # In production, integrate with Turnitin, Copyscape, or similar
        # For now, just check against known patterns
        text = content.get('content', '').lower()
        
        # Simple heuristic: check for copy-paste indicators
        suspicious_phrases = [
            'lorem ipsum',
            'copy and paste',
            'source: wikipedia',
        ]
        
        return any(phrase in text for phrase in suspicious_phrases)
    
    def validate_format(self, content: Dict) -> bool:
        """Validate content format"""
        required_fields = ['title', 'content']
        
        for field in required_fields:
            if not content.get(field):
                return False
        
        # Check minimum content length
        if len(content.get('content', '').split()) < self.min_word_count:
            return False
        
        return True
    
    def generate_suggestions(self, content: Dict) -> List[str]:
        """Generate improvement suggestions"""
        suggestions = []
        
        text = content.get('content', '')
        word_count = len(text.split())
        
        if word_count < 200:
            suggestions.append("Consider adding more details (minimum 200 words recommended)")
        
        if not content.get('description'):
            suggestions.append("Add a description to provide context")
        
        if not content.get('metadata'):
            suggestions.append("Include metadata like references or sources")
        
        coherence = self.check_coherence(content)
        if coherence < self.min_coherence_score:
            suggestions.append("Improve logical flow between sentences")
        
        return suggestions


if __name__ == '__main__':
    agent = DataQualityAgent()
    agent.run()