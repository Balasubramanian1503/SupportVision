import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ToastProvider } from './context/ToastContext';
import { ProtectedRoute } from './components/RouteGuard';

// Pages
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import AgentDashboard from './pages/AgentDashboard';
import JoinRoom from './pages/JoinRoom';
import CallScreen from './pages/CallScreen';

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <ToastProvider>
          <Router>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/join/:token" element={<JoinRoom />} />
              <Route path="/join" element={<JoinRoom />} />
              <Route path="/join-room" element={<JoinRoom />} />

              {/* Protected Agent Routes */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute allowedRoles={['AGENT']}>
                    <AgentDashboard />
                  </ProtectedRoute>
                }
              />

              {/* Call Room Route (Accessible to Agents, Customers, and Guests) */}
              <Route path="/call/:id" element={<CallScreen />} />

              {/* Fallback Redirect */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Router>
        </ToastProvider>
      </SocketProvider>
    </AuthProvider>
  );
}
