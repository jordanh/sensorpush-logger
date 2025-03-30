import React, { useEffect, useState, useMemo } from "react";
import { gql, useSubscription, useQuery } from "@apollo/client";
import {
  Container,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
} from "@mui/material";
import EditableFriendlyNameCell from "../components/EditableFriendlyNameCell"; // Import the new component

// GraphQL Definitions using camelCase
const SENSOR_UPDATES_SUBSCRIPTION = gql`
  subscription SensorUpdates {
    sensorUpdates {
      deviceSpId
      friendlyName
      temperatureC
      humidity
      createdOn
    }
  }
`;

const GET_SENSORS_QUERY = gql`
  query GetSensors {
    sensors {
      spId
      bleId
      friendlyName
      lastUpdate
      # Add fields for last known values from initial query
      lastTemperatureC
      lastHumidity
    }
  }
`;

// Interfaces for GraphQL data using camelCase
interface SensorUpdatePayload {
  deviceSpId: number;
  friendlyName: string;
  temperatureC: number;
  humidity: number;
  createdOn: string;
}

interface SensorQueryItem {
  spId: number;
  bleId: string;
  friendlyName: string;
  lastUpdate: string | null;
  // Add fields for last known values from initial query
  lastTemperatureC: number | null;
  lastHumidity: number | null;
}

interface GetSensorsData {
  sensors: SensorQueryItem[];
}

interface SensorUpdateData {
  sensorUpdates: SensorUpdatePayload;
}

// Interface for component state - align with GraphQL names (camelCase)
interface SensorState {
  spId: number;
  friendlyName: string;
  temperature?: number; // Keep internal state name simple
  humidity?: number; // Keep internal state name simple
  lastUpdateStr?: string; // Formatted string for display
  lastUpdateTs?: number; // Timestamp (ms) for sorting
  highlight: "new" | "updated" | "";
}

// Helper to convert ISO string or null to timestamp number or undefined
const parseTimestamp = (isoString: string | null | undefined): number | undefined => {
  if (!isoString) return undefined;
  try {
    return new Date(isoString).getTime();
  } catch (e) {
    return undefined;
  }
};

// Helper to format timestamp number or undefined to locale string or '-'
const formatTimestamp = (timestamp: number | undefined): string => {
  if (timestamp === undefined) return "-";
  try {
    return new Date(timestamp).toLocaleString();
  } catch (e) {
    return "-";
  }
};


