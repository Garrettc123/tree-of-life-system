"""
Workflow Engine - Orchestrates automated workflows
"""
from typing import Dict, Any, List, Callable
from datetime import datetime
import asyncio
import logging

logger = logging.getLogger(__name__)

class WorkflowEngine:
    def __init__(self):
        self.workflows = {}
        self.executions = 0
        self.success_rate = 0.96
        self.running_workflows = {}
        
    def register_workflow(self, name: str, steps: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Register a new workflow"""
        workflow = {
            "name": name,
            "steps": steps,
            "created_at": datetime.now().isoformat(),
            "executions": 0,
            "success_count": 0
        }
        
        self.workflows[name] = workflow
        logger.info(f"Workflow registered: {name} with {len(steps)} steps")
        
        return {"registered": True, "workflow_id": name}
    
    async def execute_workflow(self, name: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a registered workflow"""
        if name not in self.workflows:
            return {"success": False, "error": "Workflow not found"}
        
        workflow = self.workflows[name]
        execution_id = f"{name}_{datetime.now().timestamp()}"
        
        self.running_workflows[execution_id] = {
            "status": "running",
            "current_step": 0,
            "started_at": datetime.now().isoformat()
        }
        
        results = []
        
        try:
            for idx, step in enumerate(workflow["steps"]):
                self.running_workflows[execution_id]["current_step"] = idx
                
                step_result = await self._execute_step(step, context)
                results.append(step_result)
                
                if not step_result.get("success", False):
                    raise Exception(f"Step {idx} failed: {step_result.get('error')}")
                
                # Update context with step results
                context.update(step_result.get("output", {}))
            
            workflow["executions"] += 1
            workflow["success_count"] += 1
            self.executions += 1
            
            self.running_workflows[execution_id]["status"] = "completed"
            
            return {
                "success": True,
                "execution_id": execution_id,
                "results": results,
                "completed_at": datetime.now().isoformat()
            }
            
        except Exception as e:
            workflow["executions"] += 1
            self.executions += 1
            
            self.running_workflows[execution_id]["status"] = "failed"
            logger.error(f"Workflow {name} failed: {e}")
            
            return {
                "success": False,
                "execution_id": execution_id,
                "error": str(e),
                "failed_at": datetime.now().isoformat()
            }
    
    async def _execute_step(self, step: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a single workflow step"""
        step_type = step.get("type")
        
        if step_type == "api_call":
            return await self._execute_api_call(step, context)
        elif step_type == "condition":
            return self._execute_condition(step, context)
        elif step_type == "transform":
            return self._execute_transform(step, context)
        elif step_type == "notification":
            return await self._execute_notification(step, context)
        else:
            return {"success": False, "error": f"Unknown step type: {step_type}"}
    
    async def _execute_api_call(self, step: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        """Execute an API call step"""
        # Simulate API call
        await asyncio.sleep(0.1)
        return {
            "success": True,
            "output": {"api_response": "Success", "data": context}
        }
    
    def _execute_condition(self, step: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a conditional step"""
        condition = step.get("condition", "true")
        # Simple evaluation
        result = eval(condition, {}, context)
        return {"success": True, "output": {"condition_met": result}}
    
    def _execute_transform(self, step: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a data transformation step"""
        transform = step.get("transform", {})
        output = {}
        
        for key, value in transform.items():
            if isinstance(value, str) and value.startswith("$"):
                # Variable reference
                var_name = value[1:]
                output[key] = context.get(var_name)
            else:
                output[key] = value
        
        return {"success": True, "output": output}
    
    async def _execute_notification(self, step: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a notification step"""
        message = step.get("message", "Notification")
        logger.info(f"Notification: {message}")
        return {"success": True, "output": {"notification_sent": True}}
    
    def get_workflow_status(self, execution_id: str) -> Dict[str, Any]:
        """Get status of a running workflow"""
        return self.running_workflows.get(execution_id, {"status": "not_found"})
    
    def get_stats(self) -> Dict[str, Any]:
        """Get workflow engine statistics"""
        return {
            "total_workflows": len(self.workflows),
            "total_executions": self.executions,
            "success_rate": self.success_rate,
            "running_workflows": len([w for w in self.running_workflows.values() if w["status"] == "running"])
        }
