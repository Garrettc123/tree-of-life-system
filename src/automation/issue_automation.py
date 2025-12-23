"""
Issue Automation - Automated issue management
"""
from typing import Dict, Any, List
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

class IssueAutomation:
    def __init__(self):
        self.issues_processed = 0
        self.auto_triaged = 0
        self.auto_closed = 0
        
    def process_new_issue(self, issue_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process a newly created issue"""
        actions = []
        
        # Auto-triage based on content
        triage = self._triage_issue(issue_data)
        actions.extend(triage["actions"])
        self.auto_triaged += 1
        
        # Check if duplicate
        if self._is_duplicate(issue_data):
            actions.append({
                "action": "add_comment",
                "comment": "This appears to be a duplicate. Please check existing issues."
            })
            actions.append({"action": "add_label", "label": "duplicate"})
        
        # Check if it should be auto-closed
        if self._should_auto_close(issue_data):
            actions.append({
                "action": "close",
                "reason": "Automated closure"
            })
            self.auto_closed += 1
        
        self.issues_processed += 1
        
        return {
            "actions": actions,
            "triage": triage,
            "processed_at": datetime.now().isoformat()
        }
    
    def _triage_issue(self, issue_data: Dict[str, Any]) -> Dict[str, Any]:
        """Automatically triage an issue"""
        title = issue_data.get("title", "").lower()
        body = issue_data.get("body", "").lower()
        
        actions = []
        priority = "normal"
        labels = []
        
        # Determine type
        if "bug" in title or "error" in title or "broken" in title:
            labels.append("bug")
            priority = "high"
        elif "feature" in title or "enhancement" in title:
            labels.append("enhancement")
        elif "question" in title or "how to" in title:
            labels.append("question")
        elif "documentation" in title or "docs" in title:
            labels.append("documentation")
        
        # Determine priority
        if "critical" in title or "urgent" in title:
            priority = "critical"
            labels.append("critical")
        elif "security" in title or "vulnerability" in title:
            priority = "critical"
            labels.append("security")
        
        # Add actions
        if labels:
            actions.append({"action": "add_labels", "labels": labels})
        
        if priority == "critical":
            actions.append({
                "action": "notify_team",
                "team": "@on-call",
                "message": "Critical issue requires immediate attention"
            })
        
        return {
            "priority": priority,
            "labels": labels,
            "actions": actions
        }
    
    def _is_duplicate(self, issue_data: Dict[str, Any]) -> bool:
        """Check if issue is a duplicate (simplified)"""
        # In production, would search existing issues
        # For now, just a placeholder
        return False
    
    def _should_auto_close(self, issue_data: Dict[str, Any]) -> bool:
        """Check if issue should be auto-closed"""
        title = issue_data.get("title", "").lower()
        body = issue_data.get("body", "").lower()
        
        # Close if missing information and is a question
        if "question" in title and len(body) < 50:
            return True
        
        # Close if spam-like
        spam_indicators = ["viagra", "casino", "lottery"]
        if any(indicator in title or indicator in body for indicator in spam_indicators):
            return True
        
        return False
    
    def handle_issue_update(self, issue_data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle issue updates"""
        actions = []
        
        # Check if issue is stale
        if self._is_stale(issue_data):
            actions.append({
                "action": "add_comment",
                "comment": "This issue appears to be stale. Please provide an update or it will be closed."
            })
            actions.append({"action": "add_label", "label": "stale"})
        
        # Check if issue can be closed
        if self._can_auto_close_inactive(issue_data):
            actions.append({"action": "close", "reason": "No activity"})
            self.auto_closed += 1
        
        return {"actions": actions, "updated_at": datetime.now().isoformat()}
    
    def _is_stale(self, issue_data: Dict[str, Any]) -> bool:
        """Check if issue is stale (no activity for 30 days)"""
        # Simplified - would check last_updated in production
        return False
    
    def _can_auto_close_inactive(self, issue_data: Dict[str, Any]) -> bool:
        """Check if inactive issue can be closed (no activity for 60 days)"""
        # Simplified - would check last_updated in production
        return False
    
    def get_stats(self) -> Dict[str, Any]:
        """Get issue automation statistics"""
        return {
            "issues_processed": self.issues_processed,
            "auto_triaged": self.auto_triaged,
            "auto_closed": self.auto_closed,
            "triage_rate": round(self.auto_triaged / max(self.issues_processed, 1), 2)
        }
