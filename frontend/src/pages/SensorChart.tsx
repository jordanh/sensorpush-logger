import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { gql, useQuery, useSubscription } from '@apollo/client';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { subHours, subDays, subMonths, subYears, format, formatDistanceToNow } from 'date-fns'; // Import formatDistanceToNow

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
import { SENSOR_UPDATES_SUBSCRIPTION } from './Dashboard';

// GraphQL Definitions (Inline for now)
const GET_SAMPLES_IN_RANGE = gql`
  query GetSamplesInRange($begin: DateTime!, $end: DateTime!) {
    samples(begin: $begin, end: $end) {
      deviceSpId
      friendlyName
      temperatureC
      humidity
      createdOn
    }
  }
`;

// Interfaces
interface Sample {
  deviceSpId: number;
  friendlyName: string;
  temperatureC: number;
  humidity: number;
  createdOn: string;
}

interface QueryData {
  samples: Sample[];
}

interface QueryVars {
  begin: string;
  end: string;
}

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

// Helper to format timestamp for display (e.g., Last Update) using relative time
const formatDisplayTimestamp = (timestamp: number | undefined | null): string => {
  if (timestamp === undefined || timestamp === null) return "-";
  try {
    // Add suffix 'ago' or 'in X minutes' etc.
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
  } catch (e) {
    console.error("Error formatting relative time:", e);
    return "-";
  }
};

// Helper to format X-axis ticks based on period
const formatXAxisTick = (unixTime: number, period: string): string => {
  const date = new Date(unixTime);
  try {
    switch (period) {
      case '1h':
      case '4h': // Added
      case '12h': // Added
      case '24h':
        return format(date, 'h:mm a'); // Time only for up to 24h
      case '7d':
      case '30d':
        return format(date, 'M/d h:mm a');
      case '1y':
      case 'all':
      default:
        return format(date, 'M/d/yy');
    }
  } catch (e) {
    return '';
  }
};

// Define period options
const periodOptions = [
  { value: '1h', label: '1 Hour' },
  { value: '4h', label: '4 Hours' }, // Changed from 6h
  { value: '12h', label: '12 Hours' }, // Added 12h
  { value: '24h', label: '24 Hours' },
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '1y', label: '1 Year' },
  { value: 'all', label: 'All Time' },
];

// Custom Tick component for XAxis rotation
interface CustomizedAxisTickProps {
  x?: number;
  y?: number;
  payload?: { value: number }; // payload.value is the timestamp
  period: string; // Pass period for formatting
}

const CustomizedAxisTick: React.FC<CustomizedAxisTickProps> = ({ x, y, payload, period }) => {
  if (x === undefined || y === undefined || payload === undefined) {
    return null;
  }

  const formattedTick = formatXAxisTick(payload.value, period);

  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={16} textAnchor="end" fill="#d1d5db" transform="rotate(-45)">
        {formattedTick}
      </text>
    </g>
  );
};


