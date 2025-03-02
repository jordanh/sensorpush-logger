import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ApolloProvider } from "@apollo/client"; // Import ApolloProvider
import App from "./App";
import client from "./apollo"; // Import the configured Apollo Client

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
root.render(
  <ApolloProvider client={client}> {/* Wrap App with ApolloProvider */}
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </ApolloProvider>
);