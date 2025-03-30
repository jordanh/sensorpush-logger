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
  CircularProgress,
  Alert,
  // TextField and debounce removed as they are no longer needed
} from "@mui/material";
import EditableFriendlyNameCell from "../components/EditableFriendlyNameCell"; // Import the shared component

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

  // Removed debouncedUpdate, localNames state, useEffect for localNames,
  // and handleLocalNameChange as they are replaced by EditableFriendlyNameCell logic.

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
              {/* Replace TextField with the reusable editable cell component */}
              <EditableFriendlyNameCell spId={sensor.spId} initialName={sensor.friendlyName} />
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Container>
  );
};

export default Sensors;