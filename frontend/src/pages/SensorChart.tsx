import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { gql, useQuery, useSubscription } from '@apollo/client';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { subHours, subDays, subMonths, subYears } from 'date-fns'; // Removed startOfMinute, not used

// Import shadcn/ui components
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal } from "lucide-react"; // Icon for Alert

// Import shared subscription from Dashboard
// Note: This creates a dependency between pages, consider moving shared GQL definitions
// to a dedicated location (e.g., src/graphql) if using codegen or loaders later.
import { SENSOR_UPDATES_SUBSCRIPTION } from './Dashboard';

// GraphQL Definitions (Inline for now)
// Query fetches ALL samples in range, filtering happens client-side
const GET_SAMPLES_IN_RANGE = gql`
  query GetSamplesInRange($begin: DateTime!, $end: DateTime!) {
    samples(begin: $begin, end: $end) {
      deviceSpId # Needed for client-side filtering
      friendlyName # Needed for title
      temperatureC
      humidity
      createdOn
    }
    # Cannot query single sensor directly with current schema
  }
`;

// Interfaces (adjusted for current schema)
interface Sample {
  deviceSpId: number; // Added for filtering
  friendlyName: string; // Added for title
  temperatureC: number;
  humidity: number;
  createdOn: string; // ISO string from backend
}

interface QueryData {
  // No longer fetching single sensor info directly
  samples: Sample[];
}

interface QueryVars {
  // No deviceSpId needed for query itself
  begin: string; // ISO string
  end: string; // ISO string
}

// Interface for the imported SENSOR_UPDATES_SUBSCRIPTION payload
interface SensorUpdatePayload {
    deviceSpId: number;
    friendlyName: string;
    temperatureC: number;
    humidity: number;
    createdOn: string;
}

interface SubscriptionData {
  sensorUpdates: SensorUpdatePayload;
}

// No variables needed for the all-sensor subscription
// interface SubscriptionVars {}

interface ChartDataPoint {
  timestamp: number;
  temperature: number | null;
  humidity: number | null;
}

// Helper to parse timestamp safely
const parseTimestamp = (isoString: string | null | undefined): number | undefined => {
  if (!isoString) return undefined;
  try {
    return new Date(isoString).getTime();
  } catch (e) {
    console.error("Error parsing timestamp:", e);
    return undefined;
  }
};

// Helper to format timestamp for display
const formatDisplayTimestamp = (timestamp: number | undefined | null): string => {
  if (timestamp === undefined || timestamp === null) return "-";
  try {
    return new Date(timestamp).toLocaleString();
  } catch (e) {
    return "-";
  }
};

// Define period options
const periodOptions = [
  { value: '1h', label: '1 Hour' },
  { value: '6h', label: '6 Hours' },
  { value: '24h', label: '24 Hours' },
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '1y', label: '1 Year' },
  { value: 'all', label: 'All Time' },
];

