import sys
import os
import uvicorn


# Ensure the project root is in sys.path
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

if __name__ == "__main__":
    uvicorn.run("backend.web_backend:app", host="0.0.0.0", port=8000, reload=True)
