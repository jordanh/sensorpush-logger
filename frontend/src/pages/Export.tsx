import React, { useState } from "react";
import { gql, useLazyQuery } from "@apollo/client";
import {
  Container,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Alert,
  Box,
} from "@mui/material";

// GraphQL Query using camelCase
const GET_SAMPLES_QUERY = gql`
  query GetSamples($begin: DateTime!, $end: DateTime!) {
    samples(begin: $begin, end: $end) {
      deviceSpId # Changed
      friendlyName # Changed
      temperatureC # Changed
      humidity
      createdOn # Changed
    }
  }
`;

// Interface for the sample data using camelCase
interface Sample {
  deviceSpId: number; // Changed
  friendlyName: string; // Changed
  temperatureC: number; // Changed
  humidity: number;
  createdOn: string; // Changed
}

interface GetSamplesData {
  samples: Sample[];
}

// Helper function to generate CSV content using camelCase
const generateCsvContent = (data: Sample[]): string => {
  if (!data || data.length === 0) {
    return "";
  }
  const header = ["Timestamp", "Sensor ID", "Friendly Name", "Temperature (C)", "Humidity (%)"];
  // Use camelCase fields when mapping
  const rows = data.map(sample => [
    new Date(sample.createdOn).toLocaleString(), // Changed
    sample.deviceSpId, // Changed
    sample.friendlyName || "", // Changed
    sample.temperatureC.toFixed(2), // Changed
    sample.humidity.toFixed(2),
  ]);

  const escapeField = (field: any): string => {
    const str = String(field);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvRows = [header, ...rows].map(row => row.map(escapeField).join(','));
  return csvRows.join('\n');
};

// Helper function to trigger CSV download
const downloadCsv = (csvContent: string, beginDate: string, endDate: string) => {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  const formattedBegin = beginDate.split('T')[0].replace(/-/g, '');
  const formattedEnd = endDate.split('T')[0].replace(/-/g, '');
  link.setAttribute("download", `samples_${formattedBegin}_${formattedEnd}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};


const ExportPage = () => {
  const [begin, setBegin] = useState("");
  const [end, setEnd] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);

  const [getSamples, { loading, error }] = useLazyQuery< // Removed 'data' as it's handled in onCompleted
    GetSamplesData,
    { begin: string; end: string }
  >(GET_SAMPLES_QUERY, {
    onCompleted: (queryData) => {
      if (queryData?.samples && queryData.samples.length > 0) { // Check length
        const csvContent = generateCsvContent(queryData.samples);
        downloadCsv(csvContent, begin, end);
      } else if (queryData?.samples) { // Query succeeded but no data
         setInputError("No samples found for the selected date range."); // Use inputError state for feedback
      }
      // Error case is handled by the 'error' variable from the hook
    },
    onError: (queryError) => {
      console.error("Error fetching samples:", queryError);
      // Error state is already handled by the 'error' variable
      // Optionally set a user-facing error message here if needed
      // setInputError(`Error fetching data: ${queryError.message}`);
    },
    fetchPolicy: "network-only",
  });

  const handleExport = () => {
    setInputError(null);
    if (!begin || !end) {
      setInputError("Please provide both begin and end dates.");
      return;
    }
    try {
        new Date(begin).toISOString();
        new Date(end).toISOString();
    } catch (e) {
        setInputError("Invalid date format. Please use ISO format (e.g., YYYY-MM-DDTHH:MM:SS).");
        return;
    }
    getSamples({ variables: { begin, end } });
  };

  return (
    <Container>
      <Typography variant="h4" gutterBottom>
        Export Samples
      </Typography>
      <TextField
        label="Begin (ISO format, e.g., YYYY-MM-DDTHH:MM)"
        type="datetime-local"
        fullWidth
        margin="normal"
        value={begin}
        onChange={(e) => setBegin(e.target.value)}
        InputLabelProps={{ shrink: true }}
        error={!!inputError && !begin} // Highlight only if empty and error exists
      />
      <TextField
        label="End (ISO format, e.g., YYYY-MM-DDTHH:MM)"
        type="datetime-local"
        fullWidth
        margin="normal"
        value={end}
        onChange={(e) => setEnd(e.target.value)}
        InputLabelProps={{ shrink: true }}
        error={!!inputError && !end} // Highlight only if empty and error exists
      />
      {/* Display input validation errors */}
      {inputError && <Alert severity="warning" sx={{ mb: 2 }}>{inputError}</Alert>}
      {/* Display GraphQL query errors */}
      {error && <Alert severity="error" sx={{ mb: 2 }}>Error fetching data: {error.message}</Alert>}
      <Box sx={{ position: 'relative', display: 'inline-block' }}> {/* Adjust Box styling */}
        <Button
          variant="contained"
          color="primary"
          onClick={handleExport}
          disabled={loading}
        >
          Export CSV
        </Button>
        {loading && (
          <CircularProgress
            size={24}
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              marginTop: '-12px',
              marginLeft: '-12px',
            }}
          />
        )}
      </Box>
    </Container>
  );
};

export default ExportPage;