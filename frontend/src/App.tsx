import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Navigation from "./components/Navigation";
import Dashboard from "./pages/Dashboard";
import ExportPage from "./pages/Export";
import Sensors from "./pages/Sensors";
import Config from "./pages/Config";
import LogPage from "./pages/Log"; // Import the new Log page

function App() {
  return (
    <div>
      <Navigation />
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/log" element={<LogPage />} /> {/* Add route for Log page */}
        <Route path="/export" element={<ExportPage />} />
        <Route path="/sensors" element={<Sensors />} />
        <Route path="/config" element={<Config />} />
      </Routes>
    </div>
  );
}

export default App;