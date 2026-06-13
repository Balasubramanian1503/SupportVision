import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Video, Shield, MessageSquare, Flame, Sparkles, ChevronRight, PlayCircle, Keyboard } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

export default function Landing() {
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [roomToken, setRoomToken] = useState('');
  const { showToast } = useToast();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Auto-redirect authenticated users straight to their workspace
  useEffect(() => {
    if (user) {
      if (user.role === 'AGENT') {
        navigate('/dashboard');
      } else {
        navigate('/join');
      }
    }
  }, [user, navigate]);

  const handleJoinSession = (e) => {
    e.preventDefault();
    if (!roomToken.trim()) {
      showToast('Please enter a session ID or link', 'warning');
      return;
    }
    
    // Extract token if they pasted a full URL
    let token = roomToken.trim();
    if (token.includes('/join/')) {
      token = token.split('/join/').pop();
    }
    
    navigate(`/join/${token}`);
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col justify-between">
      {/* Decorative background gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Header */}
      <header className="w-full max-w-7xl mx-auto px-6 py-6 flex justify-between items-center z-10">
        <div className="flex items-center gap-2">
          <div className="bg-gradient-to-tr from-brand-indigo to-brand-purple p-2.5 rounded-xl shadow-lg">
            <Video className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white">
            SupportVision
          </span>
        </div>

        <div className="flex items-center gap-4 text-sm font-semibold">
          {user ? (
            <>
              <Link 
                to={user.role === 'AGENT' ? "/dashboard" : "/join"} 
                className="text-slate-300 hover:text-white transition-colors"
              >
                Go to Dashboard
              </Link>
              <button 
                onClick={logout}
                className="bg-rose-600 hover:bg-rose-500 text-white font-semibold px-5 py-2.5 rounded-xl shadow-lg transition-all"
              >
                Sign Out
              </button>
            </>
          ) : (
            <Link 
              to="/login" 
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-5 py-2.5 rounded-xl shadow-lg transition-all"
            >
              Agent Login
            </Link>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex items-center justify-center py-12 px-6 z-10">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Left Text Column */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:col-span-7 flex flex-col gap-6 text-left"
          >
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold w-fit">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Customer Video Support Engine</span>
            </div>

            <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight leading-[1.15] text-white">
              SupportVision
            </h1>
            
            <p className="text-2xl sm:text-3xl font-semibold bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 bg-clip-text text-transparent leading-snug">
              "See the problem. Solve it faster."
            </p>

            <p className="text-slate-400 text-base sm:text-lg max-w-xl leading-relaxed">
              Don't force customers to explain complex hardware or software bugs over chat. Start a real-time relayed video session instantly and solve diagnostic issues face-to-face.
            </p>

            <div className="flex flex-wrap gap-4 mt-2">
              <Link 
                to="/login"
                className="bg-gradient-to-r from-brand-indigo to-brand-purple hover:opacity-95 text-white font-semibold px-6 py-3.5 rounded-xl flex items-center gap-2 shadow-xl transition-all"
              >
                <PlayCircle className="w-4 h-4 text-white" />
                <span>Agent Login</span>
              </Link>
              <button 
                onClick={() => setShowJoinModal(true)}
                className="glass-card hover:bg-slate-800/60 text-slate-200 hover:text-white font-semibold px-6 py-3.5 rounded-xl flex items-center gap-2 border border-slate-700/50 transition-all"
              >
                <Keyboard className="w-4 h-4 text-indigo-400" />
                <span>Join Support Session</span>
              </button>
            </div>
          </motion.div>

          {/* Right Visual Column */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="lg:col-span-5 relative w-full flex justify-center items-center"
          >
            <div className="w-full relative glass-panel p-6 rounded-3xl border border-white/10 shadow-2xl">
              <div className="flex justify-between items-center border-b border-slate-800/80 pb-4 mb-6">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-rose-500/80" />
                  <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                </div>
                <div className="text-xs font-semibold text-slate-500">Video Diagnostics Room</div>
              </div>

              {/* Side-by-side call mockup */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="aspect-[4/3] rounded-2xl bg-slate-900 border border-slate-800/60 relative overflow-hidden flex flex-col justify-end p-3">
                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-indigo-500/10 rounded-md text-[10px] text-indigo-300 font-semibold border border-indigo-500/10">Agent Video</div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="bg-indigo-500 h-full w-[45%]" />
                  </div>
                </div>
                <div className="aspect-[4/3] rounded-2xl bg-slate-900 border border-slate-800/60 relative overflow-hidden flex flex-col justify-end p-3">
                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-purple-500/10 rounded-md text-[10px] text-purple-300 font-semibold border border-purple-500/10">Customer Video</div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="bg-purple-500 h-full w-[60%]" />
                  </div>
                </div>
              </div>

              {/* Controls mockup */}
              <div className="flex justify-center gap-3 p-2 bg-slate-950/60 rounded-2xl border border-slate-800/50">
                <div className="px-3 py-1.5 bg-slate-900 rounded-lg text-[10px] text-slate-400 font-semibold">Mute</div>
                <div className="px-3 py-1.5 bg-slate-900 rounded-lg text-[10px] text-slate-400 font-semibold">Camera</div>
                <div className="px-3 py-1.5 bg-rose-600 rounded-lg text-[10px] text-white font-semibold">End Session</div>
              </div>
            </div>
          </motion.div>
        </div>
      </main>

      {/* Join Session Modal */}
      <AnimatePresence>
        {showJoinModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="glass-panel p-6 max-w-md w-full rounded-3xl border border-white/10 shadow-2xl relative"
            >
              <button 
                onClick={() => setShowJoinModal(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>

              <h3 className="text-lg font-bold text-white mb-2">Join Support Session</h3>
              <p className="text-xs text-slate-400 mb-5">Enter the room token or invite link shared by your support representative.</p>

              <form onSubmit={handleJoinSession} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-slate-300 font-semibold">Session ID / Invitation Link</label>
                  <input
                    type="text"
                    value={roomToken}
                    onChange={(e) => setRoomToken(e.target.value)}
                    placeholder="Enter session token..."
                    className="glass-input px-4 py-3 rounded-xl text-sm w-full"
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-1.5 shadow-lg shadow-indigo-600/20"
                >
                  <span>Verify Link</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Feature section */}
      <footer className="w-full bg-slate-950/40 border-t border-slate-900 py-10 px-6 z-10">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="flex gap-4">
            <div className="bg-indigo-500/10 p-3 rounded-2xl border border-indigo-500/20 text-indigo-400 shrink-0 h-fit">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Secure TURN Architecture</h3>
              <p className="text-xs text-slate-400 leading-relaxed mt-1">
                Zero peer-to-peer leaks. All client diagnostic video streams route securely through custom local TURN relays.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="bg-purple-500/10 p-3 rounded-2xl border border-purple-500/20 text-purple-400 shrink-0 h-fit">
              <Flame className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">History & Auditing logs</h3>
              <p className="text-xs text-slate-400 leading-relaxed mt-1">
                Keep thorough track of agent logs, join/leave timestamps, and download raw media recording attachments.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="bg-pink-500/10 p-3 rounded-2xl border border-pink-500/20 text-pink-400 shrink-0 h-fit">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Diagnostic File Exchanges</h3>
              <p className="text-xs text-slate-400 leading-relaxed mt-1">
                Drag-and-drop diagnostic snapshots, code listings, or manuals directly in-call and review them in call archives.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// X icon missing import wrapper helper
const X = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
  </svg>
);
