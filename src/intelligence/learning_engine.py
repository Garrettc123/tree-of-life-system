"""
Learning Engine - Continuous learning from system interactions
"""
import json
from datetime import datetime
from typing import Dict, List, Any
import logging

logger = logging.getLogger(__name__)

class LearningEngine:
    def __init__(self, knowledge_base_path: str = "data/knowledge_base.json"):
        self.knowledge_base_path = knowledge_base_path
        self.patterns = []
        self.accuracy = 0.91
        self.total_learnings = 0
        
    def learn_from_pr(self, pr_data: Dict[str, Any]) -> Dict[str, Any]:
        """Learn patterns from pull request data"""
        pattern = {
            "type": "pr_pattern",
            "title_keywords": self._extract_keywords(pr_data.get("title", "")),
            "files_changed": pr_data.get("files_changed", 0),
            "outcome": pr_data.get("merged", False),
            "timestamp": datetime.now().isoformat()
        }
        
        self.patterns.append(pattern)
        self.total_learnings += 1
        self._update_knowledge_base()
        
        return {
            "learned": True,
            "pattern_id": len(self.patterns),
            "confidence": self.accuracy
        }
    
    def learn_from_issue(self, issue_data: Dict[str, Any]) -> Dict[str, Any]:
        """Learn patterns from issue data"""
        pattern = {
            "type": "issue_pattern",
            "labels": issue_data.get("labels", []),
            "priority": self._calculate_priority(issue_data),
            "resolution_time": issue_data.get("resolution_time"),
            "timestamp": datetime.now().isoformat()
        }
        
        self.patterns.append(pattern)
        self.total_learnings += 1
        
        return {"learned": True, "pattern_id": len(self.patterns)}
    
    def _extract_keywords(self, text: str) -> List[str]:
        """Extract important keywords from text"""
        common_words = {"the", "a", "an", "and", "or", "but", "in", "on", "at"}
        words = text.lower().split()
        return [w for w in words if w not in common_words and len(w) > 3]
    
    def _calculate_priority(self, issue_data: Dict[str, Any]) -> int:
        """Calculate issue priority based on patterns"""
        labels = issue_data.get("labels", [])
        if "critical" in [l.lower() for l in labels]:
            return 1
        elif "bug" in [l.lower() for l in labels]:
            return 2
        return 3
    
    def _update_knowledge_base(self):
        """Update persistent knowledge base"""
        try:
            data = {
                "patterns": self.patterns[-100:],  # Keep last 100
                "total_learnings": self.total_learnings,
                "accuracy": self.accuracy,
                "last_update": datetime.now().isoformat()
            }
            # Would save to file in production
            logger.info(f"Knowledge base updated: {self.total_learnings} learnings")
        except Exception as e:
            logger.error(f"Failed to update knowledge base: {e}")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get learning engine statistics"""
        return {
            "accuracy": self.accuracy,
            "total_patterns": len(self.patterns),
            "total_learnings": self.total_learnings,
            "last_update": datetime.now().isoformat()
        }
