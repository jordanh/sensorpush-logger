import React, { useState, useEffect, useRef } from "react";
import { useSubscription, gql } from "@apollo/client"; // Import gql
import { Box, Typography, Checkbox, FormControlLabel, Paper } from "@mui/material";

// Define the GraphQL subscription directly using gql
const LOG_MESSAGES_SUBSCRIPTION = gql`
  subscription LogMessages {
    logMessages {
      timestamp
      message
      level
    }
  }
`;

// Define the type for a single log message based on the GraphQL schema
interface LogMessage {
  timestamp: string; // ISO string format
  message: string;
  level: string;
}

// Define the type for the subscription data
interface LogMessagesData {
  logMessages: LogMessage;
}

const LogPage = () => {
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Use the defined subscription document
  const { data, loading, error } = useSubscription<LogMessagesData>(
    LOG_MESSAGES_SUBSCRIPTION
  );

  useEffect(() => {
    if (data?.logMessages) {
      // Add new message to the end of the array
      setLogs((prevLogs) => [...prevLogs, data.logMessages]);
    }
  }, [data]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      // Scroll to the bottom
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]); // Trigger scroll on new logs if autoScroll is enabled

  const handleAutoScrollChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setAutoScroll(event.target.checked);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Application Log
      </Typography>

      <FormControlLabel
        control={
          <Checkbox
            checked={autoScroll}
            onChange={handleAutoScrollChange}
            name="autoScrollCheckbox"
          />
        }
        label="Auto-scroll"
        sx={{ mb: 2 }}
      />

      <Paper
        ref={scrollRef}
        sx={{
          height: "60vh", // Adjust height as needed
          overflowY: "scroll",
          p: 2,
          border: "1px solid #ccc",
          backgroundColor: "#f5f5f5", // Light background for the log area
          fontFamily: "monospace", // Use monospace font for logs
          fontSize: "0.875rem", // Slightly smaller font size
        }}
      >
        {loading && <Typography>Connecting to log stream...</Typography>}
        {error && <Typography color="error">Error loading logs: {error.message}</Typography>}
        {!loading && !error && logs.length === 0 && <Typography>No log messages received yet.</Typography>}
        {logs.map((log, index) => (
          <Typography
            key={index}
            component="div" // Use div to allow block display
            sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word", mb: 0.5 }} // Ensure wrapping and spacing
          >
            {/* Basic formatting - consider adding color based on level */}
            {new Date(log.timestamp).toLocaleString()} [{log.level}] {log.message}
          </Typography>
        ))}
      </Paper>
    </Box>
  );
};

export default LogPage;