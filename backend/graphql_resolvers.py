import asyncio
import datetime
import logging
from typing import List, AsyncGenerator, Dict, Any, Optional

import strawberry
from strawberry.fastapi import BaseContext
from strawberry.types import Info # Import Info type

from .sql_model import SqlModel
from .graphql_schema import Sensor, Sample, LogMessage # Import GraphQL types, including LogMessage

# --- Globals / State (Simplified for now) ---
# Queue for broadcasting samples to subscribers
sample_queue = asyncio.Queue()
# Queue for broadcasting log messages to subscribers
log_queue = asyncio.Queue()

logger = logging.getLogger(__name__)

# --- Helper to get DB from context ---
def get_db_from_info(info: Info) -> SqlModel:
    """Extracts the DB instance from the Strawberry Info context."""
    # Assumes the DB is stored in app.state.db and accessible via request context
    # Strawberry's FastAPI integration typically puts the request in info.context['request']
    request = info.context.get('request')
    if not request:
        # This might happen during subscription testing or if context setup differs
        logger.error("Request context not found in Strawberry Info. Cannot get DB.")
        raise RuntimeError("Request context not found in Strawberry Info.")

    db = getattr(request.app.state, 'db', None)
    if not db:
        logger.error("Database instance not found in application state (app.state.db).")
        raise RuntimeError("Database instance not found in application state (app.state.db).")
    return db

# --- Query Resolvers ---

async def get_sensors_resolver(info: Info) -> List[Sensor]:
    """Resolves the 'sensors' query, including the latest sample data."""
    logger.debug("Resolving sensors query with latest sample data")
    try:
        db = get_db_from_info(info)
        # Fetch base sensor details (sp_id, ble_id, friendly_name)
        sensor_base_data = await db.get_all_sensors_with_names()
        # Fetch the latest sample for all sensors in one go
        latest_samples_map = await db.get_latest_sample_for_all_sensors()

        sensors = []
        for s_base in sensor_base_data:
            sp_id = s_base['sp_id']
            latest_sample = latest_samples_map.get(sp_id)

            last_update_dt = None
            last_temp = None
            last_hum = None

            if latest_sample:
                last_update_val = latest_sample.get('created_on')
                last_temp = latest_sample.get('temperature_c')
                last_hum = latest_sample.get('humidity')

                # Ensure last_update is a datetime object
                if isinstance(last_update_val, str):
                    try:
                        last_update_dt = datetime.datetime.fromisoformat(last_update_val.replace("Z", "+00:00"))
                    except (ValueError, TypeError):
                        logger.warning(f"Could not parse last_update string '{last_update_val}' for sensor {sp_id}")
                elif isinstance(last_update_val, datetime.datetime):
                    last_update_dt = last_update_val

            sensors.append(Sensor(
                sp_id=sp_id,
                ble_id=s_base['ble_id'],
                friendly_name=s_base['friendly_name'],
                last_update=last_update_dt,
                last_temperature_c=last_temp,
                last_humidity=last_hum
            ))
        logger.debug(f"Returning {len(sensors)} sensors with latest data")
        return sensors
    except Exception as e:
        logger.error(f"Error resolving sensors query: {e}", exc_info=True)
        # Return empty list on error to avoid breaking the client query
        return []

async def get_samples_resolver(info: Info, begin: datetime.datetime, end: datetime.datetime) -> List[Sample]:
    """Resolves the 'samples' query."""
    logger.debug(f"Resolving samples query from {begin} to {end}")
    try:
        db = get_db_from_info(info)
        # SqlModel returns Row objects which are dict-like
        sample_rows = await db.get_samples_for_export(begin, end)
        # Map Row objects to Sample objects
        samples = [
            Sample(
                device_sp_id=row['device_sp_id'],
                friendly_name=row['friendly_name'], # Already joined in the SQL query
                temperature_c=row['temperature_c'],
                humidity=row['humidity'],
                created_on=row['created_on']
            ) for row in sample_rows
        ]
        logger.debug(f"Returning {len(samples)} samples")
        return samples
    except Exception as e:
        logger.error(f"Error resolving samples query: {e}", exc_info=True)
        return [] # Return empty list on error

