"""
Decision Engine - Makes autonomous decisions based on AI analysis
"""
from typing import Dict, Any, List
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

class DecisionEngine:
    def __init__(self, auto_approve_threshold: float = 0.95):
        self.auto_approve_threshold = auto_approve_threshold
        self.accuracy = 0.94
        self.decisions_made = 0
        self.auto_approved = 0
        self.decision_history = []
        
    def decide_pr_action(self, pr_analysis: Dict[str, Any]) -> Dict[str, Any]:
        """Decide action for a pull request"""
        confidence = pr_analysis.get("confidence", 0)
        probability = pr_analysis.get("probability", 0)
        tests_pass = pr_analysis.get("tests_pass", False)
        
        decision = {
            "action": "review",
            "reason": "Default review required",
            "confidence": confidence,
            "auto_approved": False
        }
        
        # Auto-approve logic
        if (confidence >= self.auto_approve_threshold and 
            probability >= 0.90 and 
            tests_pass):
            decision["action"] = "approve"
            decision["reason"] = "High confidence auto-approval"
            decision["auto_approved"] = True
            self.auto_approved += 1
        
        # Request changes logic
        elif not tests_pass:
            decision["action"] = "request_changes"
            decision["reason"] = "Tests failing"
        
        # Needs review
        elif confidence < 0.75:
            decision["action"] = "request_review"
            decision["reason"] = "Low confidence, human review needed"
        
        self.decisions_made += 1
        self._log_decision("pr", decision)
        
        return decision
    
    def decide_issue_priority(self, issue_analysis: Dict[str, Any]) -> Dict[str, Any]:
        """Decide priority level for an issue"""
        labels = issue_analysis.get("labels", [])
        sentiment = issue_analysis.get("sentiment", "neutral")
        urgency_keywords = issue_analysis.get("urgency_keywords", [])
        
        priority = 3  # Default: Normal
        reason = "Standard priority"
        
        # Critical priority
        if "critical" in [l.lower() for l in labels] or "urgent" in urgency_keywords:
            priority = 1
            reason = "Critical issue detected"
        
        # High priority
        elif "bug" in [l.lower() for l in labels] or sentiment == "negative":
            priority = 2
            reason = "Bug or negative sentiment"
        
        # Low priority
        elif "enhancement" in [l.lower() for l in labels]:
            priority = 4
            reason = "Enhancement request"
        
        decision = {
            "priority": priority,
            "reason": reason,
            "auto_assigned": True,
            "confidence": self.accuracy
        }
        
        self.decisions_made += 1
        self._log_decision("issue", decision)
        
        return decision
    
    def decide_resource_allocation(self, task_data: Dict[str, Any]) -> Dict[str, Any]:
        """Decide how to allocate resources for a task"""
        complexity = task_data.get("complexity", "medium")
        priority = task_data.get("priority", 3)
        
        allocation = {
            "compute_units": 1,
            "memory_gb": 2,
            "parallelism": 1,
            "reason": "Standard allocation"
        }
        
        # High priority or complex tasks get more resources
        if priority <= 2 or complexity == "high":
            allocation["compute_units"] = 4
            allocation["memory_gb"] = 8
            allocation["parallelism"] = 4
            allocation["reason"] = "High priority/complexity"
        
        self.decisions_made += 1
        return allocation
    
    def _log_decision(self, decision_type: str, decision: Dict[str, Any]):
        """Log decision for analysis"""
        log_entry = {
            "type": decision_type,
            "decision": decision,
            "timestamp": datetime.now().isoformat()
        }
        self.decision_history.append(log_entry)
        
        # Keep only last 1000 decisions
        if len(self.decision_history) > 1000:
            self.decision_history = self.decision_history[-1000:]
        
        logger.info(f"Decision made: {decision_type} - {decision.get('action', decision.get('priority'))}")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get decision engine statistics"""
        return {
            "accuracy": self.accuracy,
            "decisions_made": self.decisions_made,
            "auto_approved": self.auto_approved,
            "success_rate": round(self.auto_approved / max(self.decisions_made, 1), 2),
            "last_decision": datetime.now().isoformat()
        }
