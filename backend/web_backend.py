import os
import asyncio
import subprocess
import datetime
import logging
from contextlib import asynccontextmanager # Add this import

# FastAPI imports
from fastapi import FastAPI, Response
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

# Strawberry GraphQL imports
import strawberry
from strawberry.fastapi import GraphQLRouter

# Uvicorn
import uvicorn

# Local imports
from .sql_model import SqlModel
from .sp_ble import create_scanner, advertisement_loop
from .graphql_schema import schema, LogMessage # Import the GraphQL schema and LogMessage type
from .graphql_resolvers import publish_sample, log_queue # Import the publisher function and log queue

# --- Custom Log Handler ---
class QueueLogHandler(logging.Handler):
    """A logging handler that puts formatted log records onto an asyncio queue."""
    def __init__(self, queue: asyncio.Queue):
        super().__init__()
        self.queue = queue

    def emit(self, record: logging.LogRecord):
        # Format the log record into a LogMessage object
        try:
            log_entry = LogMessage(
                timestamp=datetime.datetime.fromtimestamp(record.created, tz=datetime.timezone.utc),
                message=self.format(record), # Use the handler's formatter
                level=record.levelname
            )
            # Put the log entry onto the queue
            # Use call_soon_threadsafe if emitting from a different thread,
            # but logging usually happens in the same event loop context here.
            # If issues arise, consider switching to loop.call_soon_threadsafe(self.queue.put_nowait, log_entry)
            self.queue.put_nowait(log_entry)
        except Exception:
            # Avoid logging errors within the handler itself to prevent loops
            self.handleError(record)

# --- Configure Logging ---
# Basic config for console/file output (optional, can be removed if only queue is desired)
log_formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', handlers=[logging.StreamHandler()]) # Keep console output for now

# Get the root logger
root_logger = logging.getLogger()
root_logger.setLevel(logging.INFO) # Ensure root logger level is appropriate

# Create and add the queue handler
queue_handler = QueueLogHandler(log_queue)
queue_handler.setFormatter(log_formatter) # Use the same format
root_logger.addHandler(queue_handler)

# Get logger for this module specifically (optional, inherits from root)
logger = logging.getLogger(__name__)
logger.info("QueueLogHandler added to root logger.") # Test message

# --- FastAPI App ---
# Use lifespan context manager for startup/shutdown events
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic
    logger.info("Starting application lifespan...")
    db = None
    scanner = None
    ble_task = None
    try:
        # Initialize DB
        db = await SqlModel.create()
        app.state.db = db
        logger.info("Database connection established.")

        # Start BLE scanning
        scanner = create_scanner()
        await scanner.start()
        app.state.scanner = scanner

        async def on_sample_callback(sample_data):
            if app.state.db:
                asyncio.create_task(publish_sample(app.state.db, sample_data))
            else:
                logger.warning("Database not available, skipping sample publishing.")

        ble_task = asyncio.create_task(
            advertisement_loop(scanner, app.state.db, on_sample=on_sample_callback)
        )
        app.state.ble_task = ble_task
        logger.info("BLE scanning started and advertisement loop running.")

    except Exception as e:
        logger.error(f"Error during application startup: {e}", exc_info=True)
        # Ensure resources are cleaned up if startup fails partially
        if ble_task and not ble_task.done():
            ble_task.cancel()
        if scanner:
            try: await scanner.stop()
            except Exception: pass # Ignore errors during cleanup
        if db:
            try: await db.close()
            except Exception: pass # Ignore errors during cleanup
        app.state.db = None
        app.state.scanner = None
        app.state.ble_task = None
        logger.critical("Application startup failed.")
        # Optionally re-raise or handle differently

    logger.info("Application startup complete.")
    yield # Application runs here
    # Shutdown logic
    logger.info("Starting application shutdown...")
    if hasattr(app.state, 'ble_task') and app.state.ble_task:
        app.state.ble_task.cancel()
        try: await app.state.ble_task
        except asyncio.CancelledError: logger.info("BLE advertisement task cancelled.")
        except Exception as e: logger.error(f"Error during BLE task shutdown: {e}", exc_info=True)

    if hasattr(app.state, 'scanner') and app.state.scanner:
        try:
            logger.info("Stopping BLE scanner...")
            await app.state.scanner.stop()
            logger.info("BLE scanner stopped.")
        except Exception as e: logger.error(f"Error stopping BLE scanner: {e}", exc_info=True)

    if hasattr(app.state, 'db') and app.state.db:
        try:
            logger.info("Closing database connection...")
            await app.state.db.close()
            logger.info("Database connection closed.")
        except Exception as e: logger.error(f"Error closing database connection: {e}", exc_info=True)
    logger.info("Application shutdown complete.")