# --- Mutation Resolvers ---

async def update_sensor_name_resolver(info: Info, sp_id: int, name: str) -> Sensor:
    """Resolves the 'updateSensorName' mutation."""
    logger.debug(f"Resolving updateSensorName mutation for sp_id={sp_id}, name='{name}'")
    try:
        db = get_db_from_info(info)
        await db.update_device_name(sp_id, name)
        # Fetch the updated sensor data to return, including latest sample
        updated_sensor_data = await db.get_sensor_by_sp_id(sp_id)
        if updated_sensor_data:
            latest_sample_map = await db.get_latest_sample_for_all_sensors() # Could optimize to get only for this sp_id
            latest_sample = latest_sample_map.get(sp_id)

            last_update_dt = None
            last_temp = None
            last_hum = None
            if latest_sample:
                last_update_val = latest_sample.get('created_on')
                last_temp = latest_sample.get('temperature_c')
                last_hum = latest_sample.get('humidity')
                if isinstance(last_update_val, str):
                    try:
                        last_update_dt = datetime.datetime.fromisoformat(last_update_val.replace("Z", "+00:00"))
                    except (ValueError, TypeError): pass # Ignore parse error
                elif isinstance(last_update_val, datetime.datetime):
                    last_update_dt = last_update_val

            sensor = Sensor(
                sp_id=updated_sensor_data['sp_id'],
                ble_id=updated_sensor_data['ble_id'],
                friendly_name=updated_sensor_data['friendly_name'],
                last_update=last_update_dt,
                last_temperature_c=last_temp,
                last_humidity=last_hum
            )
            logger.info(f"Successfully updated sensor name for sp_id={sp_id}")
            return sensor
        else:
            # This case should ideally not happen if update_device_name succeeded
            # and didn't raise an error due to non-existent sp_id.
            logger.error(f"Sensor sp_id={sp_id} not found after update attempt.")
            # Raise a GraphQL specific error
            raise strawberry.GraphQLError(f"Sensor with sp_id {sp_id} not found after update.")
    except ValueError as e: # Catch specific errors from SqlModel (e.g., device not found)
         logger.warning(f"Value error updating sensor name for sp_id={sp_id}: {e}")
         raise strawberry.GraphQLError(message=str(e))
    except Exception as e:
        logger.error(f"Error resolving updateSensorName mutation: {e}", exc_info=True)
        raise strawberry.GraphQLError(message="An internal error occurred while updating the sensor name.")


# --- Subscription Logic ---

async def sensor_updates_subscription() -> AsyncGenerator[Sample, None]:
    """Yields new samples as they are published via the sample_queue."""
    logger.info("Client subscribed to sensor updates")
    # Simple queue listener
    # In a multi-worker setup, a more robust pub/sub mechanism (Redis, etc.) would be needed.
    local_queue = asyncio.Queue() # Create a queue for this specific subscriber
    # TODO: Need a mechanism to register/unregister local_queue with a central publisher
    # For now, this simple queue won't receive updates from publish_sample.
    # This needs a proper pub/sub implementation.
    # Let's proceed with the simple queue for now, acknowledging this limitation.
    # A better approach would involve a central broadcaster managing subscriber queues.

    try:
        while True:
            # This will currently block forever as nothing puts items in local_queue
            # We'll use the global sample_queue directly for simplicity,
            # acknowledging it's not ideal for multiple subscribers/scaling.
            sample: Sample = await sample_queue.get()

            # Defensive check: Ensure created_on is a datetime object before yielding
            if isinstance(sample.created_on, str):
                logger.warning(f"Subscription yielding sample with string timestamp '{sample.created_on}', attempting parse.")
                try:
                    sample.created_on = datetime.datetime.fromisoformat(sample.created_on.replace("Z", "+00:00"))
                except (ValueError, TypeError):
                    logger.error(f"Failed to parse string timestamp '{sample.created_on}' during subscription yield. Skipping yield for this field or using fallback?")
                    # Decide how to handle - skip yield? yield with None? For now, log and yield original object.
                    pass # Logged the error, yield as-is or consider modifying

            logger.debug(f"Yielding sample to subscriber: {sample.device_sp_id}")
            yield sample
            sample_queue.task_done()
    except asyncio.CancelledError:
        logger.info("Subscription cancelled by client.")
        # TODO: Unregister local_queue if using a proper pub/sub manager
    except Exception as e:
        logger.error(f"Error in sensor_updates_subscription loop: {e}", exc_info=True)
    finally:
        logger.info("Client unsubscribed from sensor updates.")


