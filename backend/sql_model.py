import os
import aiosqlite
import sqlite3
import datetime # Added for type hinting
import logging # Added logging import
from typing import Optional, List, Dict, Any # Added for type hinting

# Configure logger for this module
logger = logging.getLogger(__name__)
# Basic config if run standalone (won't hurt if already configured by another module)
if not logging.getLogger().hasHandlers():
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')


class SqlModel:
    def __init__(self, db_path: Optional[str] = None):
        """
        Initialize the SqlModel.
        """
        if db_path is None:
            base_dir = os.path.dirname(os.path.abspath(os.path.join(__file__, "..")))
            self.db_dir = os.path.join(base_dir, "data")
            os.makedirs(self.db_dir, exist_ok=True)
            self.db_path = os.path.join(self.db_dir, "sensor_data.db")
        else:
            self.db_path = db_path
            self.db_dir = os.path.dirname(db_path)
            if self.db_dir:
                os.makedirs(self.db_dir, exist_ok=True)
        self.conn = None  # Will be set in the async create() method.
        logger.info(f"SqlModel initialized with db_path: {self.db_path}")

    @classmethod
    async def create(cls, db_path: Optional[str] = None):
        """
        Asynchronously create an instance of SqlModel and initialize the database.
        """
        self = cls(db_path)
        try:
            self.conn = await aiosqlite.connect(self.db_path, detect_types=sqlite3.PARSE_DECLTYPES)
            # Use Row factory for dict-like access
            self.conn.row_factory = aiosqlite.Row
            await self.conn.execute("PRAGMA foreign_keys = ON")
            await self._initialize_db()
            logger.info(f"Database connection established and initialized: {self.db_path}")
        except aiosqlite.Error as e:
            logger.error(f"Failed to connect or initialize database at {self.db_path}: {e}", exc_info=True)
            raise # Re-raise the exception after logging
        return self

    async def _initialize_db(self):
        """
        Creates the necessary tables and indices if they do not exist.
        """
        logger.debug(f"Initializing database schema in {self.db_path}...")
        cursor = await self.conn.cursor()
        try:
            await cursor.execute("""
                CREATE TABLE IF NOT EXISTS devices (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sp_id INTEGER UNIQUE,
                    ble_id VARCHAR(128) UNIQUE
                )
            """)
            await cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_sp_id ON devices(sp_id)")
            await cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_ble_id ON devices(ble_id)")

            await cursor.execute("""
                CREATE TABLE IF NOT EXISTS samples (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    device_sp_id INTEGER,
                    created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    temperature_c REAL,
                    humidity REAL,
                    FOREIGN KEY (device_sp_id) REFERENCES devices(sp_id)
                )
            """)
            await cursor.execute("CREATE INDEX IF NOT EXISTS idx_samples_device_sp_id ON samples(device_sp_id)")
            # Add index on created_on for faster latest sample lookup
            await cursor.execute("CREATE INDEX IF NOT EXISTS idx_samples_created_on ON samples(created_on DESC)")


            await cursor.execute("""
                CREATE TABLE IF NOT EXISTS device_names (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    device_sp_id INTEGER UNIQUE, -- Made unique to simplify upsert logic
                    name VARCHAR(255),
                    FOREIGN KEY (device_sp_id) REFERENCES devices(sp_id)
                )
            """)
            # Add index for device_sp_id in device_names
            await cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_device_names_device_sp_id ON device_names(device_sp_id)")
            await self.conn.commit()
            logger.debug("Database schema initialization complete.")
        except aiosqlite.Error as e:
            logger.error(f"Error during database schema initialization: {e}", exc_info=True)
            await self.conn.rollback() # Rollback any partial changes
            raise
        finally:
            await cursor.close()

    async def add_device(self, sp_id: int, ble_id: str) -> int:
        """
        Insert a new device into the devices table.
        Returns the auto-generated 'id' of the new device.
        """
        logger.debug(f"Attempting to add device: sp_id={sp_id}, ble_id={ble_id}")
        cursor = await self.conn.cursor()
        try:
            await cursor.execute("INSERT INTO devices (sp_id, ble_id) VALUES (?, ?)", (sp_id, ble_id))
            await self.conn.commit()
            device_id = cursor.lastrowid
            logger.info(f"Successfully added device: id={device_id}, sp_id={sp_id}, ble_id={ble_id}")
        except aiosqlite.IntegrityError as e:
            await self.conn.rollback()
            logger.error(f"Integrity error inserting device (sp_id={sp_id}, ble_id={ble_id}): {e}")
            raise ValueError(f"Error inserting device: {e}") # Keep raising ValueError for consistency
        except aiosqlite.Error as e:
            await self.conn.rollback()
            logger.error(f"Database error inserting device (sp_id={sp_id}, ble_id={ble_id}): {e}", exc_info=True)
            raise # Re-raise other DB errors
        finally:
            await cursor.close()
        return device_id

    async def add_sample(self, device_sp_id: int, temperature_c: float, humidity: float) -> int:
        """
        Insert a new sample into the samples table.
        Returns the auto-generated 'id' of the new sample.
        """
        logger.debug(f"Attempting to add sample for device_sp_id={device_sp_id}: temp={temperature_c}, hum={humidity}")
        cursor = await self.conn.cursor()
        try:
            await cursor.execute("""
                INSERT INTO samples (device_sp_id, temperature_c, humidity)
                VALUES (?, ?, ?)
            """, (device_sp_id, temperature_c, humidity))
            await self.conn.commit()
            sample_id = cursor.lastrowid
            logger.debug(f"Successfully added sample: id={sample_id} for device_sp_id={device_sp_id}")
        except aiosqlite.IntegrityError as e: # Likely foreign key constraint failure
            await self.conn.rollback()
            logger.error(f"Integrity error inserting sample for device_sp_id={device_sp_id}: {e}")
            # Check if device exists before raising, provide more context
            exists = await self.device_sp_id_exists(device_sp_id)
            if not exists:
                 raise ValueError(f"Error inserting sample: Device with sp_id {device_sp_id} does not exist.")
            else:
                 raise ValueError(f"Error inserting sample: {e}")
        except aiosqlite.Error as e:
            await self.conn.rollback()
            logger.error(f"Database error inserting sample for device_sp_id={device_sp_id}: {e}", exc_info=True)
            raise # Re-raise other DB errors
        finally:
            await cursor.close()
        return sample_id

    # Removed add_device_name as update_device_name now handles inserts (upsert)

    async def device_exists(self, ble_id: str) -> bool:
        """
        Check if a device with the given BLE identifier is already in the devices table.
        """
        logger.debug(f"Checking existence for ble_id={ble_id}")
        cursor = await self.conn.cursor()
        await cursor.execute("SELECT 1 FROM devices WHERE ble_id = ?", (ble_id,))
        exists = await cursor.fetchone() is not None
        await cursor.close()
        logger.debug(f"Device existence check for ble_id={ble_id}: {exists}")
        return exists

    async def device_sp_id_exists(self, sp_id: int) -> bool:
        """ Check if a device with the given sp_id exists. """
        logger.debug(f"Checking existence for sp_id={sp_id}")
        cursor = await self.conn.cursor()
        await cursor.execute("SELECT 1 FROM devices WHERE sp_id = ?", (sp_id,))
        exists = await cursor.fetchone() is not None
        await cursor.close()
        logger.debug(f"Device existence check for sp_id={sp_id}: {exists}")
        return exists

    async def get_device_sp_id(self, ble_id: str) -> Optional[int]:
        """
        Retrieve the sp_id for the device with the given BLE identifier.
        Returns None if the device is not found.
        """
        logger.debug(f"Getting sp_id for ble_id={ble_id}")
        cursor = await self.conn.cursor()
        await cursor.execute("SELECT sp_id FROM devices WHERE ble_id = ?", (ble_id,))
        row = await cursor.fetchone()
        await cursor.close()
        sp_id = row['sp_id'] if row else None
        logger.debug(f"Retrieved sp_id={sp_id} for ble_id={ble_id}")
        return sp_id # Access by column name due to row_factory

    # --- New methods ---

    async def get_samples_for_export(self, begin_dt: datetime.datetime, end_dt: datetime.datetime) -> List[aiosqlite.Row]:
        """
        Retrieve samples within a date range, joined with device names, for CSV export.
        Returns a list of rows.
        """
        logger.debug(f"Fetching samples for export from {begin_dt} to {end_dt}")
        query = """
          SELECT s.id, s.device_sp_id, s.created_on, s.temperature_c, s.humidity, COALESCE(dn.name, '') AS friendly_name
          FROM samples s
          LEFT JOIN device_names dn ON s.device_sp_id = dn.device_sp_id
          WHERE s.created_on BETWEEN ? AND ?
          ORDER BY s.created_on ASC -- Added ordering
        """
        cursor = await self.conn.execute(query, (begin_dt, end_dt))
        rows = await cursor.fetchall()
        await cursor.close()
        logger.debug(f"Retrieved {len(rows)} samples for export.")
        return rows

    async def get_all_sensors_with_names(self) -> List[Dict[str, Any]]:
        """
        Retrieve all devices along with their friendly names.
        Returns a list of dictionaries.
        """
        logger.debug("Fetching all sensors with names.")
        query = """
           SELECT
               d.sp_id,
               d.ble_id,
               COALESCE(dn.name, '') as friendly_name
           FROM devices d
           LEFT JOIN device_names dn ON d.sp_id = dn.device_sp_id
           ORDER BY d.sp_id ASC
        """
        cursor = await self.conn.execute(query)
        rows = await cursor.fetchall()
        await cursor.close()
        # Convert Row objects to dictionaries
        sensors = [dict(row) for row in rows]
        logger.debug(f"Retrieved {len(sensors)} sensors.")
        return sensors

    async def get_latest_sample_for_all_sensors(self) -> Dict[int, Dict[str, Any]]:
        """
        Retrieve the most recent sample (temperature, humidity, timestamp) for each sensor.
        Returns a dictionary mapping sp_id to its latest sample data.
        """
        logger.debug("Fetching latest sample for all sensors.")
        query = """
            WITH LatestSamples AS (
                SELECT
                    device_sp_id,
                    temperature_c,
                    humidity,
                    created_on,
                    ROW_NUMBER() OVER(PARTITION BY device_sp_id ORDER BY created_on DESC) as rn
                FROM samples
            )
            SELECT
                device_sp_id,
                temperature_c,
                humidity,
                created_on
            FROM LatestSamples
            WHERE rn = 1;
        """
        cursor = await self.conn.execute(query)
        rows = await cursor.fetchall()
        await cursor.close()

        latest_samples_map = {row['device_sp_id']: dict(row) for row in rows}
        logger.debug(f"Retrieved latest samples for {len(latest_samples_map)} sensors.")
        return latest_samples_map


    async def update_device_name(self, device_sp_id: int, name: str):
        """
        Update or insert the friendly name for a given device (upsert).
        """
        logger.debug(f"Updating/inserting name='{name}' for device_sp_id={device_sp_id}")
        query = """
            INSERT INTO device_names (device_sp_id, name) VALUES (?, ?)
            ON CONFLICT(device_sp_id) DO UPDATE SET name = excluded.name;
        """
        cursor = await self.conn.cursor()
        try:
            # First, ensure the device_sp_id exists in the devices table
            if not await self.device_sp_id_exists(device_sp_id):
                 raise ValueError(f"Cannot update name: Device with sp_id {device_sp_id} does not exist.")

            await cursor.execute(query, (device_sp_id, name))
            await self.conn.commit()
            logger.info(f"Successfully updated/inserted name='{name}' for device_sp_id={device_sp_id}")
        except aiosqlite.Error as e:
            await self.conn.rollback()
            logger.error(f"Error updating/inserting device name for sp_id={device_sp_id}: {e}", exc_info=True)
            # Re-raise as ValueError for consistency with other methods? Or keep DB error?
            # Let's keep ValueError for application-level issues like non-existent device,
            # and let DB errors propagate if they are unexpected.
            if isinstance(e, aiosqlite.IntegrityError): # Should not happen with upsert unless FK fails (which we check)
                 raise ValueError(f"Integrity error updating/inserting device name: {e}")
            else:
                 raise # Re-raise other DB errors
        finally:
            await cursor.close()

    async def get_sensor_by_sp_id(self, sp_id: int) -> Optional[Dict[str, Any]]:
        """
        Retrieve a single sensor's details (sp_id, ble_id, friendly_name) by its sp_id.
        Returns a dictionary or None if not found.
        """
        logger.debug(f"Fetching sensor details for sp_id={sp_id}")
        query = """
          SELECT d.sp_id, d.ble_id, COALESCE(dn.name, '') as friendly_name
          FROM devices d
          LEFT JOIN device_names dn ON d.sp_id = dn.device_sp_id
          WHERE d.sp_id = ?
        """
        cursor = await self.conn.execute(query, (sp_id,))
        row = await cursor.fetchone()
        await cursor.close()
        sensor = dict(row) if row else None
        logger.debug(f"Retrieved sensor details for sp_id={sp_id}: {sensor}")
        return sensor

    # --- End New methods ---

    async def close(self):
        """Closes the database connection."""
        if self.conn:
            logger.info(f"Closing database connection: {self.db_path}")
            await self.conn.close()
            self.conn = None # Ensure connection is marked as closed
        else:
            logger.warning("Attempted to close an already closed or uninitialized database connection.")

