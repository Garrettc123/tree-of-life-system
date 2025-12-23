"""
PR Automation - Automated pull request management
"""
from typing import Dict, Any, List
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

class PRAutomation:
    def __init__(self, auto_merge_enabled: bool = True):
        self.auto_merge_enabled = auto_merge_enabled
        self.prs_processed = 0
        self.auto_merged = 0
        self.auto_labeled = 0
        
    def process_new_pr(self, pr_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process a newly created pull request"""
        actions = []
        
        # Auto-label based on files changed
        labels = self._determine_labels(pr_data)
        if labels:
            actions.append({"action": "add_labels", "labels": labels})
            self.auto_labeled += 1
        
        # Request reviewers based on files
        reviewers = self._determine_reviewers(pr_data)
        if reviewers:
            actions.append({"action": "request_reviewers", "reviewers": reviewers})
        
        # Check if PR can be auto-merged
        if self._can_auto_merge(pr_data):
            actions.append({"action": "auto_merge", "method": "squash"})
            self.auto_merged += 1
        
        self.prs_processed += 1
        
        return {
            "actions": actions,
            "processed_at": datetime.now().isoformat()
        }
    
    def _determine_labels(self, pr_data: Dict[str, Any]) -> List[str]:
        """Determine appropriate labels for PR"""
        labels = []
        files = pr_data.get("files", [])
        title = pr_data.get("title", "").lower()
        
        # Determine labels based on files
        for file in files:
            if file.endswith(".py"):
                labels.append("python")
            elif file.endswith(".js") or file.endswith(".ts"):
                labels.append("javascript")
            elif file.endswith(".md"):
                labels.append("documentation")
            elif "test" in file:
                labels.append("tests")
        
        # Determine labels based on title
        if "fix" in title or "bug" in title:
            labels.append("bug")
        elif "feat" in title or "feature" in title:
            labels.append("enhancement")
        elif "refactor" in title:
            labels.append("refactoring")
        
        return list(set(labels))  # Remove duplicates
    
    def _determine_reviewers(self, pr_data: Dict[str, Any]) -> List[str]:
        """Determine appropriate reviewers for PR"""
        reviewers = []
        files = pr_data.get("files", [])
        
        # Simple logic - in production would use CODEOWNERS
        has_backend = any(f.endswith(".py") for f in files)
        has_frontend = any(f.endswith((".js", ".ts", ".jsx", ".tsx")) for f in files)
        has_docs = any(f.endswith(".md") for f in files)
        
        if has_backend:
            reviewers.append("backend-team")
        if has_frontend:
            reviewers.append("frontend-team")
        if has_docs:
            reviewers.append("docs-team")
        
        return reviewers
    
    def _can_auto_merge(self, pr_data: Dict[str, Any]) -> bool:
        """Check if PR can be automatically merged"""
        if not self.auto_merge_enabled:
            return False
        
        # Criteria for auto-merge
        checks_pass = pr_data.get("checks_pass", False)
        has_approvals = pr_data.get("approvals", 0) >= 1
        is_small = pr_data.get("files_changed", 0) < 5
        is_dependabot = pr_data.get("author", "") == "dependabot"
        
        return checks_pass and (has_approvals or (is_small and is_dependabot))
    
    def handle_pr_update(self, pr_data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle PR updates (new commits, reviews, etc.)"""
        actions = []
        
        # Re-check auto-merge conditions
        if self._can_auto_merge(pr_data):
            actions.append({"action": "auto_merge", "method": "squash"})
        
        # Check if needs re-review after changes
        if pr_data.get("new_commits", False):
            actions.append({"action": "dismiss_stale_reviews"})
            actions.append({"action": "request_reviewers", "reviewers": self._determine_reviewers(pr_data)})
        
        return {"actions": actions, "updated_at": datetime.now().isoformat()}
    
    def get_stats(self) -> Dict[str, Any]:
        """Get PR automation statistics"""
        return {
            "prs_processed": self.prs_processed,
            "auto_merged": self.auto_merged,
            "auto_labeled": self.auto_labeled,
            "auto_merge_rate": round(self.auto_merged / max(self.prs_processed, 1), 2)
        }