async def log_messages_subscription() -> AsyncGenerator[LogMessage, None]:
    """Yields new log messages as they are published via the log_queue."""
    logger.info("Client subscribed to log messages")
    # Similar to sensor_updates, this uses a global queue directly.
    # Not ideal for scaling, but simple for this application.
    try:
        while True:
            log_entry: LogMessage = await log_queue.get()
            logger.debug(f"Yielding log entry to subscriber: {log_entry.level} - {log_entry.message[:50]}...")
            yield log_entry
            log_queue.task_done()
    except asyncio.CancelledError:
        logger.info("Log subscription cancelled by client.")
    except Exception as e:
        logger.error(f"Error in log_messages_subscription loop: {e}", exc_info=True)
    finally:
        logger.info("Client unsubscribed from log messages.")


async def publish_sample(db: SqlModel, sample_data: Dict[str, Any]):
    """
    Takes raw sample data (e.g., from BLE loop), fetches additional info (like name),
    creates a Sample object, and puts it onto the *global* queue for subscribers.
    Requires the DB instance to be passed in.
    Expected sample_data format: {'device': sp_id, 'temperature': float, 'humidity': float, 'timestamp': str (ISO)}
    """
    logger.debug(f"Attempting to publish sample data: {sample_data}")
    # db instance is now passed directly
    try:
        device_sp_id = sample_data.get('sp_id') # Use the correct key 'sp_id'
        temperature = sample_data.get('temperature')
        humidity = sample_data.get('humidity')
        timestamp_str = sample_data.get('timestamp')

        if device_sp_id is None or temperature is None or humidity is None:
            logger.warning(f"Sample data missing required fields (device, temperature, humidity): {sample_data}. Cannot publish.")
            return

        # Fetch the friendly name for the device
        sensor_details = await db.get_sensor_by_sp_id(device_sp_id)
        friendly_name = sensor_details.get('friendly_name', '') if sensor_details else ''

        # Parse the timestamp string if available, otherwise use current time
        created_on_dt = datetime.datetime.now(datetime.timezone.utc) # Default
        if timestamp_str:
            try:
                # Explicitly replace 'Z' with '+00:00' for robust parsing
                timestamp_str_adjusted = timestamp_str.replace("Z", "+00:00")
                created_on_dt = datetime.datetime.fromisoformat(timestamp_str_adjusted)
            except ValueError:
                logger.warning(f"Could not parse timestamp string: {timestamp_str}. Using current time.")

        # Create the Sample object matching the GraphQL schema type
        sample_obj = Sample(
            device_sp_id=device_sp_id,
            friendly_name=friendly_name,
            temperature_c=float(temperature), # Ensure float
            humidity=float(humidity),       # Ensure float
            created_on=created_on_dt
        )

        # Put the sample onto the global queue
        # TODO: Replace with a proper pub/sub mechanism for scalability
        await sample_queue.put(sample_obj)
        logger.debug(f"Sample for device {device_sp_id} put on global queue.")

    except Exception as e:
        logger.error(f"Error during sample publishing: {e}", exc_info=True)