const SensorChart = () => {
  const { sensorId } = useParams<{ sensorId: string }>();
  const deviceSpId = parseInt(sensorId || '0', 10);

  const [period, setPeriod] = useState<string>('24h');
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [friendlyName, setFriendlyName] = useState<string>(`Sensor ${deviceSpId}`);
  const [lastUpdateTs, setLastUpdateTs] = useState<number | null>(null);
  const [sampleCount, setSampleCount] = useState<number>(0);
  const [, setForceUpdate] = useState(Date.now()); // State to trigger re-renders for relative time

  // Effect to update relative time display periodically
  useEffect(() => {
    const timerId = setInterval(() => {
      setForceUpdate(Date.now());
    }, 30000); // Update every 30 seconds
    return () => clearInterval(timerId); // Cleanup interval on unmount
  }, []);


  const { begin, end } = useMemo(() => {
    const now = new Date();
    let beginDate: Date;
    switch (period) {
      case '1h': beginDate = subHours(now, 1); break;
      case '4h': beginDate = subHours(now, 4); break; // Updated
      case '12h': beginDate = subHours(now, 12); break; // Added
      case '24h': beginDate = subHours(now, 24); break;
      case '7d': beginDate = subDays(now, 7); break;
      case '30d': beginDate = subDays(now, 30); break;
      case '1y': beginDate = subYears(now, 1); break;
      case 'all': beginDate = new Date(0); break;
      default: beginDate = subHours(now, 24); // Default remains 24h
    }
    const endDate = new Date(now.getTime() + 60000);
    return { begin: beginDate.toISOString(), end: endDate.toISOString() };
  }, [period]);

  const { loading: queryLoading, error: queryError, refetch } = useQuery<QueryData, QueryVars>(
    GET_SAMPLES_IN_RANGE,
    {
      variables: { begin, end },
      notifyOnNetworkStatusChange: true,
      onCompleted: (data) => {
        const relevantSamples = (data?.samples || []).filter(
          sample => sample.deviceSpId === deviceSpId
        );
        if (relevantSamples.length > 0 && relevantSamples[0].friendlyName) {
          setFriendlyName(relevantSamples[0].friendlyName);
        } else {
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

  const { loading: subLoading, error: subError } = useSubscription<SubscriptionData>(
    SENSOR_UPDATES_SUBSCRIPTION,
    {
      onData: ({ data: subscriptionResult }) => {
        const update = subscriptionResult?.data?.sensorUpdates;
        if (update && update.deviceSpId === deviceSpId) {
          const newTimestamp = parseTimestamp(update.createdOn);
          if (newTimestamp === undefined) return; // Ignore if timestamp is invalid

          // Calculate the *current* start time for the sliding window
          const now = new Date();
          let currentBeginDate: Date;
          switch (period) {
            case '1h': currentBeginDate = subHours(now, 1); break;
            case '4h': currentBeginDate = subHours(now, 4); break;
            case '12h': currentBeginDate = subHours(now, 12); break;
            case '24h': currentBeginDate = subHours(now, 24); break;
            case '7d': currentBeginDate = subDays(now, 7); break;
            case '30d': currentBeginDate = subDays(now, 30); break;
            case '1y': currentBeginDate = subYears(now, 1); break;
            case 'all': currentBeginDate = new Date(0); break;
            default: currentBeginDate = subHours(now, 24);
          }
          const currentBeginTimestamp = currentBeginDate.getTime();

          // Ignore update if it's older than the calculated sliding window start
          if (newTimestamp < currentBeginTimestamp) {
              return;
          }

          // Update friendly name if it changed
          if (update.friendlyName && update.friendlyName !== friendlyName) {
            setFriendlyName(update.friendlyName);
          }

          // Update chart data: add new point and filter out old points
          setChartData(prevData => {
            const newDataPoint: ChartDataPoint = {
              timestamp: newTimestamp,
              temperature: update.temperatureC,
              humidity: update.humidity,
            };

            // Combine new point with previous data, avoiding duplicates
            const combined = prevData.some(p => p.timestamp === newTimestamp)
              ? [...prevData]
              : [...prevData, newDataPoint];

            // Filter out points older than the current sliding window start
            const filtered = combined.filter(p => p.timestamp >= currentBeginTimestamp);

            // Sort chronologically
            return filtered.sort((a, b) => a.timestamp - b.timestamp);
          });

          // Update status fields (use the timestamp of the *new* update)
          setLastUpdateTs(newTimestamp);
          // Sample count will be updated implicitly when chartData state updates and component re-renders
        }
      },
      onError: (err) => {
        console.error("Subscription error:", err);
      }
    }
  );

  useEffect(() => {
    refetch({ begin, end });
  }, [period, begin, end, refetch]);

  const isLoading = queryLoading;

  const maxTicks = 12;
  const calculatedInterval = chartData.length > maxTicks
    ? Math.max(0, Math.floor(chartData.length / maxTicks) -1)
    : 0;

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      <h1 className="text-2xl font-bold mb-4">
        Chart: {friendlyName} (Sensor ID: {deviceSpId})
      </h1>

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

      <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
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

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>Samples: {isLoading ? '...' : sampleCount}</span>
          <span>Last Update: {isLoading ? '...' : formatDisplayTimestamp(lastUpdateTs)}</span>
        </div>
      </div>

      <div className="w-full h-[400px] bg-card p-4 rounded-lg shadow">
        {isLoading && <div className="flex justify-center items-center h-full">Loading chart data...</div>}
        {!isLoading && chartData.length === 0 && !queryError && (
          <div className="flex justify-center items-center h-full text-muted-foreground">No data available for the selected period.</div>
        )}
        {!isLoading && chartData.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            {/* Increased bottom margin further for rotated ticks */}
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                dataKey="timestamp"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                // Pass the custom tick component and props
                tick={<CustomizedAxisTick period={period} />}
                interval={calculatedInterval}
                stroke="#9ca3af"
                // Remove direct tick prop object
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