const SensorChart = () => {
  const { sensorId } = useParams<{ sensorId: string }>();
  const deviceSpId = parseInt(sensorId || '0', 10); // Ensure it's a number

  const [period, setPeriod] = useState<string>('24h'); // Default period
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [friendlyName, setFriendlyName] = useState<string>(`Sensor ${deviceSpId}`); // Default name
  const [lastUpdateTs, setLastUpdateTs] = useState<number | null>(null);
  const [sampleCount, setSampleCount] = useState<number>(0);

  // Calculate time range based on selected period
  const { begin, end } = useMemo(() => {
    const now = new Date();
    let beginDate: Date;

    switch (period) {
      case '1h': beginDate = subHours(now, 1); break;
      case '6h': beginDate = subHours(now, 6); break;
      case '24h': beginDate = subHours(now, 24); break;
      case '7d': beginDate = subDays(now, 7); break;
      case '30d': beginDate = subDays(now, 30); break; // Approximation
      case '1y': beginDate = subYears(now, 1); break;
      case 'all': beginDate = new Date(0); break; // Epoch for all time
      default: beginDate = subHours(now, 24);
    }
    const endDate = new Date(now.getTime() + 60000); // 1 minute ahead

    return { begin: beginDate.toISOString(), end: endDate.toISOString() };
  }, [period]);

  // Initial data query (fetches all sensors in range)
  const { loading: queryLoading, error: queryError, refetch } = useQuery<QueryData, QueryVars>(
    GET_SAMPLES_IN_RANGE, // Use the updated inline query
    {
      variables: { begin, end }, // No deviceSpId here
      notifyOnNetworkStatusChange: true,
      onCompleted: (data) => {
        // Filter results client-side
        const relevantSamples = (data?.samples || []).filter(
          sample => sample.deviceSpId === deviceSpId
        );

        // Try to set friendly name from the first relevant sample
        if (relevantSamples.length > 0 && relevantSamples[0].friendlyName) {
          setFriendlyName(relevantSamples[0].friendlyName);
        } else {
          // Keep default or potentially fetch separately if needed
           setFriendlyName(`Sensor ${deviceSpId}`);
        }

        const formattedData = relevantSamples
          .map(sample => ({
            timestamp: parseTimestamp(sample.createdOn),
            temperature: sample.temperatureC,
            humidity: sample.humidity,
          }))
          .filter(dp => dp.timestamp !== undefined)
          .sort((a, b) => a.timestamp! - b.timestamp!);

        setChartData(formattedData as ChartDataPoint[]);
        setSampleCount(formattedData.length);
        if (formattedData.length > 0) {
          setLastUpdateTs(formattedData[formattedData.length - 1].timestamp ?? null);
        } else {
          setLastUpdateTs(null);
        }
      },
      onError: (err) => {
        console.error("Error fetching sensor samples:", err);
        setChartData([]);
        setSampleCount(0);
        setLastUpdateTs(null);
      }
    }
  );

  // Subscription for ALL real-time updates
  const { loading: subLoading, error: subError } = useSubscription<SubscriptionData>( // No variables needed
    SENSOR_UPDATES_SUBSCRIPTION, // Use the imported subscription
    {
      // No variables needed here
      onData: ({ data: subscriptionResult }) => {
        const update = subscriptionResult?.data?.sensorUpdates;

        // Filter updates client-side
        if (update && update.deviceSpId === deviceSpId) {
          const newTimestamp = parseTimestamp(update.createdOn);
          if (newTimestamp === undefined) return;

          // Update friendly name if it changed
          if (update.friendlyName && update.friendlyName !== friendlyName) {
            setFriendlyName(update.friendlyName);
          }

          // Add new data point
          setChartData(prevData => {
            const newDataPoint: ChartDataPoint = {
              timestamp: newTimestamp,
              temperature: update.temperatureC,
              humidity: update.humidity,
            };
            const existingIndex = prevData.findIndex(p => p.timestamp === newTimestamp);
            if (existingIndex !== -1) return prevData; // Avoid duplicates

            const combined = [...prevData, newDataPoint].sort((a, b) => a.timestamp - b.timestamp);
            return combined;
          });

          // Update status fields
          setLastUpdateTs(newTimestamp);
          // Increment count - Note: This might slightly overcount if an update arrives
          // while the initial query is still fetching overlapping data.
          // A more robust solution might involve de-duplication based on timestamp.
          setSampleCount(prevCount => prevCount + 1);
        }
      },
      onError: (err) => {
        console.error("Subscription error:", err);
      }
    }
  );

  // Refetch data when the period changes
  useEffect(() => {
    // Pass only begin/end as variables now
    refetch({ begin, end });
  }, [period, begin, end, refetch]); // deviceSpId removed as it's not a query variable

  // Determine overall loading state
  const isLoading = queryLoading;

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      <h1 className="text-2xl font-bold mb-4">
        Chart: {friendlyName} (Sensor ID: {deviceSpId})
      </h1>

      {/* Error Alerts */}
      {queryError && (
        <Alert variant="destructive" className="mb-4">
          <Terminal className="h-4 w-4" />
          <AlertTitle>Error Loading Chart Data</AlertTitle>
          <AlertDescription>{queryError.message}</AlertDescription>
        </Alert>
      )}
      {subError && (
        <Alert variant="default" className="mb-4 bg-yellow-100 border-yellow-300 text-yellow-800">
          <Terminal className="h-4 w-4" />
          <AlertTitle>Real-time Update Warning</AlertTitle>
          <AlertDescription>{subError.message}</AlertDescription>
        </Alert>
      )}

      {/* Controls and Status */}
      <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
        {/* Period Selector */}
        <div className="flex items-center gap-2">
          <Label htmlFor="period-select">Period:</Label>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger id="period-select" className="w-[180px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              {periodOptions.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Status Info */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>Samples: {isLoading ? '...' : sampleCount}</span>
          <span>Last Update: {isLoading ? '...' : formatDisplayTimestamp(lastUpdateTs)}</span>
        </div>
      </div>

      {/* Chart Area */}
      <div className="w-full h-[400px] bg-card p-4 rounded-lg shadow">
        {isLoading && <div className="flex justify-center items-center h-full">Loading chart data...</div>}
        {!isLoading && chartData.length === 0 && !queryError && (
          <div className="flex justify-center items-center h-full text-muted-foreground">No data available for the selected period.</div>
        )}
        {!isLoading && chartData.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                dataKey="timestamp"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(unixTime) => new Date(unixTime).toLocaleTimeString()}
                stroke="#9ca3af"
                tick={{ fill: "#d1d5db" }}
              />
              <YAxis
                yAxisId="left"
                label={{ value: 'Temperature (°C)', angle: -90, position: 'insideLeft', fill: '#a78bfa', style: { textAnchor: 'middle' } }}
                stroke="#a78bfa"
                tick={{ fill: "#a78bfa" }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                label={{ value: 'Humidity (%)', angle: 90, position: 'insideRight', fill: '#6ee7b7', style: { textAnchor: 'middle' } }}
                stroke="#6ee7b7"
                tick={{ fill: "#6ee7b7" }}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '4px' }}
                labelStyle={{ color: '#e5e7eb' }}
                itemStyle={{ color: '#e5e7eb' }}
                labelFormatter={(unixTime) => `Time: ${new Date(unixTime).toLocaleString()}`}
                formatter={(value, name) => [`${(value as number).toFixed(2)}${name === 'Temperature' ? '°C' : '%'}`, name]}
              />
              <Legend wrapperStyle={{ color: '#e5e7eb' }} />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="temperature"
                stroke="#a78bfa"
                name="Temperature"
                dot={false}
                strokeWidth={2}
                connectNulls
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="humidity"
                stroke="#6ee7b7"
                name="Humidity"
                dot={false}
                strokeWidth={2}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default SensorChart;