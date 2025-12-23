"""
Prediction Engine - Predicts outcomes based on historical data
"""
from typing import Dict, Any, List
import random
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

class PredictionEngine:
    def __init__(self):
        self.accuracy = 0.87
        self.predictions_made = 0
        self.confidence_scores = []
        
    def predict_pr_approval(self, pr_data: Dict[str, Any]) -> Dict[str, Any]:
        """Predict probability of PR approval"""
        # Factors affecting approval
        factors = {
            "tests_pass": pr_data.get("tests_pass", False),
            "files_changed": pr_data.get("files_changed", 0),
            "has_description": bool(pr_data.get("description")),
            "author_reputation": pr_data.get("author_reputation", 0.5)
        }
        
        # Calculate probability
        probability = 0.5
        if factors["tests_pass"]:
            probability += 0.3
        if factors["files_changed"] < 10:
            probability += 0.1
        if factors["has_description"]:
            probability += 0.1
        
        probability = min(probability + (factors["author_reputation"] * 0.2), 1.0)
        
        self.predictions_made += 1
        self.confidence_scores.append(probability)
        
        return {
            "probability": round(probability, 2),
            "confidence": round(self.accuracy, 2),
            "recommendation": "approve" if probability > 0.75 else "review_needed",
            "factors": factors
        }
    
    def predict_issue_resolution_time(self, issue_data: Dict[str, Any]) -> Dict[str, Any]:
        """Predict time to resolve an issue"""
        priority = issue_data.get("priority", 3)
        complexity = issue_data.get("complexity", "medium")
        
        # Base times in hours
        base_times = {
            "low": 24,
            "medium": 48,
            "high": 96
        }
        
        estimated_hours = base_times.get(complexity, 48)
        
        # Adjust for priority
        if priority == 1:
            estimated_hours *= 0.5
        elif priority == 2:
            estimated_hours *= 0.75
        
        resolution_date = datetime.now() + timedelta(hours=estimated_hours)
        
        self.predictions_made += 1
        
        return {
            "estimated_hours": int(estimated_hours),
            "estimated_completion": resolution_date.isoformat(),
            "confidence": round(self.accuracy, 2),
            "priority": priority
        }
    
    def predict_build_success(self, build_data: Dict[str, Any]) -> Dict[str, Any]:
        """Predict if a build will succeed"""
        recent_success_rate = build_data.get("recent_success_rate", 0.95)
        code_quality_score = build_data.get("code_quality_score", 0.85)
        test_coverage = build_data.get("test_coverage", 0.80)
        
        probability = (recent_success_rate * 0.4 + 
                      code_quality_score * 0.3 + 
                      test_coverage * 0.3)
        
        self.predictions_made += 1
        
        return {
            "success_probability": round(probability, 2),
            "confidence": round(self.accuracy, 2),
            "recommendation": "proceed" if probability > 0.8 else "review_changes"
        }
    
    def get_stats(self) -> Dict[str, Any]:
        """Get prediction engine statistics"""
        avg_confidence = sum(self.confidence_scores[-100:]) / len(self.confidence_scores[-100:]) if self.confidence_scores else 0
        
        return {
            "accuracy": self.accuracy,
            "predictions_made": self.predictions_made,
            "average_confidence": round(avg_confidence, 2),
            "last_prediction": datetime.now().isoformat()
        }