# Example usage:
if __name__ == '__main__':
    import asyncio
    # Configure logging specifically for the example run
    example_logger = logging.getLogger('sql_model_example')
    example_logger.setLevel(logging.DEBUG) # Show debug messages for example
    handler = logging.StreamHandler()
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    handler.setFormatter(formatter)
    if not example_logger.hasHandlers(): # Avoid adding multiple handlers if run multiple times
        example_logger.addHandler(handler)
        example_logger.propagate = False # Don't propagate to root logger if we have our own handler

    async def main():
        # Use an in-memory DB for example
        db_model = None # Initialize to None
        try:
            db_model = await SqlModel.create(":memory:")
            example_logger.info("DB Initialized.") # Replaced print

            # Add a device
            try:
                device_id = await db_model.add_device(1001, "BLE-1234567890")
                example_logger.info(f"Added device with id: {device_id}, sp_id: 1001") # Replaced print
                device_id_2 = await db_model.add_device(1002, "BLE-ABCDEFGHIJ")
                example_logger.info(f"Added device with id: {device_id_2}, sp_id: 1002") # Replaced print
            except ValueError as err:
                example_logger.error(err) # Replaced print

            # Log some sample readings
            try:
                now = datetime.datetime.now()
                sample_id_1 = await db_model.add_sample(1001, temperature_c=23.5, humidity=45.2)
                example_logger.info(f"Added sample with id: {sample_id_1}") # Replaced print
                await asyncio.sleep(0.1) # Ensure different timestamp
                sample_id_2 = await db_model.add_sample(1002, temperature_c=21.0, humidity=50.0)
                example_logger.info(f"Added sample with id: {sample_id_2}") # Replaced print
                await asyncio.sleep(0.1)
                sample_id_3 = await db_model.add_sample(1001, temperature_c=23.8, humidity=45.5)
                example_logger.info(f"Added sample with id: {sample_id_3}") # Replaced print
            except ValueError as err:
                example_logger.error(err) # Replaced print

            # Associate names with devices
            try:
                await db_model.update_device_name(1001, "Outdoor Sensor")
                example_logger.info(f"Set name for device 1001") # Replaced print
                await db_model.update_device_name(1002, "Indoor Sensor")
                example_logger.info(f"Set name for device 1002") # Replaced print
                # Update name
                await db_model.update_device_name(1001, "Garden Sensor")
                example_logger.info(f"Updated name for device 1001") # Replaced print
            except ValueError as err:
                example_logger.error(err) # Replaced print

            # Test get_all_sensors_with_names
            example_logger.info("\nTesting get_all_sensors_with_names:") # Replaced print
            sensors = await db_model.get_all_sensors_with_names()
            example_logger.info(sensors) # Replaced print

            # Test get_latest_sample_for_all_sensors
            example_logger.info("\nTesting get_latest_sample_for_all_sensors:") # Replaced print
            latest_samples = await db_model.get_latest_sample_for_all_sensors()
            example_logger.info(latest_samples) # Replaced print


            # Test get_samples_for_export
            example_logger.info("\nTesting get_samples_for_export:") # Replaced print
            start_time = now - datetime.timedelta(seconds=1)
            end_time = now + datetime.timedelta(seconds=1)
            samples = await db_model.get_samples_for_export(start_time, end_time)
            for sample in samples:
                example_logger.info(dict(sample)) # Replaced print, print as dict for readability

        except Exception as e:
             example_logger.error(f"An error occurred during the main example execution: {e}", exc_info=True)
        finally:
            # Close the connection when done
            if db_model:
                await db_model.close()
                example_logger.info("\nDB Closed.") # Replaced print

    asyncio.run(main())
