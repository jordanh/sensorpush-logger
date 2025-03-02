import React from "react";
import { AppBar, Toolbar, Button } from "@mui/material";
import { Link } from "react-router-dom";

const Navigation = () => {
  return (
    <AppBar position="static">
      <Toolbar>
        <Button color="inherit" component={Link} to="/dashboard">
          Dashboard
        </Button>
        <Button color="inherit" component={Link} to="/log">
          Log
        </Button>
        <Button color="inherit" component={Link} to="/export">
          Export
        </Button>
        <Button color="inherit" component={Link} to="/sensors">
          Sensors
        </Button>
        <Button color="inherit" component={Link} to="/config">
          Config
        </Button>
      </Toolbar>
    </AppBar>
  );
};

export default Navigation;