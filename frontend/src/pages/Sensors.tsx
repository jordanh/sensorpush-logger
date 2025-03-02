import React, { useState, useCallback } from "react";
import { gql, useQuery, useMutation } from "@apollo/client";
import {
  Container,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  CircularProgress,
  Alert,
  debounce,
} from "@mui/material";

// GraphQL Query and Mutation using camelCase
const GET_SENSORS_QUERY = gql`
  query GetSensors {
    sensors {
      spId # Changed
      bleId # Changed
      friendlyName # Changed
      # lastUpdate field is not needed on this page based on current UI
    }
  }
`;

const UPDATE_SENSOR_NAME_MUTATION = gql`
  mutation UpdateSensorName($spId: Int!, $name: String!) {
    updateSensorName(spId: $spId, name: $name) {
      spId # Changed
      friendlyName # Changed
    }
  }
`;

// Interface for the sensor data from the query using camelCase
interface SensorQueryItem {
  spId: number; // Changed
  bleId: string; // Changed
  friendlyName: string; // Changed
}

interface SensorData {
  sensors: SensorQueryItem[];
}

// Interface for the mutation result using camelCase
interface UpdateSensorNameData {
  updateSensorName: {
    spId: number; // Changed
    friendlyName: string; // Changed
  };
}

const Sensors = () => {
  // Fetch sensors using useQuery
  const { data, loading, error } = useQuery<SensorData>(GET_SENSORS_QUERY);

  // Mutation hook for updating sensor names
  const [updateSensorName, { loading: updateLoading, error: updateError }] = useMutation<
    UpdateSensorNameData,
    { spId: number; name: string } // Variables type remains the same
  >(UPDATE_SENSOR_NAME_MUTATION, {
     // Add an optimistic response for smoother UI update
     optimisticResponse: (variables) => ({
        updateSensorName: {
          __typename: "Sensor", // Important for cache matching
          spId: variables.spId,
          friendlyName: variables.name,
        },
      }),
      // Update cache directly after mutation for robust state management
      update(cache, { data: mutationResult }) {
        const updatedSensor = mutationResult?.updateSensorName;
        if (!updatedSensor) return;

        // Read the existing sensors from the cache
        const existingData = cache.readQuery<SensorData>({ query: GET_SENSORS_QUERY });
        if (existingData?.sensors) {
          // Write the updated sensor data back to the cache
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

  // Debounced handler for name changes
  const debouncedUpdate = useCallback(
    debounce((spId: number, newName: string) => {
      // Use camelCase spId in variables
      updateSensorName({ variables: { spId, name: newName } });
    }, 500),
    [updateSensorName]
  );

  // Local state to manage TextField values (using spId as key)
  const [localNames, setLocalNames] = useState<Record<number, string>>({});

  // Update local state when query data changes (use camelCase)
  React.useEffect(() => {
    if (data?.sensors) {
      const initialNames = data.sensors.reduce((acc, sensor) => {
        acc[sensor.spId] = sensor.friendlyName; // Changed
        return acc;
      }, {} as Record<number, string>);
      setLocalNames(initialNames);
    }
  }, [data]);

  const handleLocalNameChange = (spId: number, newName: string) => { // Changed param name
    setLocalNames((prev) => ({ ...prev, [spId]: newName })); // Changed key
    debouncedUpdate(spId, newName); // Changed arg name
  };

  if (loading) return <CircularProgress />;
  if (error) return <Alert severity="error">Error loading sensors: {error.message}</Alert>;

  return (
    <Container>
      <Typography variant="h4" gutterBottom>
        Sensors
      </Typography>
      {updateError && <Alert severity="warning">Error updating name: {updateError.message}</Alert>}
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>SensorPush ID</TableCell>
            <TableCell>Friendly Name</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {/* Use camelCase fields from data */}
          {data?.sensors?.map((sensor) => (
            <TableRow key={sensor.spId}> {/* Changed */}
              <TableCell>{sensor.spId}</TableCell> {/* Changed */}
              <TableCell>
                <TextField
                  value={localNames[sensor.spId] ?? ''}
                  onChange={(e) => handleLocalNameChange(sensor.spId, e.target.value)}
                  disabled={updateLoading}
                  variant="standard"
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Container>
  );
};

export default Sensors;