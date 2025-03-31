import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button"; // Import shadcn/ui Button

const Navigation = () => {
  return (
    <nav className="bg-primary text-primary-foreground p-4">
      <div className="container mx-auto flex items-center space-x-4">
        <Button variant="ghost" asChild>
          <Link to="/dashboard">Dashboard</Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link to="/log">Log</Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link to="/export">Export</Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link to="/sensors">Sensors</Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link to="/config">Config</Link>
        </Button>
      </div>
    </nav>
  );
};

export default Navigation;