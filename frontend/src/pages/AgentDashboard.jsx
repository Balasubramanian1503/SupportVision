import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';
import {
  Video, Shield, Clock, Power, History, Settings, Copy, Mail, Plus,
  Users, Activity, Ban, Server, Download, FileText, Check, ExternalLink, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function AgentDashboard() {
  const [activeTab, setActiveTab] = useState('sessions'); // 'sessions' | 'history' | 'admin' | 'settings'
  const [metrics, setMetrics] = useState({
    activeSessions: 0,
    connectedParticipants: 0,
    totalSessionsToday: 0,
    errorRate: 0
  });

  const [activeSessionsList, setActiveSessionsList] = useState([]);
  const [sessionHistoryList, setSessionHistoryList] = useState([]);
  const [selectedHistorySession, setSelectedHistorySession] = useState(null);
  
  // Admin specific lists
  const [adminEventLogs, setAdminEventLogs] = useState([]);
  
  // Session builder variables
  const [newSessionTitle, setNewSessionTitle] = useState('');
  const [createdSessionLink, setCreatedSessionLink] = useState(null);
  const [copiedSessionId, setCopiedSessionId] = useState(null);
  const [loadingAction, setLoadingAction] = useState(false);

  const { user, logout, API_URL, API_BASE_URL } = useAuth();
  const { socket } = useSocket();
  const { showToast } = useToast();
  const navigate = useNavigate();

  // Fetch Metrics JSON
  const fetchMetrics = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/metrics/json`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
      }
    } catch (err) {
      console.error('Metrics fetch error:', err);
    }
  };

  // Fetch Active Sessions
  const fetchActiveSessions = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/sessions/active`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setActiveSessionsList(data);
      }
    } catch (err) {
      console.error('Active sessions fetch error:', err);
    }
  };

  // Fetch Session History
  const fetchSessionHistory = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/sessions/history`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSessionHistoryList(data);
      }
    } catch (err) {
      console.error('History fetch error:', err);
    }
  };

  // Initial loads
  useEffect(() => {
    fetchMetrics();
    fetchActiveSessions();
    fetchSessionHistory();

    // Poll metrics & active rooms every 5 seconds for live visual counts
    const interval = setInterval(() => {
      fetchMetrics();
      fetchActiveSessions();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Listen to WebSocket events for real-time joins or leaves
  useEffect(() => {
    if (!socket) return;

    const handleSessionEnded = () => {
      fetchActiveSessions();
      fetchSessionHistory();
      fetchMetrics();
    };

    socket.on('session-ended', handleSessionEnded);
    socket.on('participant-joined', handleSessionEnded);
    socket.on('participant-left', handleSessionEnded);

    return () => {
      socket.off('session-ended', handleSessionEnded);
      socket.off('participant-joined', handleSessionEnded);
      socket.off('participant-left', handleSessionEnded);
    };
  }, [socket]);

  // Create Session
  const handleCreateSession = async (e) => {
    e.preventDefault();
    setLoadingAction(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title: newSessionTitle })
      });

      if (res.ok) {
        const session = await res.json();
        const inviteUrl = `${window.location.origin}/join/${session.id}`;
        setCreatedSessionLink(inviteUrl);
        setNewSessionTitle('');
        fetchActiveSessions();
        fetchMetrics();
        showToast('Support session created successfully!', 'success');
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to create session', 'error');
      }
    } catch (err) {
      showToast('Error connecting to the server', 'error');
    } finally {
      setLoadingAction(false);
    }
  };

  // End Session
  const handleEndSession = async (sessionId) => {
    if (!window.confirm('Are you sure you want to end this session for all participants?')) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/sessions/${sessionId}/end`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        showToast('Session terminated successfully.', 'success');
        fetchActiveSessions();
        fetchSessionHistory();
        fetchMetrics();
      } else {
        showToast('Failed to end session', 'error');
      }
    } catch (err) {
      showToast('Connection error ending session', 'error');
    }
  };

  // Copy invitation link to clipboard
  const handleCopyLink = (link, id) => {
    navigator.clipboard.writeText(link);
    setCopiedSessionId(id);
    showToast('Invitation link copied to clipboard!', 'success');
    setTimeout(() => setCopiedSessionId(null), 2500);
  };

  // View specific session details (from history list)
  const handleViewHistorySession = async (session) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/sessions/${session.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedHistorySession(data);
      }
    } catch (err) {
      showToast('Failed to fetch detailed logs', 'error');
    }
  };

  // Admin Logs load
  useEffect(() => {
    if (activeTab === 'admin') {
      const loadAdminLogs = async () => {
        // Collect events from active rooms & histories
        try {
          const token = localStorage.getItem('token');
          // Fetch event logs of all historical sessions
          const events = [];
          for (const s of sessionHistoryList) {
            const res = await fetch(`${API_URL}/sessions/${s.id}`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
              const fullDetails = await res.json();
              if (fullDetails.events) {
                fullDetails.events.forEach(evt => {
                  events.push({
                    ...evt,
                    sessionTitle: fullDetails.title,
                    sessionId: fullDetails.id
                  });
                });
              }
            }
          }
          events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          setAdminEventLogs(events);
        } catch (e) {
          console.error(e);
        }
      };
      loadAdminLogs();
    }
  }, [activeTab, sessionHistoryList, API_URL]);

  return (
    <div className="min-h-screen flex bg-slate-950 text-slate-100">
      
      {/* Sidebar Navigation */}
      <aside className="w-64 glass-panel border-r border-white/5 flex flex-col justify-between p-6 shrink-0">
        <div className="flex flex-col gap-8">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="bg-gradient-to-tr from-brand-indigo to-brand-purple p-2 rounded-lg">
              <Video className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent">
              SupportVision
            </span>
          </div>

          {/* User badge */}
          <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800/80 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-brand-indigo to-brand-purple flex items-center justify-center font-bold text-sm text-white">
              {user?.name?.substring(0, 2).toUpperCase()}
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-xs font-bold text-slate-200 truncate">{user?.name}</span>
              <span className="text-[10px] font-semibold text-indigo-400 capitalize">{user?.role} Portal</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-1.5">
            <button
              onClick={() => setActiveTab('sessions')}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'sessions'
                  ? 'bg-brand-indigo text-white shadow-lg shadow-indigo-600/15'
                  : 'text-slate-400 hover:bg-slate-900/40 hover:text-slate-200'
              }`}
            >
              <Video className="w-4.5 h-4.5" />
              <span>View Active Sessions</span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'history'
                  ? 'bg-brand-indigo text-white shadow-lg shadow-indigo-600/15'
                  : 'text-slate-400 hover:bg-slate-900/40 hover:text-slate-200'
              }`}
            >
              <History className="w-4.5 h-4.5" />
              <span>View Session History</span>
            </button>

            <button
              onClick={() => setActiveTab('admin')}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'admin'
                  ? 'bg-brand-indigo text-white shadow-lg shadow-indigo-600/15'
                  : 'text-slate-400 hover:bg-slate-900/40 hover:text-slate-200'
              }`}
            >
              <Shield className="w-4.5 h-4.5" />
              <span>Admin Panel</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'settings'
                  ? 'bg-brand-indigo text-white shadow-lg shadow-indigo-600/15'
                  : 'text-slate-400 hover:bg-slate-900/40 hover:text-slate-200'
              }`}
            >
              <Settings className="w-4.5 h-4.5" />
              <span>Settings</span>
            </button>
          </nav>
        </div>

        {/* Logout */}
        <button
          onClick={logout}
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-rose-400 hover:bg-rose-500/10 transition-colors"
        >
          <Power className="w-4.5 h-4.5" />
          <span>Sign Out</span>
        </button>
      </aside>

      {/* Main Dashboard Space */}
      <main className="flex-1 flex flex-col p-8 overflow-y-auto max-w-7xl mx-auto w-full">
        
        {/* Upper Header */}
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white capitalize">
              {activeTab === 'sessions' && 'View Active Sessions'}
              {activeTab === 'history' && 'View Session History'}
              {activeTab === 'admin' && 'System Admin Controls'}
              {activeTab === 'settings' && 'Platform Settings'}
            </h1>
            <p className="text-slate-400 text-xs mt-1">
              {activeTab === 'sessions' && 'Monitor active support calls and generate invitations.'}
              {activeTab === 'history' && 'Access transcripts, user logs, and recordings from past sessions.'}
              {activeTab === 'admin' && 'Expose server metrics, force terminate rooms, and inspect event records.'}
              {activeTab === 'settings' && 'Configure custom audio qualities, TURN codecs, and user profiles.'}
            </p>
          </div>

          <button 
            onClick={() => {
              fetchActiveSessions();
              fetchSessionHistory();
              fetchMetrics();
              showToast('Refreshed data!', 'info');
            }} 
            className="p-2 bg-slate-900 border border-slate-800 rounded-xl hover:border-slate-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-slate-400 hover:text-white" />
          </button>
        </header>

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          <div className="glass-card p-5 rounded-2xl flex items-center justify-between border border-slate-800/80">
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Rooms</span>
              <h3 className="text-2xl font-bold text-white mt-1.5">{metrics.activeSessions}</h3>
            </div>
            <div className="bg-indigo-500/10 p-3 rounded-xl text-indigo-400">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
          </div>

          <div className="glass-card p-5 rounded-2xl flex items-center justify-between border border-slate-800/80">
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Live Participants</span>
              <h3 className="text-2xl font-bold text-white mt-1.5">{metrics.connectedParticipants}</h3>
            </div>
            <div className="bg-purple-500/10 p-3 rounded-xl text-purple-400">
              <Users className="w-5 h-5" />
            </div>
          </div>

          <div className="glass-card p-5 rounded-2xl flex items-center justify-between border border-slate-800/80">
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Rooms Today</span>
              <h3 className="text-2xl font-bold text-white mt-1.5">{metrics.totalSessionsToday}</h3>
            </div>
            <div className="bg-pink-500/10 p-3 rounded-xl text-pink-400">
              <Server className="w-5 h-5" />
            </div>
          </div>

          <div className="glass-card p-5 rounded-2xl flex items-center justify-between border border-slate-800/80">
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Telemetric Errors</span>
              <h3 className="text-2xl font-bold text-slate-200 mt-1.5">{metrics.errorRate}</h3>
            </div>
            <div className="bg-rose-500/10 p-3 rounded-xl text-rose-400">
              <Ban className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Tab Contents */}
        <div className="flex-1">
          <AnimatePresence mode="wait">
            
            {/* TABS: ACTIVE SESSIONS */}
            {activeTab === 'sessions' && (
              <motion.div
                key="sessions"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-8"
              >
                {/* Session Builder */}
                <div className="lg:col-span-5 flex flex-col gap-6">
                  <div className="glass-panel p-6 rounded-3xl border border-white/5">
                    <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2">
                      <Plus className="w-4 h-4 text-brand-purple" />
                      <span>Create New Session</span>
                    </h3>
                    
                    <form onSubmit={handleCreateSession} className="flex flex-col gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-slate-400 font-semibold">Call Title (Optional)</label>
                        <input
                          type="text"
                          placeholder="e.g. Hardware Diagnostics Room"
                          value={newSessionTitle}
                          onChange={(e) => setNewSessionTitle(e.target.value)}
                          className="glass-input px-4 py-3 rounded-xl text-sm w-full"
                        />
                      </div>
                      
                      <button
                        type="submit"
                        disabled={loadingAction}
                        className="bg-gradient-to-r from-brand-indigo to-brand-purple hover:opacity-95 text-white text-sm font-semibold py-3 rounded-xl transition-all"
                      >
                        {loadingAction ? 'Generating Room...' : 'Create Invite Link'}
                      </button>
                    </form>

                    {/* Reveal link if created */}
                    {createdSessionLink && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="mt-6 p-4 rounded-2xl bg-indigo-950/20 border border-indigo-500/10"
                      >
                        <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block mb-2">Share Invite Details</span>
                        <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 p-2.5 rounded-xl">
                          <span className="text-xs text-slate-300 truncate flex-1">{createdSessionLink}</span>
                          <button
                            onClick={() => handleCopyLink(createdSessionLink, 'created')}
                            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-900 rounded-lg shrink-0"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="flex gap-2.5 mt-3.5">
                          <button
                            onClick={() => window.open(createdSessionLink, '_blank')}
                            className="flex-1 glass-card hover:bg-slate-900 text-xs py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 text-indigo-300 border border-slate-800/80"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Launch Room</span>
                          </button>
                          <a
                            href={`mailto:?subject=Join Support Session&body=Hello,%0D%0DPlease join my secure live support session by clicking this link:%0D${createdSessionLink}`}
                            className="flex-1 glass-card hover:bg-slate-900 text-xs py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 text-slate-300 border border-slate-800/80"
                          >
                            <Mail className="w-3.5 h-3.5" />
                            <span>Email Link</span>
                          </a>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>

                {/* Active Rooms Table */}
                <div className="lg:col-span-7 flex flex-col">
                  <div className="glass-panel rounded-3xl border border-white/5 overflow-hidden">
                    <div className="px-6 py-5 border-b border-slate-900 flex justify-between items-center bg-slate-900/10">
                      <h3 className="text-sm font-bold text-slate-200">Active Sessions Log</h3>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/15 text-[10px] font-bold uppercase tracking-wider">
                        {activeSessionsList.length} Live
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      {activeSessionsList.length === 0 ? (
                        <div className="p-12 text-center flex flex-col items-center justify-center">
                          <Video className="w-10 h-10 text-slate-600 mb-3" />
                          <h4 className="text-slate-300 font-semibold text-sm">No Active Rooms</h4>
                          <p className="text-slate-500 text-xs mt-1">Host a new support call on the left to start.</p>
                        </div>
                      ) : (
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-slate-900 text-slate-500 font-semibold text-xs bg-slate-900/5 select-none">
                              <th className="px-6 py-4">Title / Room ID</th>
                              <th className="px-6 py-4">Status</th>
                              <th className="px-6 py-4">Created At</th>
                              <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-900/40">
                            {activeSessionsList.map((session) => {
                              const joinUrl = `${window.location.origin}/join/${session.id}`;
                              return (
                                <tr key={session.id} className="hover:bg-slate-900/10 transition-colors">
                                  <td className="px-6 py-4 max-w-[200px]">
                                    <div className="font-semibold text-slate-200 truncate">{session.title}</div>
                                    <div className="text-[10px] text-indigo-400 tracking-tight font-medium mt-0.5 truncate">{session.id}</div>
                                  </td>
                                  <td className="px-6 py-4">
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-400/5 px-2 py-0.5 rounded border border-emerald-500/10 uppercase">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                      <span>Active</span>
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 text-xs text-slate-400">
                                    {new Date(session.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </td>
                                  <td className="px-6 py-4 text-right flex justify-end gap-2.5">
                                    <button
                                      onClick={() => handleCopyLink(joinUrl, session.id)}
                                      className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                                      title="Copy Invite Link"
                                    >
                                      {copiedSessionId === session.id ? (
                                        <Check className="w-4 h-4 text-emerald-400" />
                                      ) : (
                                        <Copy className="w-4 h-4" />
                                      )}
                                    </button>
                                    <button
                                      onClick={() => navigate(`/call/${session.id}`)}
                                      className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded-lg font-bold"
                                    >
                                      Join
                                    </button>
                                    <button
                                      onClick={() => handleEndSession(session.id)}
                                      className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs px-3 py-1.5 rounded-lg font-bold"
                                    >
                                      End
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* TABS: SESSION HISTORY ARCHIVES */}
            {activeTab === 'history' && (
              <motion.div
                key="history"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-8"
              >
                {/* Historical Sessions Table */}
                <div className="lg:col-span-6 flex flex-col">
                  <div className="glass-panel rounded-3xl border border-white/5 overflow-hidden">
                    <div className="px-6 py-5 border-b border-slate-900 bg-slate-900/10 flex justify-between items-center">
                      <h3 className="text-sm font-bold text-slate-200">Historical Call Archives</h3>
                    </div>

                    <div className="overflow-y-auto max-h-[500px]">
                      {sessionHistoryList.length === 0 ? (
                        <div className="p-12 text-center flex flex-col items-center justify-center">
                          <History className="w-10 h-10 text-slate-600 mb-3" />
                          <h4 className="text-slate-300 font-semibold text-sm">No Past Sessions</h4>
                          <p className="text-slate-500 text-xs mt-1">Details will appear here once calls end.</p>
                        </div>
                      ) : (
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-slate-900 text-slate-500 font-semibold text-xs select-none">
                              <th className="px-6 py-4">Room Details</th>
                              <th className="px-6 py-4">Recording</th>
                              <th className="px-6 py-4 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-900/40">
                            {sessionHistoryList.map((session) => (
                              <tr
                                key={session.id}
                                className={`hover:bg-slate-900/10 transition-colors cursor-pointer ${
                                  selectedHistorySession?.id === session.id ? 'bg-indigo-600/5' : ''
                                }`}
                                onClick={() => handleViewHistorySession(session)}
                              >
                                <td className="px-6 py-4">
                                  <div className="font-semibold text-slate-200">{session.title}</div>
                                  <div className="text-[10px] text-slate-500 mt-1">
                                    {new Date(session.createdAt).toLocaleDateString()} • {session.participants?.length || 0} participants
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  {session.recordingPath ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-400 bg-indigo-500/5 px-2 py-0.5 rounded border border-indigo-500/10 uppercase">
                                      Ready
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-slate-500">None</span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <button className="text-indigo-400 hover:text-indigo-300 text-xs font-bold">
                                    View Details
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>

                {/* Session Details Drawer Panel */}
                <div className="lg:col-span-6">
                  {selectedHistorySession ? (
                    <motion.div
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="glass-panel p-6 rounded-3xl border border-white/5 flex flex-col gap-6"
                    >
                      <header className="border-b border-slate-900 pb-4">
                        <div className="flex justify-between items-start gap-4">
                          <div>
                            <h2 className="text-base font-bold text-white leading-tight">{selectedHistorySession.title}</h2>
                            <p className="text-[10px] text-slate-500 mt-1">ID: {selectedHistorySession.id}</p>
                          </div>
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-bold uppercase">
                            Ended
                          </span>
                        </div>
                      </header>

                      {/* Call info */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-3.5 rounded-2xl bg-slate-900/40 border border-slate-800/80">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Duration</span>
                          <span className="text-sm font-bold text-slate-200 mt-1 block">
                            {(() => {
                              if (!selectedHistorySession.endedAt) return 'N/A';
                              const diff = new Date(selectedHistorySession.endedAt) - new Date(selectedHistorySession.createdAt);
                              const mins = Math.floor(diff / 60000);
                              const secs = Math.floor((diff % 60000) / 1000);
                              return `${mins}m ${secs}s`;
                            })()}
                          </span>
                        </div>

                        <div className="p-3.5 rounded-2xl bg-slate-900/40 border border-slate-800/80">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Recording</span>
                          {selectedHistorySession.recordingPath ? (
                            <a
                              href={`${API_BASE_URL}${selectedHistorySession.recordingPath}`}
                              download
                              className="text-xs font-bold text-brand-purple hover:underline flex items-center gap-1 mt-1.5"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Download MP4</span>
                            </a>
                          ) : (
                            <span className="text-xs font-bold text-slate-400 mt-1 block">No Recording</span>
                          )}
                        </div>
                      </div>

                      {/* Participant Checkins */}
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-3">Participants Log</span>
                        <div className="flex flex-col gap-2 max-h-32 overflow-y-auto">
                          {selectedHistorySession.participants?.map((p) => (
                            <div key={p.id} className="flex justify-between items-center p-2 rounded-xl bg-slate-900/25 border border-slate-800/30 text-xs">
                              <span className="font-semibold text-slate-300">{p.displayName} <span className="text-[10px] text-slate-500">({p.role})</span></span>
                              <span className="text-[10px] text-slate-500">
                                Joined {new Date(p.joinedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Chat Messages */}
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-3">Chat Transcript</span>
                        <div className="flex flex-col gap-3 max-h-48 overflow-y-auto p-3.5 rounded-2xl bg-slate-950/80 border border-slate-900">
                          {selectedHistorySession.messages?.length === 0 ? (
                            <span className="text-xs text-slate-500 text-center block py-4">No chat logs captured.</span>
                          ) : (
                            selectedHistorySession.messages?.map((m) => (
                              <div key={m.id} className="text-xs flex flex-col gap-1">
                                <div className="flex justify-between text-[10px] text-slate-500 font-semibold">
                                  <span>{m.senderName}</span>
                                  <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                                <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800/50 text-slate-300 leading-relaxed">
                                  {m.message}
                                  {m.fileUrl && (
                                    <div className="mt-1.5 p-1.5 rounded bg-slate-950/50 border border-slate-800 flex items-center justify-between">
                                      <span className="text-[10px] text-slate-400 truncate max-w-[150px]">{m.fileName}</span>
                                      <a
                                        href={`${API_BASE_URL}${m.fileUrl}`}
                                        download
                                        className="text-[10px] text-indigo-400 hover:underline flex items-center gap-0.5"
                                      >
                                        <Download className="w-3 h-3" />
                                        <span>Download</span>
                                      </a>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                    </motion.div>
                  ) : (
                    <div className="h-full border border-dashed border-slate-800 rounded-3xl p-12 text-center flex flex-col items-center justify-center">
                      <FileText className="w-10 h-10 text-slate-700 mb-3" />
                      <h4 className="text-slate-400 font-semibold text-sm">Inspect Archives</h4>
                      <p className="text-slate-500 text-xs mt-1">Select a past support session to read files, messages, and call metadata.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* TABS: ADMIN PANEL */}
            {activeTab === 'admin' && (
              <motion.div
                key="admin"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col gap-8"
              >
                {/* Admin list of active rooms to terminate */}
                <div className="glass-panel rounded-3xl border border-white/5 overflow-hidden">
                  <div className="px-6 py-5 border-b border-slate-900 bg-slate-900/10 flex justify-between items-center">
                    <h3 className="text-sm font-bold text-slate-200">Force Terminate Controls</h3>
                    <span className="text-xs text-rose-400 font-medium">Elevated privilege</span>
                  </div>

                  <div className="overflow-x-auto">
                    {activeSessionsList.length === 0 ? (
                      <div className="p-8 text-center text-xs text-slate-500">No active rooms found on the network.</div>
                    ) : (
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-slate-900 text-slate-500 font-semibold text-xs select-none">
                            <th className="px-6 py-4">Session Token</th>
                            <th className="px-6 py-4">Title</th>
                            <th className="px-6 py-4">Active Since</th>
                            <th className="px-6 py-4 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-900/40">
                          {activeSessionsList.map((session) => (
                            <tr key={session.id} className="hover:bg-slate-900/10 transition-colors">
                              <td className="px-6 py-4 font-mono text-xs text-indigo-400">{session.id}</td>
                              <td className="px-6 py-4 font-semibold text-slate-200">{session.title}</td>
                              <td className="px-6 py-4 text-xs text-slate-400">
                                {new Date(session.createdAt).toLocaleTimeString()}
                              </td>
                              <td className="px-6 py-4 text-right">
                                <button
                                  onClick={() => handleEndSession(session.id)}
                                  className="bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 text-xs px-3.5 py-1.5 rounded-lg border border-rose-500/10 hover:border-rose-500/25 transition-all font-bold"
                                >
                                  Force Terminate
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                {/* Audit Logs */}
                <div className="glass-panel rounded-3xl border border-white/5 overflow-hidden">
                  <div className="px-6 py-5 border-b border-slate-900 bg-slate-900/10 flex justify-between items-center">
                    <h3 className="text-sm font-bold text-slate-200">Session Event Auditing Logs</h3>
                  </div>
                  
                  <div className="overflow-y-auto max-h-[300px] text-xs">
                    {adminEventLogs.length === 0 ? (
                      <div className="p-8 text-center text-slate-500">No events logged in the database.</div>
                    ) : (
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-slate-900 text-slate-500 font-semibold text-[10px] uppercase select-none">
                            <th className="px-6 py-3">Timestamp</th>
                            <th className="px-6 py-3">Room Title</th>
                            <th className="px-6 py-3">Action Type</th>
                            <th className="px-6 py-3">Details</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-900/30 text-slate-400 font-mono">
                          {adminEventLogs.map((evt) => (
                            <tr key={evt.id} className="hover:bg-slate-900/5 transition-colors">
                              <td className="px-6 py-3 text-[10px] text-slate-500">
                                {new Date(evt.timestamp).toLocaleString()}
                              </td>
                              <td className="px-6 py-3 text-slate-300">{evt.sessionTitle}</td>
                              <td className="px-6 py-3">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                  evt.eventType === 'JOIN' ? 'bg-indigo-500/10 text-indigo-300' :
                                  evt.eventType === 'LEAVE' ? 'bg-amber-500/10 text-amber-300' :
                                  evt.eventType === 'FORCE_END' ? 'bg-rose-500/10 text-rose-300' :
                                  'bg-slate-800 text-slate-300'
                                }`}>
                                  {evt.eventType}
                                </span>
                              </td>
                              <td className="px-6 py-3 text-slate-300">{evt.details}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* TABS: SETTINGS */}
            {activeTab === 'settings' && (
              <motion.div
                key="settings"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-xl"
              >
                <div className="glass-panel p-6 rounded-3xl border border-white/5 flex flex-col gap-6">
                  <h3 className="text-sm font-bold text-slate-200 border-b border-slate-900 pb-3">User Profile</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">Name</span>
                      <span className="text-sm font-bold text-slate-200">{user?.name}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">Email</span>
                      <span className="text-sm font-bold text-slate-200">{user?.email}</span>
                    </div>
                  </div>

                  <h3 className="text-sm font-bold text-slate-200 border-b border-slate-900 pb-3 mt-4">WebRTC & TURN Configuration</h3>
                  <div className="flex flex-col gap-4 text-xs">
                    <div className="flex justify-between items-center p-3 rounded-xl bg-slate-900/40 border border-slate-800/80">
                      <div>
                        <span className="font-semibold text-slate-300 block">Forced Relay Mode</span>
                        <span className="text-slate-500 text-[10px] mt-0.5 block">Forces ICE candidate relay. Prevents direct P2P leakage.</span>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/15 text-[10px] font-bold uppercase">Active</span>
                    </div>

                    <div className="flex justify-between items-center p-3 rounded-xl bg-slate-900/40 border border-slate-800/80">
                      <div>
                        <span className="font-semibold text-slate-300 block">Relay Endpoint URL</span>
                        <span className="text-slate-500 text-[10px] mt-0.5 block">stun:localhost:3478 / turn:localhost:3478</span>
                      </div>
                      <span className="text-slate-300 font-mono text-[10px] bg-slate-950 px-2 py-1 rounded border border-slate-800">turn:localhost:3478</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

      </main>
    </div>
  );
}
