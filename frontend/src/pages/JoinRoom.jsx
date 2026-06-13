import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Video, User, AlertCircle, ArrowRight, LogIn } from 'lucide-react';
import { motion } from 'framer-motion';

export default function JoinRoom() {
  const { token } = useParams();
  const [inputToken, setInputToken] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isValidating, setIsValidating] = useState(true);
  const [sessionInfo, setSessionInfo] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const { user, API_URL } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  // Validate the invitation token on load
  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        setIsValidating(false);
        return;
      }

      try {
        const res = await fetch(`${API_URL}/sessions/join/${token}`);
        const data = await res.json();

        if (res.ok && data.valid) {
          setSessionInfo(data.session);
          
          // If already logged in, automatically push them into the call
          if (user) {
            navigate(`/call/${token}`, { 
              state: { 
                displayName: user.name, 
                role: user.role,
                userId: user.id
              } 
            });
          }
        } else {
          setErrorMsg(data.error || 'This invite link is invalid or has expired.');
        }
      } catch (err) {
        console.error('Validation error:', err);
        setErrorMsg('Network error verifying invite link. Please check your connection.');
      } finally {
        setIsValidating(false);
      }
    };

    validateToken();
  }, [token, user, navigate, API_URL]);

  const handleJoinAsGuest = (e) => {
    e.preventDefault();
    const activeToken = token || inputToken.trim();
    if (!activeToken) {
      showToast('Please enter a Session ID', 'warning');
      return;
    }
    if (!displayName.trim()) {
      showToast('Please enter a display name to join', 'warning');
      return;
    }

    setIsJoining(true);
    showToast(`Joining session: ${displayName}`, 'info');
    
    // Navigate to call screen passing details in state
    navigate(`/call/${activeToken}`, {
      state: {
        displayName: displayName.trim(),
        role: 'GUEST',
        userId: null
      }
    });
  };

  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand-purple"></div>
          <span className="text-slate-400 text-xs font-semibold">Validating invite link...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden bg-slate-950">
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/5 blur-[120px] rounded-full pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="bg-gradient-to-tr from-brand-indigo to-brand-purple p-2.5 rounded-xl shadow-lg">
              <Video className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold tracking-tight text-white">SupportVision</span>
          </div>
          <p className="text-slate-400 text-sm">Secure Real-time Support Session</p>
        </div>

        {/* Card Body */}
        <div className="glass-panel p-8 rounded-3xl border border-white/10 shadow-2xl">
          {errorMsg ? (
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-200">Unable to Join Room</h3>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{errorMsg}</p>
              </div>
              <Link
                to="/"
                className="mt-2 text-xs font-bold text-brand-purple hover:underline"
              >
                Back to Home Page
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <div className="text-center">
                <h3 className="text-sm font-bold text-slate-200">
                  {token ? "You've been invited!" : "Join Support Session"}
                </h3>
                {token && (
                  <p className="text-xs text-slate-400 mt-1 block">
                    Room: <span className="font-semibold text-slate-300">{sessionInfo?.title}</span>
                  </p>
                )}
              </div>

              <form onSubmit={handleJoinAsGuest} className="flex flex-col gap-4">
                {!token && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-300">Session ID / Room Token</label>
                    <input
                      type="text"
                      placeholder="Enter session token..."
                      value={inputToken}
                      onChange={(e) => setInputToken(e.target.value)}
                      className="w-full glass-input px-4 py-3.5 rounded-xl text-sm"
                    />
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-300">Enter Your Display Name</label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="e.g. Alice Smith"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full glass-input pl-10 pr-4 py-3.5 rounded-xl text-sm"
                      maxLength={25}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isJoining}
                  className="w-full bg-gradient-to-r from-brand-indigo to-brand-purple hover:opacity-95 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/15"
                >
                  <span>{isJoining ? 'Connecting...' : 'Join Call as Guest'}</span>
                  {!isJoining && <ArrowRight className="w-4 h-4" />}
                </button>
              </form>

              <div className="flex flex-col gap-3 pt-5 border-t border-slate-800/80 text-center">
                <span className="text-[10px] text-slate-500 font-medium">OR HOSTS / REGISTERED CLIENTS</span>
                <Link
                  to="/login"
                  className="glass-card hover:bg-slate-900 border border-slate-800/80 text-xs py-2.5 rounded-xl font-bold text-slate-300 flex items-center justify-center gap-2"
                >
                  <LogIn className="w-4 h-4 text-indigo-400" />
                  <span>Log In to Account</span>
                </Link>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
