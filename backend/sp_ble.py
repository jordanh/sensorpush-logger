import asyncio
import datetime
import logging # Added logging import
from bleak import BleakScanner, BleakClient
from bluetooth_sensor_state_data import BluetoothServiceInfo
from sensorpush_ble import SensorPushBluetoothDeviceData
from sensor_state_data import DeviceKey

# --- Configure Logging ---
# Get the logger instance. It will inherit the basic config from the root logger if set up elsewhere (e.g., in web_backend.py)
# Or configure it specifically if this module is run independently.
logger = logging.getLogger(__name__)
# Basic config if run standalone (won't hurt if already configured)
if not logging.getLogger().hasHandlers():
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')


DEVICE_NAME = "SensorPush"
SP_GATT_CHAR_DEVICE_ID = "EF090001-11D6-42BA-93B8-9DD7EC090AA9"

async def read_device_id(device, db):
    """Connect to the BLE device, read the uint32 device ID, and add the device to the DB."""
    logger.info(f"Attempting to read device ID from {device.address}")
    try:
        async with BleakClient(device) as client:
            raw_val = await client.read_gatt_char(SP_GATT_CHAR_DEVICE_ID)
            if raw_val and len(raw_val) >= 4:
                sp_id = int.from_bytes(raw_val[:4], byteorder="little")
                logger.info(f"Read DeviceId: {sp_id} (hex: {hex(sp_id)}) from {device.address}") # Replaced print
                try:
                    await db.add_device(sp_id, device.address)
                    logger.info(f"Device {device.address} added with sp_id {sp_id}.") # Replaced print
                except ValueError as e:
                    logger.error(f"Error adding device {device.address} (sp_id: {sp_id}) to DB: {e}", exc_info=True) # Replaced print
            else:
                logger.error(f"Received insufficient data ({len(raw_val)} bytes) when reading device ID from {device.address}.") # Replaced print
    except Exception as e:
        logger.error(f"Error reading device ID from {device.address}: {e}", exc_info=True) # Replaced print, added exc_info

async def process_advertisement_event(device, advertisement_data, scanner, db, on_sample=None):
    """
    Process a single advertisement event.
    If the device is supported and not already known in the DB,
    stop scanning to perform a GATT read and add the device.
    Otherwise, add a sample reading for the known device.
    If a sample is added, call the on_sample callback with sample data.
    """
    service_info = BluetoothServiceInfo(
        name=device.name or "Unknown",
        address=device.address,
        rssi=advertisement_data.rssi,
        manufacturer_data=advertisement_data.manufacturer_data,
        service_data=advertisement_data.service_data,
        service_uuids=advertisement_data.service_uuids,
        source="bleak",
    )

    sensorpush_data = SensorPushBluetoothDeviceData()
    if sensorpush_data.supported(service_info):
        sensorpush_data.update(service_info)
        temperature_key = DeviceKey("temperature")
        humidity_key = DeviceKey("humidity")
        signal_strength_key = DeviceKey("signal_strength")
        temperature = sensorpush_data._sensor_values.get(temperature_key)
        humidity = sensorpush_data._sensor_values.get(humidity_key)
        signal_strength = sensorpush_data._sensor_values.get(signal_strength_key)

        # Log device info at DEBUG level to reduce noise unless needed
        logger.info(f"Device: {service_info.name} ({service_info.address}) RSSI: {service_info.rssi}") # Replaced print, changed level
        if temperature is not None:
            logger.info(f"  Temperature: {temperature.native_value:.2f} °C") # Replaced print, changed level
        if humidity is not None:
            logger.info(f"  Humidity: {humidity.native_value:.2f} %") # Replaced print, changed level
        if signal_strength is not None:
            logger.info(f"  Signal Strength: {signal_strength.native_value} dBm") # Replaced print, changed level

        try:
            device_known = await db.device_exists(service_info.address)
            if not device_known:
                logger.info(f"Device not known ({service_info.address}). Initiating GATT read.") # Replaced print
                # Stop scanning temporarily to connect and read GATT characteristic
                await scanner.stop()
                logger.info(f"Scanner stopped for GATT read ({service_info.address}).")
                await read_device_id(device, db)
                logger.info(f"Scanner restarting after GATT read ({service_info.address}).")
                await scanner.start()
            else:
                sp_id = await db.get_device_sp_id(service_info.address)
                if sp_id is not None and temperature is not None and humidity is not None:
                    try:
                        await db.add_sample(sp_id, temperature.native_value, humidity.native_value)
                        logger.info(f"Added sample for device {service_info.address} (sp_id: {sp_id}).") # Replaced print, changed level
                        if on_sample:
                            sample_data = {
                                "device": service_info.address,
                                "sp_id": sp_id, # Include sp_id for frontend use
                                "temperature": temperature.native_value,
                                "humidity": humidity.native_value,
                                "rssi": service_info.rssi, # Include RSSI
                                "timestamp": datetime.datetime.utcnow().isoformat() + "Z" # Add Z for UTC
                            }
                            # Use create_task to avoid blocking the advertisement loop if broadcast is slow
                            asyncio.create_task(on_sample(sample_data))
                    except ValueError as e:
                        logger.error(f"Error adding sample for {service_info.address} (sp_id: {sp_id}): {e}", exc_info=True) # Replaced print
                elif sp_id is None:
                     logger.warning(f"Device {service_info.address} exists but failed to retrieve sp_id.")
                # else: No temp/humidity data in this advertisement, skip sample add

        except Exception as e:
            logger.error(f"Error processing advertisement for {service_info.address}: {e}", exc_info=True)

    else:
        # Optionally log unsupported devices at DEBUG level
        logger.debug(f"Ignoring unsupported device: {service_info.address} ({service_info.name})")
        pass

# Global queue to store advertisement events.
advertisement_queue = asyncio.Queue()

def handle_advertisement(device, advertisement_data):
    """Queue the advertisement event for asynchronous processing."""
    # Use call_soon_threadsafe if handle_advertisement might be called from a different thread than the event loop
    # For Bleak's default behavior, create_task should be fine.
    asyncio.create_task(advertisement_queue.put((device, advertisement_data)))

def create_scanner():
    logger.info("Creating BleakScanner...")
    return BleakScanner(detection_callback=handle_advertisement)

async def advertisement_loop(scanner, db, on_sample=None):
    """
    Continuously drain the advertisement queue and process each event.
    """
    logger.info("Starting advertisement processing loop...")
    while True:
        try:
            device, advertisement_data = await advertisement_queue.get()
            logger.debug(f"Processing advertisement from queue for {device.address}")
            await process_advertisement_event(device, advertisement_data, scanner, db, on_sample=on_sample)
            advertisement_queue.task_done()
        except asyncio.CancelledError:
            logger.info("Advertisement loop cancelled.")
            break
        except Exception as e:
            # Log errors in the loop itself to prevent it from crashing
            logger.error(f"Error in advertisement loop: {e}", exc_info=True)
            # Avoid tight loop on continuous errors
            await asyncio.sleep(1)