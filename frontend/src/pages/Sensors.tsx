import React from "react";
import { gql, useQuery, useMutation } from "@apollo/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"; // Use shadcn Table
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"; // Use shadcn Alert
import { Terminal } from "lucide-react"; // Icon for Alert
import EditableFriendlyNameCell from "../components/EditableFriendlyNameCell"; // Keep existing import

// GraphQL Query and Mutation (keep as is)
const GET_SENSORS_QUERY = gql`
  query GetSensors {
    sensors {
      spId
      bleId
      friendlyName
    }
  }
`;

const UPDATE_SENSOR_NAME_MUTATION = gql`
  mutation UpdateSensorName($spId: Int!, $name: String!) {
    updateSensorName(spId: $spId, name: $name) {
      spId
      friendlyName
    }
  }
`;

// Interfaces (keep as is)
interface SensorQueryItem {
  spId: number;
  bleId: string;
  friendlyName: string;
}

interface SensorData {
  sensors: SensorQueryItem[];
}

interface UpdateSensorNameData {
  updateSensorName: {
    spId: number;
    friendlyName: string;
  };
}

const Sensors = () => {
  const { data, loading, error } = useQuery<SensorData>(GET_SENSORS_QUERY);

  // Mutation hook remains the same, including cache update logic
  const [updateSensorName, { loading: updateLoading, error: updateError }] = useMutation<
    UpdateSensorNameData,
    { spId: number; name: string }
  >(UPDATE_SENSOR_NAME_MUTATION, {
     optimisticResponse: (variables) => ({
        updateSensorName: {
          __typename: "Sensor",
          spId: variables.spId,
          friendlyName: variables.name,
        },
      }),
      update(cache, { data: mutationResult }) {
        const updatedSensor = mutationResult?.updateSensorName;
        if (!updatedSensor) return;
        const existingData = cache.readQuery<SensorData>({ query: GET_SENSORS_QUERY });
        if (existingData?.sensors) {
          cache.writeQuery({
            query: GET_SENSORS_QUERY,
            data: {
              sensors: existingData.sensors.map(sensor =>
                sensor.spId === updatedSensor.spId
                  ? { ...sensor, friendlyName: updatedSensor.friendlyName }
                  : sensor
              ),
            },
          });
        }
      }
  });

  // Loading and initial error states
  if (loading) return <p className="p-4 text-muted-foreground">Loading sensors...</p>; // Replace CircularProgress
  if (error) {
    return (
      <div className="p-4"> {/* Add padding */}
        <Alert variant="destructive">
          <Terminal className="h-4 w-4" />
          <AlertTitle>Error Loading Sensors</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    // Replace Container with div and Tailwind classes
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      {/* Replace Typography with h1 */}
      <h1 className="text-2xl font-bold mb-4">
        Sensors
      </h1>

      {/* Display mutation errors */}
      {updateError && (
         <Alert variant="default" className="mb-4 border-yellow-500/50 text-yellow-700 dark:border-yellow-500 [&>svg]:text-yellow-700 dark:[&>svg]:text-yellow-500"> {/* Warning style */}
          <Terminal className="h-4 w-4" />
          <AlertTitle>Update Error</AlertTitle>
          <AlertDescription>{updateError.message}</AlertDescription>
        </Alert>
      )}

      {/* Replace MUI Table with shadcn/ui Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SensorPush ID</TableHead>
            <TableHead>Friendly Name</TableHead>
            {/* Add BLE ID column if needed */}
            {/* <TableHead>BLE ID</TableHead> */}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.sensors?.map((sensor) => (
            <TableRow key={sensor.spId}>
              <TableCell>{sensor.spId}</TableCell>
              {/* Use the already migrated component */}
              <EditableFriendlyNameCell spId={sensor.spId} initialName={sensor.friendlyName} />
              {/* Add BLE ID cell if needed */}
              {/* <TableCell>{sensor.bleId}</TableCell> */}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default Sensors;