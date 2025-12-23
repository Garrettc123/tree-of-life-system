"""
Health Monitor - System health monitoring and alerting
"""
from typing import Dict, Any, List
import logging
from datetime import datetime
import psutil
import time

logger = logging.getLogger(__name__)

class HealthMonitor:
    def __init__(self, alert_threshold: float = 0.90):
        self.alert_threshold = alert_threshold
        self.health_checks = 0
        self.alerts_sent = 0
        self.last_check = None
        self.health_history = []
        
    def check_system_health(self) -> Dict[str, Any]:
        """Perform comprehensive system health check"""
        health_report = {
            "timestamp": datetime.now().isoformat(),
            "overall_status": "healthy",
            "components": {},
            "metrics": {}
        }
        
        # Check CPU
        cpu_health = self._check_cpu()
        health_report["components"]["cpu"] = cpu_health
        
        # Check Memory
        memory_health = self._check_memory()
        health_report["components"]["memory"] = memory_health
        
        # Check Disk
        disk_health = self._check_disk()
        health_report["components"]["disk"] = disk_health
        
        # Check Services
        services_health = self._check_services()
        health_report["components"]["services"] = services_health
        
        # Determine overall status
        statuses = [comp["status"] for comp in health_report["components"].values()]
        if "critical" in statuses:
            health_report["overall_status"] = "critical"
        elif "warning" in statuses:
            health_report["overall_status"] = "warning"
        
        # Send alerts if needed
        if health_report["overall_status"] != "healthy":
            self._send_alert(health_report)
        
        self.health_checks += 1
        self.last_check = datetime.now()
        self.health_history.append(health_report)
        
        # Keep only last 100 checks
        if len(self.health_history) > 100:
            self.health_history = self.health_history[-100:]
        
        return health_report
    
    def _check_cpu(self) -> Dict[str, Any]:
        """Check CPU health"""
        try:
            cpu_percent = psutil.cpu_percent(interval=1)
            
            status = "healthy"
            if cpu_percent > 90:
                status = "critical"
            elif cpu_percent > 75:
                status = "warning"
            
            return {
                "status": status,
                "usage_percent": cpu_percent,
                "core_count": psutil.cpu_count(),
                "load_average": psutil.getloadavg() if hasattr(psutil, 'getloadavg') else None
            }
        except Exception as e:
            logger.error(f"CPU check failed: {e}")
            return {"status": "unknown", "error": str(e)}
    
    def _check_memory(self) -> Dict[str, Any]:
        """Check memory health"""
        try:
            memory = psutil.virtual_memory()
            
            status = "healthy"
            if memory.percent > 90:
                status = "critical"
            elif memory.percent > 80:
                status = "warning"
            
            return {
                "status": status,
                "usage_percent": memory.percent,
                "total_gb": round(memory.total / (1024**3), 2),
                "available_gb": round(memory.available / (1024**3), 2),
                "used_gb": round(memory.used / (1024**3), 2)
            }
        except Exception as e:
            logger.error(f"Memory check failed: {e}")
            return {"status": "unknown", "error": str(e)}
    
    def _check_disk(self) -> Dict[str, Any]:
        """Check disk health"""
        try:
            disk = psutil.disk_usage('/')
            
            status = "healthy"
            if disk.percent > 90:
                status = "critical"
            elif disk.percent > 80:
                status = "warning"
            
            return {
                "status": status,
                "usage_percent": disk.percent,
                "total_gb": round(disk.total / (1024**3), 2),
                "free_gb": round(disk.free / (1024**3), 2),
                "used_gb": round(disk.used / (1024**3), 2)
            }
        except Exception as e:
            logger.error(f"Disk check failed: {e}")
            return {"status": "unknown", "error": str(e)}
    
    def _check_services(self) -> Dict[str, Any]:
        """Check service health"""
        # Simplified service check
        services = {
            "api": "healthy",
            "database": "healthy",
            "cache": "healthy",
            "queue": "healthy"
        }
        
        all_healthy = all(status == "healthy" for status in services.values())
        
        return {
            "status": "healthy" if all_healthy else "warning",
            "services": services
        }
    
    def _send_alert(self, health_report: Dict[str, Any]):
        """Send health alert"""
        logger.warning(f"Health alert: System status is {health_report['overall_status']}")
        self.alerts_sent += 1
    
    def get_health_trend(self, hours: int = 24) -> Dict[str, Any]:
        """Get health trend over time"""
        recent_checks = self.health_history[-hours:] if len(self.health_history) >= hours else self.health_history
        
        if not recent_checks:
            return {"trend": "no_data"}
        
        healthy_count = sum(1 for check in recent_checks if check["overall_status"] == "healthy")
        health_rate = healthy_count / len(recent_checks)
        
        return {
            "health_rate": round(health_rate, 2),
            "total_checks": len(recent_checks),
            "healthy_checks": healthy_count,
            "trend": "improving" if health_rate > 0.9 else "declining" if health_rate < 0.7 else "stable"
        }
    
    def get_stats(self) -> Dict[str, Any]:
        """Get health monitor statistics"""
        return {
            "total_checks": self.health_checks,
            "alerts_sent": self.alerts_sent,
            "last_check": self.last_check.isoformat() if self.last_check else None,
            "alert_rate": round(self.alerts_sent / max(self.health_checks, 1), 2)
        }
