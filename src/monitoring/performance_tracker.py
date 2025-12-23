"""
Performance Tracker - Tracks and analyzes system performance
"""
from typing import Dict, Any, List
import logging
from datetime import datetime, timedelta
import time
from contextlib import contextmanager

logger = logging.getLogger(__name__)

class PerformanceTracker:
    def __init__(self):
        self.operations = []
        self.slow_operations = []
        self.slow_threshold_ms = 1000
        self.total_operations = 0
        
    @contextmanager
    def track_operation(self, operation_name: str, metadata: Dict[str, Any] = None):
        """Context manager to track operation performance"""
        start_time = time.time()
        
        try:
            yield
        finally:
            duration_ms = (time.time() - start_time) * 1000
            self._record_operation(operation_name, duration_ms, metadata)
    
    def _record_operation(self, name: str, duration_ms: float, metadata: Dict[str, Any] = None):
        """Record an operation's performance"""
        operation = {
            "name": name,
            "duration_ms": duration_ms,
            "metadata": metadata or {},
            "timestamp": datetime.now().isoformat(),
            "slow": duration_ms > self.slow_threshold_ms
        }
        
        self.operations.append(operation)
        self.total_operations += 1
        
        if operation["slow"]:
            self.slow_operations.append(operation)
            logger.warning(f"Slow operation detected: {name} took {duration_ms:.2f}ms")
        
        # Keep only last 1000 operations
        if len(self.operations) > 1000:
            self.operations = self.operations[-1000:]
        
        # Keep only last 100 slow operations
        if len(self.slow_operations) > 100:
            self.slow_operations = self.slow_operations[-100:]
    
    def get_operation_stats(self, operation_name: str = None) -> Dict[str, Any]:
        """Get statistics for operations"""
        if operation_name:
            ops = [op for op in self.operations if op["name"] == operation_name]
        else:
            ops = self.operations
        
        if not ops:
            return {"count": 0}
        
        durations = [op["duration_ms"] for op in ops]
        slow_count = sum(1 for op in ops if op["slow"])
        
        return {
            "count": len(ops),
            "min_ms": min(durations),
            "max_ms": max(durations),
            "avg_ms": sum(durations) / len(durations),
            "slow_count": slow_count,
            "slow_rate": slow_count / len(ops) if len(ops) > 0 else 0
        }
    
    def get_slowest_operations(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get the slowest operations"""
        sorted_ops = sorted(self.operations, key=lambda x: x["duration_ms"], reverse=True)
        return sorted_ops[:limit]
    
    def get_performance_report(self, time_window: timedelta = None) -> Dict[str, Any]:
        """Get comprehensive performance report"""
        if time_window:
            cutoff_time = datetime.now() - time_window
            ops = [
                op for op in self.operations 
                if datetime.fromisoformat(op["timestamp"]) > cutoff_time
            ]
        else:
            ops = self.operations
        
        if not ops:
            return {"operations": 0, "message": "No operations in time window"}
        
        # Group by operation name
        by_name = {}
        for op in ops:
            name = op["name"]
            if name not in by_name:
                by_name[name] = []
            by_name[name].append(op)
        
        # Calculate stats for each operation type
        operation_stats = {}
        for name, name_ops in by_name.items():
            durations = [op["duration_ms"] for op in name_ops]
            operation_stats[name] = {
                "count": len(name_ops),
                "avg_ms": sum(durations) / len(durations),
                "min_ms": min(durations),
                "max_ms": max(durations)
            }
        
        return {
            "total_operations": len(ops),
            "slow_operations": sum(1 for op in ops if op["slow"]),
            "operation_stats": operation_stats,
            "slowest_operations": self.get_slowest_operations(5)
        }
    
    def identify_bottlenecks(self) -> List[Dict[str, Any]]:
        """Identify performance bottlenecks"""
        bottlenecks = []
        
        # Group operations by name
        by_name = {}
        for op in self.operations:
            name = op["name"]
            if name not in by_name:
                by_name[name] = []
            by_name[name].append(op)
        
        # Find operations with high slow rate
        for name, ops in by_name.items():
            if len(ops) < 10:  # Need sufficient data
                continue
            
            slow_count = sum(1 for op in ops if op["slow"])
            slow_rate = slow_count / len(ops)
            
            if slow_rate > 0.2:  # More than 20% slow
                durations = [op["duration_ms"] for op in ops]
                bottlenecks.append({
                    "operation": name,
                    "slow_rate": round(slow_rate, 2),
                    "avg_duration_ms": round(sum(durations) / len(durations), 2),
                    "sample_count": len(ops),
                    "severity": "high" if slow_rate > 0.5 else "medium"
                })
        
        return sorted(bottlenecks, key=lambda x: x["slow_rate"], reverse=True)
    
    def get_stats(self) -> Dict[str, Any]:
        """Get performance tracker statistics"""
        return {
            "total_operations": self.total_operations,
            "tracked_operations": len(self.operations),
            "slow_operations": len(self.slow_operations),
            "slow_rate": round(len(self.slow_operations) / max(self.total_operations, 1), 2),
            "slow_threshold_ms": self.slow_threshold_ms
        }
