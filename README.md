# SensorPush Logger

A logging gateway for SensorPush HT.w devices.

## Running the Application

This project combines a Python FastAPI backend (with BLE scanning and GraphQL) and a React frontend.

### Development Environment (with HMR)

This setup runs the backend server (with auto-reload) and the frontend development server (with HMR) concurrently using a single command. API requests from the frontend are automatically proxied to the backend.

**One-time Setup:**

1.  **Install Backend Dependencies:**
    ```bash
    poetry install
    ```
2.  **Install Frontend Dependencies & Dev Tools:**
    ```bash
    cd frontend
    npm install
    npm install --save-dev concurrently
    cd ..
    ```
3.  **Configure Frontend Proxy:** Ensure the following line exists in `frontend/package.json`:
    ```json
    "proxy": "http://localhost:8000",
    ```
4.  **Add Dev Script:** Ensure the following script exists in the `"scripts"` section of `frontend/package.json`:
    ```json
    "dev": "concurrently \"cd .. && poetry run uvicorn sensorpush_logger.web_backend:app --reload --port 8000\" \"npm start\""
    ```
    *(Note: Adjust the backend command if your poetry environment activation differs)*

**Running:**

1.  Navigate to the frontend directory:
    ```bash
    cd frontend
    ```
2.  Start both servers:
    ```bash
    npm run dev
    ```
3.  Access the application in your browser, usually at `http://localhost:3000`.

### Production Environment

This setup builds the optimized frontend assets and serves them directly from the backend server.

**Steps:**

1.  **Install Backend Dependencies (if not already done):**
    ```bash
    poetry install --no-dev
    ```
2.  **Build Frontend Assets:**
    ```bash
    cd frontend
    npm install --production # Optional: Install only production deps if needed
    npm run build
    cd ..
    ```
3.  **Run Backend Server:**
    ```bash
    poetry run uvicorn sensorpush_logger.web_backend:app --host 0.0.0.0 --port 8000
    ```
    *(Adjust host/port as needed for your deployment)*

4.  Access the application in your browser at the server's address (e.g., `http://your_server_ip:8000`).