import React, { useEffect, useState } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import "./App.css";
import CreateTask from "./pages/CreateTask";
import TaskList from "./pages/TaskList";
import TaskResults from "./pages/TaskResults";
import { healthCheck } from "./services/api";

function App() {
  const [health, setHealth] = useState("checking...");

  useEffect(() => {
    healthCheck()
      .then((h) => {
        const llm = (h.llm_status as any)?.status ?? "unknown";
        setHealth(`API: ${h.api_status} | DB: ${h.db_status} | LLM: ${llm}`);
      })
      .catch(() => setHealth("unhealthy"));
  }, []);

  return (
    <BrowserRouter>
      <div className="app-root">
        <header className="top-bar">
          <div className="top-left">
            <h1 className="logo">EcoCode</h1>
            <nav className="nav">
              <Link to="/create">New Task</Link>
              <Link to="/tasks">Tasks</Link>
            </nav>
          </div>
          <div className="health-indicator">{health}</div>
        </header>

        <Routes>
          <Route path="/create" element={<CreateTask />} />
          <Route path="/tasks" element={<TaskList />} />
          <Route path="/tasks/:taskId" element={<TaskResults />} />
          <Route path="*" element={<Navigate to="/tasks" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
