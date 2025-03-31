import React, { useEffect, useState, useMemo } from "react";
import { gql, useSubscription, useQuery } from "@apollo/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"; // Import shadcn/ui Table components
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"; // Import shadcn/ui Alert components
import { Terminal } from "lucide-react"; // Icon for Alert
import EditableFriendlyNameCell from "../components/EditableFriendlyNameCell"; // Keep existing import for now
import { cn } from "@/lib/utils"; // Import the cn utility

// GraphQL Definitions (keep as is)
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
      lastTemperatureC
      lastHumidity
    }
  }
`;

// Interfaces (keep as is)
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
  lastTemperatureC: number | null;
  lastHumidity: number | null;
}

interface GetSensorsData {
  sensors: SensorQueryItem[];
}

interface SensorUpdateData {
  sensorUpdates: SensorUpdatePayload;
}

interface SensorState {
  spId: number;
  friendlyName: string;
  temperature?: number;
  humidity?: number;
  lastUpdateStr?: string;
  lastUpdateTs?: number;
  highlight: "new" | "updated" | "";
}

// Helper functions (keep as is)
const parseTimestamp = (isoString: string | null | undefined): number | undefined => {
  if (!isoString) return undefined;
  try {
    return new Date(isoString).getTime();
  } catch (e) {
    return undefined;
  }
};

const formatTimestamp = (timestamp: number | undefined): string => {
  if (timestamp === undefined) return "-";
  try {
    return new Date(timestamp).toLocaleString();
  } catch (e) {
    return "-";
  }
};


const Dashboard = () => {
  const [sensors, setSensors] = useState<Map<number, SensorState>>(new Map());

  const {
    data: initialSensorsData,
    loading: initialLoading,
    error: initialError
  } = useQuery<GetSensorsData>(GET_SENSORS_QUERY, {
    fetchPolicy: "cache-and-network",
  });

  const {
    data: subscriptionData,
    loading: subscriptionLoading, // Can be ignored
    error: subscriptionError
  } = useSubscription<SensorUpdateData>(SENSOR_UPDATES_SUBSCRIPTION);

  // Effect to load initial sensors (logic remains the same)
  useEffect(() => {
    if (initialSensorsData?.sensors) {
      setSensors((prevSensors) => {
        const newSensors = new Map(prevSensors);
        initialSensorsData.sensors.forEach(sensor => {
          if (!newSensors.has(sensor.spId)) {
            const lastUpdateTs = parseTimestamp(sensor.lastUpdate);
            newSensors.set(sensor.spId, {
              spId: sensor.spId,
              friendlyName: sensor.friendlyName || `Sensor ${sensor.spId}`,
              temperature: sensor.lastTemperatureC ?? undefined,
              humidity: sensor.lastHumidity ?? undefined,
              lastUpdateTs: lastUpdateTs,
              lastUpdateStr: formatTimestamp(lastUpdateTs),
              highlight: "",
            });
          }
        });
        return newSensors;
      });
    }
  }, [initialSensorsData]);

  // Effect to handle subscription data (logic remains the same)
  useEffect(() => {
    if (subscriptionData?.sensorUpdates) {
      const update = subscriptionData.sensorUpdates;
      setSensors((prevSensors) => {
        const newSensors = new Map(prevSensors);
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

  // Effect to clear highlights (logic remains the same)
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
        }, 3000); // Keep 3 second highlight
        timers.push(timer);
      }
    });
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [sensors]);

  // Memoized sorted sensor list (logic remains the same)
  const sortedSensors = useMemo(() => {
    return Array.from(sensors.values()).sort((a, b) => {
      const tsA = a.lastUpdateTs ?? -Infinity;
      const tsB = b.lastUpdateTs ?? -Infinity;
      return tsB - tsA;
    });
  }, [sensors]);

  const isLoading = initialLoading;

  return (
    // Replace Container with div and Tailwind classes
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      {/* Replace Typography with h1 and Tailwind classes */}
      <h1 className="text-2xl font-bold mb-4">
        Dashboard
      </h1>

      {/* Loading State */}
      {isLoading && <p className="text-muted-foreground">Loading initial sensor data...</p>}

      {/* Initial Load Error */}
      {initialError && (
        <Alert variant="destructive" className="mb-4">
          <Terminal className="h-4 w-4" />
          <AlertTitle>Error Loading Sensors</AlertTitle>
          <AlertDescription>
            {initialError.message}
          </AlertDescription>
        </Alert>
      )}

      {/* Subscription Error (less critical) */}
      {subscriptionError && !isLoading && (
         <Alert variant="default" className="mb-4 bg-yellow-100 border-yellow-300 text-yellow-800"> {/* Custom variant styling */}
          <Terminal className="h-4 w-4" />
          <AlertTitle>Subscription Warning</AlertTitle>
          <AlertDescription>
            {subscriptionError.message}
          </AlertDescription>
        </Alert>
      )}

      {/* Replace MUI Table with shadcn/ui Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Friendly Name</TableHead>
            <TableHead>Sensor ID</TableHead>
            <TableHead>Temperature (°C)</TableHead>
            <TableHead>Humidity (%)</TableHead>
            <TableHead>Last Update</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedSensors.map((sensor) => (
            <TableRow
              key={sensor.spId}
              // Apply conditional classes using cn utility
              className={cn(
                "transition-colors duration-1000 ease-in-out", // Base transition
                sensor.highlight === "new" && "bg-green-100",
                sensor.highlight === "updated" && "bg-yellow-100"
              )}
            >
              {/* Keep EditableFriendlyNameCell for now */}
              <EditableFriendlyNameCell spId={sensor.spId} initialName={sensor.friendlyName} />
              <TableCell>{sensor.spId}</TableCell>
              <TableCell>{sensor.temperature?.toFixed(2) ?? "-"}</TableCell>
              <TableCell>{sensor.humidity?.toFixed(2) ?? "-"}</TableCell>
              <TableCell>{sensor.lastUpdateStr ?? "-"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default Dashboard;