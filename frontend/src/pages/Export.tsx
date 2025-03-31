import React, { useState } from "react";
import { gql, useLazyQuery } from "@apollo/client";
import { Input } from "@/components/ui/input"; // Use shadcn Input
import { Label } from "@/components/ui/label"; // Use shadcn Label
import { Button } from "@/components/ui/button"; // Use shadcn Button
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"; // Use shadcn Alert
import { Terminal, Loader2 } from "lucide-react"; // Icons for Alert and Loading
import { cn } from "@/lib/utils"; // Import cn utility

// GraphQL Query (keep as is)
const GET_SAMPLES_QUERY = gql`
  query GetSamples($begin: DateTime!, $end: DateTime!) {
    samples(begin: $begin, end: $end) {
      deviceSpId
      friendlyName
      temperatureC
      humidity
      createdOn
    }
  }
`;

// Interfaces (keep as is)
interface Sample {
  deviceSpId: number;
  friendlyName: string;
  temperatureC: number;
  humidity: number;
  createdOn: string;
}

interface GetSamplesData {
  samples: Sample[];
}

// Helper functions (keep as is)
const generateCsvContent = (data: Sample[]): string => {
  if (!data || data.length === 0) {
    return "";
  }
  const header = ["Timestamp", "Sensor ID", "Friendly Name", "Temperature (C)", "Humidity (%)"];
  const rows = data.map(sample => [
    new Date(sample.createdOn).toLocaleString(),
    sample.deviceSpId,
    sample.friendlyName || "",
    sample.temperatureC.toFixed(2),
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

  const [getSamples, { loading, error }] = useLazyQuery<
    GetSamplesData,
    { begin: string; end: string }
  >(GET_SAMPLES_QUERY, {
    onCompleted: (queryData) => {
      setInputError(null); // Clear previous errors on success
      if (queryData?.samples && queryData.samples.length > 0) {
        const csvContent = generateCsvContent(queryData.samples);
        downloadCsv(csvContent, begin, end);
      } else if (queryData?.samples) {
         setInputError("No samples found for the selected date range.");
      }
    },
    onError: (queryError) => {
      console.error("Error fetching samples:", queryError);
      // Error state is handled by the 'error' variable
      // setInputError(`Error fetching data: ${queryError.message}`); // Optionally set specific message
    },
    fetchPolicy: "network-only",
  });

  const handleExport = () => {
    setInputError(null);
    let beginISO = "";
    let endISO = "";

    if (!begin || !end) {
      setInputError("Please provide both begin and end dates.");
      return;
    }

    // Validate and convert dates (datetime-local gives YYYY-MM-DDTHH:MM)
    try {
        // Append seconds and timezone offset if needed for ISO string conversion
        // Note: This assumes local timezone. Adjust if UTC is required by backend.
        beginISO = new Date(begin + ':00').toISOString();
        endISO = new Date(end + ':00').toISOString();
    } catch (e) {
        setInputError("Invalid date format selected.");
        return;
    }

    getSamples({ variables: { begin: beginISO, end: endISO } });
  };

  return (
    // Replace Container with div and Tailwind classes
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      {/* Replace Typography with h1 */}
      <h1 className="text-2xl font-bold mb-6">
        Export Samples
      </h1>

      {/* Replace TextField with Label + Input */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <Label htmlFor="begin-date">Begin Date/Time</Label>
          <Input
            id="begin-date"
            type="datetime-local"
            value={begin}
            onChange={(e) => setBegin(e.target.value)}
            className={cn(inputError && !begin && "border-destructive")} // Highlight if empty and error exists
          />
        </div>
        <div>
          <Label htmlFor="end-date">End Date/Time</Label>
          <Input
            id="end-date"
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className={cn(inputError && !end && "border-destructive")} // Highlight if empty and error exists
          />
        </div>
      </div>

      {/* Display input validation errors */}
      {inputError && (
        // Change variant to default and add custom warning styles
        <Alert variant="default" className="mb-4 border-yellow-500/50 text-yellow-700 dark:border-yellow-500 [&>svg]:text-yellow-700 dark:[&>svg]:text-yellow-500">
          <Terminal className="h-4 w-4" />
          <AlertTitle>Input Error</AlertTitle>
          <AlertDescription>{inputError}</AlertDescription>
        </Alert>
      )}

      {/* Display GraphQL query errors */}
      {error && (
        <Alert variant="destructive" className="mb-4">
          <Terminal className="h-4 w-4" />
          <AlertTitle>Data Fetch Error</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      {/* Replace Button and loading indicator */}
      <div> {/* Wrapper div */}
        <Button
          onClick={handleExport}
          disabled={loading}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {/* Loading icon */}
          Export CSV
        </Button>
      </div>
    </div>
  );
};

export default ExportPage;