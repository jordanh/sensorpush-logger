import { ApolloClient, InMemoryCache, HttpLink, split } from "@apollo/client";
import { getMainDefinition } from "@apollo/client/utilities";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { createClient } from "graphql-ws";

// Determine the backend host and protocol dynamically for production
const isDevelopment = process.env.NODE_ENV === 'development';
const host = window.location.host; // e.g., "localhost:3000" in dev, "localhost:8000" in prod (when served by backend)
const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const httpProtocol = window.location.protocol;

// --- Link Configuration ---

// HTTP Link: Relies on proxy in dev, direct connection in prod
const httpLink = new HttpLink({
  // In dev, CRA proxy handles forwarding from localhost:3000 to localhost:8000
  // In prod, this correctly points to the backend serving the app
  uri: `${httpProtocol}//${host}/graphql`,
});

// WebSocket Link: Needs explicit URL in dev because proxy doesn't handle WS
const wsUri = isDevelopment
  ? `ws://localhost:8000/graphql` // Explicitly point to backend in dev
  : `${wsProtocol}//${host}/graphql`; // Use dynamic host in prod

const wsLink = new GraphQLWsLink(
  createClient({
    url: wsUri,
    // Optional: connectionParams for authentication, etc.
    // connectionParams: () => {
    //   const token = localStorage.getItem('token');
    //   return token ? { Authorization: `Bearer ${token}` } : {};
    // },
  })
);

// Use splitLink to route traffic between HTTP and WebSocket links
// based on the operation type (query/mutation vs. subscription)
const splitLink = split(
  ({ query }) => {
    const definition = getMainDefinition(query);
    return (
      definition.kind === "OperationDefinition" &&
      definition.operation === "subscription"
    );
  },
  wsLink, // Use wsLink for subscriptions
  httpLink // Use httpLink for everything else (queries, mutations)
);

// --- Apollo Client Instance ---
const client = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache(),
  connectToDevTools: isDevelopment, // Enable DevTools only in development
});

export default client;