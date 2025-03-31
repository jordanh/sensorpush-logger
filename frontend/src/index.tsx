import React from "react";
import "./index.css";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ApolloProvider } from "@apollo/client";
import App from "./App";
import client from "./apollo";

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
root.render(
  <ApolloProvider client={client}> {/* Wrap App with ApolloProvider */}
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </ApolloProvider>
);