# Initialize FastAPI app with lifespan manager
app = FastAPI(lifespan=lifespan)

# Allow CORS for simplicity.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Consider restricting this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- GraphQL Router Setup ---
# Mount GraphQL endpoint FIRST
graphql_app = GraphQLRouter(
    schema,
    graphiql=True, # Enable GraphiQL interface at /graphql
)
app.include_router(graphql_app, prefix="/graphql")


# --- Frontend Serving ---
FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../frontend"))
BUILD_DIR = os.path.join(FRONTEND_DIR, "build")

# Mount static files SECOND (for JS, CSS, images etc.)
# html=False prevents it serving index.html for '/'
if os.path.exists(BUILD_DIR):
    app.mount("/static", StaticFiles(directory=os.path.join(BUILD_DIR, "static")), name="static_assets")
else:
    logger.error(f"Frontend build directory '{BUILD_DIR}' or static subfolder not found. Static files will not be served correctly.")

# Serve index.html for SPA routing THIRD (catch-all) - COMMENTED OUT FOR DEV
# @app.get("/{full_path:path}")
# async def serve_spa(full_path: str):
#     index_path = os.path.join(BUILD_DIR, "index.html")
#     if os.path.exists(index_path):
#         # Check if the request looks like it's for a file within the static mount path
#         # This is a simple check, might need refinement depending on asset paths
#         if full_path.startswith("static/"):
#              # Let the static mount handle it (or return 404 if not found there)
#              # This part might be redundant if StaticFiles handles its path correctly
#              # but serves as a fallback concept. A direct 404 might be better here.
#              return Response("Not Found", status_code=404)
#
#         logger.debug(f"Serving index.html for SPA route: /{full_path}")
#         return FileResponse(index_path)
#     else:
#         logger.warning(f"index.html not found at {index_path}. Cannot serve SPA.")
#         return Response("Frontend not found. Please build the frontend application.", status_code=404)


# --- Removed Old Lifecycle Events (@app.on_event) ---
# --- Removed Old Frontend Serving Logic ---


# --- Main Execution ---
if __name__ == "__main__":
    # Build frontend if BUILD_DIR doesn't exist (moved from startup for clarity)
    if not os.path.exists(BUILD_DIR):
        logger.info("Build directory not found. Attempting to build frontend...")
        try:
            subprocess.run(["npm", "install"], cwd=FRONTEND_DIR, check=True, capture_output=True, text=True)
            subprocess.run(["npm", "run", "build"], cwd=FRONTEND_DIR, check=True, capture_output=True, text=True)
            logger.info("Frontend build successful.")
        except FileNotFoundError:
             logger.error("`npm` command not found. Please ensure Node.js and npm are installed and in the system's PATH.")
        except subprocess.CalledProcessError as e:
            logger.error(f"Frontend build failed: {e}", exc_info=True)
            logger.error(f"Stdout: {e.stdout}")
            logger.error(f"Stderr: {e.stderr}")
            # Exit if build fails? Or continue without frontend? Let's exit for now.
            logger.critical("Exiting due to frontend build failure.")
            exit(1) # Exit if build fails

    # Uvicorn setup
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    reload = os.getenv("RELOAD", "false").lower() == "true"
    if reload:
        logger.warning("Running with reload=True. BLE state might be inconsistent across reloads.")

    logger.info(f"Starting Uvicorn server on {host}:{port} with reload={reload}")
    uvicorn.run(
        "backend.web_backend:app",
        host=host,
        port=port,
        reload=reload,
    )