import React, { useState, useEffect, useRef } from "react";
import { useSubscription, gql } from "@apollo/client";
import { Checkbox } from "@/components/ui/checkbox"; // Import shadcn Checkbox
import { Label } from "@/components/ui/label"; // Import shadcn Label
import { cn } from "@/lib/utils"; // Import cn utility

// Define the GraphQL subscription (keep as is)
const LOG_MESSAGES_SUBSCRIPTION = gql`
  subscription LogMessages {
    logMessages {
      timestamp
      message
      level
    }
  }
`;

// Define the type for a single log message (keep as is)
interface LogMessage {
  timestamp: string;
  message: string;
  level: string;
}

// Define the type for the subscription data (keep as is)
interface LogMessagesData {
  logMessages: LogMessage;
}

const LogPage = () => {
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Use the defined subscription document (keep as is)
  const { data, loading, error } = useSubscription<LogMessagesData>(
    LOG_MESSAGES_SUBSCRIPTION
  );

  // Effect to add new logs (keep as is)
  useEffect(() => {
    if (data?.logMessages) {
      setLogs((prevLogs) => [...prevLogs, data.logMessages]);
    }
  }, [data]);

  // Effect for auto-scrolling (keep as is)
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Handler for checkbox change (logic is similar, adapted for shadcn Checkbox)
  // Note: shadcn Checkbox uses onCheckedChange which passes the checked state directly
  const handleAutoScrollChange = (checked: boolean | "indeterminate") => {
     if (typeof checked === 'boolean') {
        setAutoScroll(checked);
     }
  };

  // Helper to determine text color based on log level
  const getLevelColor = (level: string): string => {
    switch (level.toUpperCase()) {
      case "ERROR":
        return "text-red-600";
      case "WARNING":
        return "text-yellow-600";
      case "INFO":
        return "text-blue-600";
      case "DEBUG":
        return "text-gray-500";
      default:
        return "text-foreground"; // Default text color
    }
  };

  return (
    // Replace Box with div and Tailwind padding
    <div className="p-4 md:p-6 lg:p-8">
      {/* Replace Typography with h1 and Tailwind classes */}
      <h1 className="text-2xl font-bold mb-4">
        Application Log
      </h1>

      {/* Replace FormControlLabel/Checkbox with shadcn Label/Checkbox */}
      <div className="flex items-center space-x-2 mb-4">
        <Checkbox
          id="autoScrollCheckbox"
          checked={autoScroll}
          onCheckedChange={handleAutoScrollChange}
        />
        <Label htmlFor="autoScrollCheckbox">
          Auto-scroll
        </Label>
      </div>

      {/* Replace Paper with div and Tailwind classes */}
      <div
        ref={scrollRef}
        className="h-[60vh] overflow-y-scroll p-3 border border-border bg-muted/40 font-mono text-sm rounded-md" // Apply styles using Tailwind
      >
        {loading && <p className="text-muted-foreground">Connecting to log stream...</p>}
        {error && <p className="text-destructive">Error loading logs: {error.message}</p>}
        {!loading && !error && logs.length === 0 && <p className="text-muted-foreground">No log messages received yet.</p>}
        {/* Use <pre> for better formatting of potential multi-line logs */}
        {logs.map((log, index) => (
          <pre
            key={index}
            className={cn(
              "whitespace-pre-wrap break-words mb-1", // Ensure wrapping and spacing
              getLevelColor(log.level) // Apply color based on level
            )}
          >
            {`${new Date(log.timestamp).toLocaleString()} [${log.level}] ${log.message}`}
          </pre>
        ))}
      </div>
    </div>
  );
};

export default LogPage;