const Dashboard = () => {
  // Use spId as the key for the Map
  const [sensors, setSensors] = useState<Map<number, SensorState>>(new Map());

  // Fetch initial list of sensors
  const {
    data: initialSensorsData,
    loading: initialLoading,
    error: initialError
  } = useQuery<GetSensorsData>(GET_SENSORS_QUERY, {
    fetchPolicy: "cache-and-network", // Fetch from network even if in cache initially
  });

  // Subscribe to real-time updates
  const {
    data: subscriptionData,
    loading: subscriptionLoading, // Can be ignored or used for a subtle indicator
    error: subscriptionError
  } = useSubscription<SensorUpdateData>(SENSOR_UPDATES_SUBSCRIPTION);

  // Effect to load initial sensors from query result
  useEffect(() => {
    if (initialSensorsData?.sensors) {
      setSensors((prevSensors) => {
        const newSensors = new Map(prevSensors);
        initialSensorsData.sensors.forEach(sensor => {
          // Use camelCase fields from query data
          if (!newSensors.has(sensor.spId)) {
            const lastUpdateTs = parseTimestamp(sensor.lastUpdate);
            newSensors.set(sensor.spId, {
              spId: sensor.spId,
              friendlyName: sensor.friendlyName || `Sensor ${sensor.spId}`,
              // Populate initial temp/humidity from query result
              temperature: sensor.lastTemperatureC ?? undefined,
              humidity: sensor.lastHumidity ?? undefined,
              lastUpdateTs: lastUpdateTs,
              lastUpdateStr: formatTimestamp(lastUpdateTs),
              highlight: "", // No highlight for initial load
            });
          } else {
            // Optionally update existing sensor if query data is newer?
            // For now, we prioritize subscription updates for existing sensors.
            // Could compare sensor.lastUpdate timestamp if needed.
          }
        });
        return newSensors;
      });
    }
  }, [initialSensorsData]);

  // Effect to handle incoming subscription data
  useEffect(() => {
    if (subscriptionData?.sensorUpdates) {
      const update = subscriptionData.sensorUpdates;
      setSensors((prevSensors) => {
        const newSensors = new Map(prevSensors);
        // Use camelCase fields from subscription data
        const existingSensor = newSensors.get(update.deviceSpId);
        const isNew = !existingSensor;
        const newHighlight = isNew ? "new" : "updated";
        const lastUpdateTs = parseTimestamp(update.createdOn);

        const updatedSensor: SensorState = {
          spId: update.deviceSpId,
          friendlyName: update.friendlyName || `Sensor ${update.deviceSpId}`,
          temperature: update.temperatureC,
          humidity: update.humidity,
          lastUpdateTs: lastUpdateTs,
          lastUpdateStr: formatTimestamp(lastUpdateTs),
          highlight: newHighlight,
        };

        newSensors.set(update.deviceSpId, updatedSensor);
        return newSensors;
      });
    }
  }, [subscriptionData]);

  // Effect to clear highlights after 3 seconds
  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];
    sensors.forEach((sensor) => {
      if (sensor.highlight !== "") {
        const timer = setTimeout(() => {
          setSensors((prevSensors) => {
            const newSensors = new Map(prevSensors);
            const currentSensor = newSensors.get(sensor.spId);
            if (currentSensor && currentSensor.highlight !== "") {
              newSensors.set(sensor.spId, { ...currentSensor, highlight: "" });
              return newSensors;
            }
            return prevSensors;
          });
        }, 3000);
        timers.push(timer);
      }
    });
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [sensors]);

  // Styling logic
  const baseStyle = { backgroundColor: "white", transition: "background-color 1s ease" };
  const getRowStyle = (highlight: "new" | "updated" | "") => {
    if (highlight === "new") return { ...baseStyle, backgroundColor: "lightgreen" };
    if (highlight === "updated") return { ...baseStyle, backgroundColor: "lightyellow" };
    return baseStyle;
  };

  // Memoized sorted sensor list for rendering
  const sortedSensors = useMemo(() => {
    return Array.from(sensors.values()).sort((a, b) => {
      const tsA = a.lastUpdateTs ?? -Infinity;
      const tsB = b.lastUpdateTs ?? -Infinity;
      return tsB - tsA; // Sort descending by timestamp
    });
  }, [sensors]);

  // Combined loading state
  const isLoading = initialLoading; // Primarily wait for initial load

  return (
    <Container>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>
      {isLoading && <CircularProgress />}
      {initialError && <Alert severity="error">Error loading initial sensors: {initialError.message}</Alert>}
      {/* Display subscription error separately, less critical than initial load */}
      {subscriptionError && !isLoading && <Alert severity="warning" sx={{ mt: 1 }}>Subscription error: {subscriptionError.message}</Alert>}
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Friendly Name</TableCell>
            <TableCell>Sensor ID</TableCell>
            <TableCell>Temperature (°C)</TableCell>
            <TableCell>Humidity (%)</TableCell>
            <TableCell>Last Update</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sortedSensors.map((sensor) => (
            <TableRow key={sensor.spId} sx={getRowStyle(sensor.highlight)}>
              {/* Replace static cell with the editable component */}
              <EditableFriendlyNameCell spId={sensor.spId} initialName={sensor.friendlyName} />
              <TableCell>{sensor.spId}</TableCell>
              <TableCell>{sensor.temperature?.toFixed(2) ?? "-"}</TableCell>
              <TableCell>{sensor.humidity?.toFixed(2) ?? "-"}</TableCell>
              <TableCell>{sensor.lastUpdateStr ?? "-"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Container>
  );
};

export default Dashboard;