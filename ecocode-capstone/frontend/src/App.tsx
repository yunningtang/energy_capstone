import React from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import "./App.css";
import ProjectsList from "./pages/ProjectsList";
import ProjectDetail from "./pages/ProjectDetail";
import NewRun from "./pages/NewRun";
import RunDetail from "./pages/RunDetail";

const Presence = AnimatePresence as any;

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.18, ease: "easeOut" } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.1 } },
};

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <Presence mode="wait">
      <motion.div
        key={location.pathname}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        <Routes location={location}>
          <Route path="/" element={<ProjectsList />} />
          <Route path="/projects/:projectId" element={<ProjectDetail />} />
          <Route path="/projects/:projectId/new-run" element={<NewRun />} />
          <Route path="/runs/:runId" element={<RunDetail />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </motion.div>
    </Presence>
  );
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const { pathname } = useLocation();
  const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
  return (
    <Link to={to} className={`nav-link ${active ? "active" : ""}`}>
      {children}
    </Link>
  );
}

function AppShell() {
  return (
    <div className="app-root">
      <header className="top-bar">
        <Link to="/" className="brand">Energy Analyzer</Link>
        <nav className="nav">
          <NavLink to="/">Projects</NavLink>
        </nav>
      </header>
      <AnimatedRoutes />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

export default App;
