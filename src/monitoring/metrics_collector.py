"""
Metrics Collector - Collects and aggregates system metrics
"""
from typing import Dict, Any, List
import logging
from datetime import datetime, timedelta
from collections import defaultdict

logger = logging.getLogger(__name__)

class MetricsCollector:
    def __init__(self):
        self.metrics = defaultdict(list)
        self.counters = defaultdict(int)
        self.gauges = defaultdict(float)
        self.timers = defaultdict(list)
        
    def record_counter(self, name: str, value: int = 1, tags: Dict[str, str] = None):
        """Record a counter metric"""
        self.counters[name] += value
        self._record_metric("counter", name, value, tags)
    
    def record_gauge(self, name: str, value: float, tags: Dict[str, str] = None):
        """Record a gauge metric"""
        self.gauges[name] = value
        self._record_metric("gauge", name, value, tags)
    
    def record_timer(self, name: str, duration_ms: float, tags: Dict[str, str] = None):
        """Record a timing metric"""
        self.timers[name].append(duration_ms)
        self._record_metric("timer", name, duration_ms, tags)
    
    def _record_metric(self, metric_type: str, name: str, value: Any, tags: Dict[str, str] = None):
        """Record a generic metric"""
        metric = {
            "type": metric_type,
            "name": name,
            "value": value,
            "tags": tags or {},
            "timestamp": datetime.now().isoformat()
        }
        
        self.metrics[name].append(metric)
        
        # Keep only last 1000 metrics per name
        if len(self.metrics[name]) > 1000:
            self.metrics[name] = self.metrics[name][-1000:]
    
    def get_counter(self, name: str) -> int:
        """Get current counter value"""
        return self.counters.get(name, 0)
    
    def get_gauge(self, name: str) -> float:
        """Get current gauge value"""
        return self.gauges.get(name, 0.0)
    
    def get_timer_stats(self, name: str) -> Dict[str, float]:
        """Get timer statistics"""
        times = self.timers.get(name, [])
        
        if not times:
            return {"count": 0}
        
        return {
            "count": len(times),
            "min": min(times),
            "max": max(times),
            "avg": sum(times) / len(times),
            "p50": self._percentile(times, 50),
            "p95": self._percentile(times, 95),
            "p99": self._percentile(times, 99)
        }
    
    def _percentile(self, values: List[float], percentile: int) -> float:
        """Calculate percentile"""
        sorted_values = sorted(values)
        index = int(len(sorted_values) * (percentile / 100))
        return sorted_values[min(index, len(sorted_values) - 1)]
    
    def get_metrics_summary(self, time_range: timedelta = None) -> Dict[str, Any]:
        """Get summary of all metrics"""
        summary = {
            "counters": dict(self.counters),
            "gauges": dict(self.gauges),
            "timers": {}
        }
        
        for name in self.timers:
            summary["timers"][name] = self.get_timer_stats(name)
        
        return summary
    
    def get_rate(self, counter_name: str, window_seconds: int = 60) -> float:
        """Get rate per second for a counter"""
        metrics = self.metrics.get(counter_name, [])
        
        if not metrics:
            return 0.0
        
        cutoff_time = datetime.now() - timedelta(seconds=window_seconds)
        recent_metrics = [
            m for m in metrics 
            if datetime.fromisoformat(m["timestamp"]) > cutoff_time
        ]
        
        if not recent_metrics:
            return 0.0
        
        total_value = sum(m["value"] for m in recent_metrics)
        return total_value / window_seconds
    
    def reset_metrics(self, metric_names: List[str] = None):
        """Reset specific metrics or all metrics"""
        if metric_names:
            for name in metric_names:
                self.counters.pop(name, None)
                self.gauges.pop(name, None)
                self.timers.pop(name, None)
                self.metrics.pop(name, None)
        else:
            self.counters.clear()
            self.gauges.clear()
            self.timers.clear()
            self.metrics.clear()
        
        logger.info(f"Metrics reset: {metric_names or 'all'}")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get metrics collector statistics"""
        return {
            "total_counters": len(self.counters),
            "total_gauges": len(self.gauges),
            "total_timers": len(self.timers),
            "total_metrics": sum(len(metrics) for metrics in self.metrics.values())
        }
