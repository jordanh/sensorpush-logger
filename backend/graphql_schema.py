import strawberry
import datetime
from typing import List, AsyncGenerator, Optional

# --- GraphQL Types ---

@strawberry.type
class Sensor:
    sp_id: int
    ble_id: str # Assuming this is the unique BLE identifier string
    friendly_name: str
    last_update: Optional[datetime.datetime] # Timestamp of the last sample
    # Add fields for the last known values
    last_temperature_c: Optional[float]
    last_humidity: Optional[float]

@strawberry.type
class LogMessage:
    timestamp: datetime.datetime
    message: str
    level: str # e.g., INFO, WARNING, ERROR

@strawberry.type
class Sample:
    # id: int # Primary key from DB, might not be needed for frontend display? Let's include for now.
    device_sp_id: int # Foreign key to Sensor.sp_id
    friendly_name: Optional[str] # Denormalized for convenience in subscription
    temperature_c: float
    humidity: float
    created_on: datetime.datetime # Timestamp of the sample

# --- Input Types (if needed, none for now) ---

# --- Queries ---

@strawberry.type
class Query:
    @strawberry.field
    async def sensors(self, info: strawberry.Info) -> List[Sensor]: # Add info parameter
        # Resolver logic will be in graphql_resolvers.py
        from .graphql_resolvers import get_sensors_resolver
        # Pass info to the resolver
        return await get_sensors_resolver(info)


    @strawberry.field
    async def samples(self, info: strawberry.Info, begin: datetime.datetime, end: datetime.datetime) -> List[Sample]: # Add info
        # Resolver logic will be in graphql_resolvers.py
        from .graphql_resolvers import get_samples_resolver
        # Pass info
        return await get_samples_resolver(info, begin, end)
# --- Mutations ---

@strawberry.type
class Mutation:
    @strawberry.mutation
    async def update_sensor_name(self, info: strawberry.Info, sp_id: int, name: str) -> Sensor: # Add info
        # Resolver logic will be in graphql_resolvers.py
        from .graphql_resolvers import update_sensor_name_resolver
        # Pass info
        return await update_sensor_name_resolver(info, sp_id, name)

# --- Subscriptions ---

@strawberry.type
class Subscription:
    @strawberry.subscription
    async def sensor_updates(self) -> AsyncGenerator[Sample, None]:
        # Subscription logic will be in graphql_resolvers.py
        from .graphql_resolvers import sensor_updates_subscription
        async for sample in sensor_updates_subscription():
            yield sample

    @strawberry.subscription
    async def log_messages(self) -> AsyncGenerator[LogMessage, None]:
        # Subscription logic will be in graphql_resolvers.py
        from .graphql_resolvers import log_messages_subscription
        async for log_entry in log_messages_subscription():
            yield log_entry

# --- Schema ---

schema = strawberry.Schema(
    query=Query,
    mutation=Mutation,
    subscription=Subscription
)