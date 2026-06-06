#!/usr/bin/env python3
"""
GAR-25 Orchestration Engine
Entry point for Railway deployment.
Delegates to root-level orchestrator if available.
"""
import os
import sys
import importlib.util
from pathlib import Path

# Allow importing from repo root
ROOT = Path(__file__).parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

PORT = int(os.environ.get("PORT", 8000))

def main():
    # Try to delegate to root orchestrator/main.py if it exists
    root_main = ROOT / "orchestrator" / "main.py"
    if root_main.exists():
        spec = importlib.util.spec_from_file_location("orchestrator.main", root_main)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        if hasattr(mod, "main"):
            mod.main()
        return

    # Fallback: minimal FastAPI health server
    try:
        import uvicorn
        from fastapi import FastAPI

        app = FastAPI(title="GAR-25 Orchestration Engine", version="1.0.0")

        @app.get("/health")
        def health():
            return {"status": "ok", "service": "orchestration-engine", "port": PORT}

        @app.get("/")
        def root():
            return {"status": "running", "message": "GAR-25 Orchestration Engine live"}

        print(f"Starting orchestration engine on port {PORT}")
        uvicorn.run(app, host="0.0.0.0", port=PORT)

    except ImportError:
        # Ultra-minimal stdlib fallback
        from http.server import HTTPServer, BaseHTTPRequestHandler
        import json

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                body = json.dumps({"status": "ok", "service": "orchestration-engine"}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", len(body))
                self.end_headers()
                self.wfile.write(body)
            def log_message(self, *args):
                pass

        print(f"Starting minimal HTTP server on port {PORT}")
        HTTPServer(("", PORT), Handler).serve_forever()

if __name__ == "__main__":
    main()
