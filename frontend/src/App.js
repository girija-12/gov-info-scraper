import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import GovInfoPortal from './GovInfoPortal';
import LoginPage from './LoginPage';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/portal" element={<GovInfoPortal />} />
      </Routes>
    </Router>
  );
}