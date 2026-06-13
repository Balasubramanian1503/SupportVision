import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic, MicOff, Video, VideoOff, Monitor, MessageSquare, PhoneOff,
  Radio, Send, Paperclip, X, Download, ShieldAlert, Wifi, WifiOff, FileText
} from 'lucide-react';

export default function CallScreen() {
  const { id: sessionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, API_URL } = useAuth();
  const { socket, isConnected } = useSocket();
  const { showToast } = useToast();

  // Participant identity (passed from Dashboard or Join Room screen)
  const displayName = location.state?.displayName || user?.name || 'Guest';
  const role = location.state?.role || user?.role || 'CUSTOMER';
  const userId = location.state?.userId || user?.id || null;

  // Media States
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  
  // Connection States
  const [connStatus, setConnStatus] = useState('Connecting'); // 'Connected' | 'Reconnecting' | 'Disconnected'
  const [callDuration, setCallDuration] = useState(0);

  // Recording States (Agent Only)
  const [isRecording, setIsRecording] = useState(false);
  const [recStatus, setRecStatus] = useState(null); // 'RECORDING' | 'PROCESSING' | 'READY'

  // Chat Drawer States
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);

  // WebRTC References
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionsRef = useRef(new Map()); // socketId -> RTCPeerConnection
  const localStreamRef = useRef(null);

  // Recording Mix References
  const mediaRecorderRef = useRef(null);
  const mixCanvasRef = useRef(null);
  const canvasAnimFrameRef = useRef(null);
  const audioContextRef = useRef(null);

  // 30-Second Reconnect Timeout Ref
  const reconnectTimeoutRef = useRef(null);

  // --- DURATION TIMER ---
  useEffect(() => {
    const timer = setInterval(() => {
      if (connStatus === 'Connected') {
        setCallDuration((prev) => prev + 1);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [connStatus]);

  // --- FORMAT DURATION ---
  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  // --- LOAD LOCAL MEDIA ---
  const startLocalMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 24 }
        },
        audio: true
      });
      setLocalStream(stream);
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch (err) {
      console.error('Error fetching webcam/microphone streams:', err);
      showToast('Could not access microphone or camera. Check browser permissions.', 'error');
      throw err;
    }
  };

  // --- INITIALIZE WEBRTC ---
  useEffect(() => {
    let streamInstance;
    
    const initCall = async () => {
      try {
        streamInstance = await startLocalMedia();
        setConnStatus('Connected');
        
        if (socket) {
          // Join signaling room
          socket.emit('join-room', {
            sessionId,
            userId,
            displayName,
            role
          });
        }
      } catch (err) {
        setConnStatus('Disconnected');
      }
    };

    initCall();

    return () => {
      // Cleanup tracks
      if (streamInstance) {
        streamInstance.getTracks().forEach((track) => track.stop());
      }
      if (canvasAnimFrameRef.current) {
        cancelAnimationFrame(canvasAnimFrameRef.current);
      }
      // Stop recording if active
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, [sessionId, socket]);

  // --- SOCKET EVENT HANDLERS ---
  useEffect(() => {
    if (!socket) return;

    // Receive current participants and trigger offers to connect
    socket.on('current-participants', async (otherParticipantSocketIds) => {
      console.log('Current room participants received:', otherParticipantSocketIds);
      for (const targetId of otherParticipantSocketIds) {
        await createPeerConnection(targetId, true);
      }
    });

    // Receive participant join notification
    socket.on('participant-joined', async ({ id, displayName: joinedName, role: joinedRole }) => {
      showToast(`${joinedName} (${joinedRole}) has joined the session`, 'info');
      await createPeerConnection(id, false);
    });

    // Receive ICE Candidate
    socket.on('ice-candidate', async ({ senderId, candidate }) => {
      const pc = peerConnectionsRef.current.get(senderId);
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error('Error adding ICE Candidate:', e);
        }
      }
    });

    // Receive SDP Offer
    socket.on('webrtc-offer', async ({ senderId, offer }) => {
      let pc = peerConnectionsRef.current.get(senderId);
      if (!pc) {
        pc = await createPeerConnection(senderId, false);
      }
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        socket.emit('webrtc-answer', {
          targetId: senderId,
          answer
        });
      } catch (e) {
        console.error('Error responding to offer:', e);
      }
    });

    // Receive SDP Answer
    socket.on('webrtc-answer', async ({ senderId, answer }) => {
      const pc = peerConnectionsRef.current.get(senderId);
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (e) {
          console.error('Error resolving SDP answer:', e);
        }
      }
    });

    // Receive Participant Leave Notification
    socket.on('participant-left', ({ id }) => {
      const pc = peerConnectionsRef.current.get(id);
      if (pc) {
        pc.close();
        peerConnectionsRef.current.delete(id);
      }
      setRemoteStream(null);
      showToast('Participant disconnected', 'warning');
    });

    // Receive Session Ended Broadcast
    socket.on('session-ended', () => {
      showToast('This session has been terminated by the agent.', 'error');
      setTimeout(() => {
        exitCall();
      }, 3000);
    });

    // Receive message logs
    socket.on('chat-message', (savedMsg) => {
      setMessages((prev) => [...prev, savedMsg]);
      if (!isChatOpen) {
        setUnreadMessages((prev) => prev + 1);
      }
    });

    // Receive recording state changes
    socket.on('recording-started', () => {
      setIsRecording(true);
      setRecStatus('RECORDING');
      showToast('Call recording started', 'warning');
    });

    socket.on('recording-processing', () => {
      setRecStatus('PROCESSING');
      showToast('Muxing audio/video streams...', 'info');
    });

    socket.on('recording-ready', ({ url }) => {
      setIsRecording(false);
      setRecStatus('READY');
      showToast('Recording processed and ready for download!', 'success');
    });

    return () => {
      socket.off('current-participants');
      socket.off('participant-joined');
      socket.off('ice-candidate');
      socket.off('webrtc-offer');
      socket.off('webrtc-answer');
      socket.off('participant-left');
      socket.off('session-ended');
      socket.off('chat-message');
      socket.off('recording-started');
      socket.off('recording-processing');
      socket.off('recording-ready');
    };
  }, [socket, isChatOpen]);

  // --- SOCKET DISCONNECT RECONNECT GRACE MONITOR ---
  useEffect(() => {
    if (isConnected) {
      if (connStatus === 'Reconnecting') {
        setConnStatus('Connected');
        showToast('WebSocket connection re-established', 'success');
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    } else {
      if (connStatus === 'Connected') {
        setConnStatus('Reconnecting');
        showToast('Lost connection! Reconnecting in 30s...', 'warning');

        // Start 30s grace window
        reconnectTimeoutRef.current = setTimeout(() => {
          setConnStatus('Disconnected');
          showToast('Connection timed out. Call terminated.', 'error');
        }, 30000);
      }
    }
  }, [isConnected]);

  // --- CREATE PEER CONNECTION ---
  const createPeerConnection = async (targetId, isInitiator) => {
    // Configure WebRTC to force relay via our STUN/TURN server
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:localhost:3478' },
        { 
          urls: 'turn:localhost:3478', 
          username: 'supportvision', 
          credential: 'supportvisionpass123!' 
        }
      ],
      iceTransportPolicy: 'relay' // Satisfies direct P2P restriction
    });

    peerConnectionsRef.current.set(targetId, pc);

    // Attach local streams
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // Exchange ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('ice-candidate', {
          targetId,
          candidate: event.candidate
        });
      }
    };

    // Track remote feeds
    pc.ontrack = (event) => {
      console.log('Remote tracks detected:', event.streams);
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      }
    };

    // Negotiation Needed
    pc.onnegotiationneeded = async () => {
      if (isInitiator) {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          if (socket) {
            socket.emit('webrtc-offer', {
              targetId,
              offer
            });
          }
        } catch (e) {
          console.error('Offer negotiation failed:', e);
        }
      }
    };

    return pc;
  };

  // --- TOGGLE MIC ---
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  // --- TOGGLE CAMERA ---
  const toggleCamera = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraOff(!videoTrack.enabled);
      }
    }
  };

  // --- SCREEN SHARE TOGGLE ---
  const toggleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        // Start screen sharing
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];

        // Replace track in all peer connections
        peerConnectionsRef.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack);
          }
        });

        // Set local source
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }

        screenTrack.onended = () => {
          revertToWebcam();
        };

        setIsScreenSharing(true);
      } else {
        revertToWebcam();
      }
    } catch (e) {
      console.error('Screen sharing error:', e);
    }
  };

  const revertToWebcam = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      peerConnectionsRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track.kind === 'video');
        if (sender && videoTrack) {
          sender.replaceTrack(videoTrack);
        }
      });
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      setIsScreenSharing(false);
    }
  };

  // --- EXIT CALL ---
  const exitCall = () => {
    // End all tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    // Stop animation loops
    if (canvasAnimFrameRef.current) {
      cancelAnimationFrame(canvasAnimFrameRef.current);
    }
    // Close connections
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();

    if (socket) {
      socket.disconnect();
    }

    if (role === 'AGENT') {
      navigate('/dashboard');
    } else {
      navigate('/');
    }
  };

  // --- CHAT MSG SUBMIT ---
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim() || !socket) return;

    socket.emit('chat-message', {
      sessionId,
      senderId: userId,
      senderName: displayName,
      message: inputText.trim()
    });

    setInputText('');
  };

  // --- FILE ATTACHMENT UPLOAD FLOW ---
  const handleFileUpload = async (file) => {
    if (!file) return;
    setUploadProgress(10);

    const formData = new FormData();
    formData.append('file', file);

    try {
      setUploadProgress(40);
      const res = await fetch(`${API_URL}/uploads`, {
        method: 'POST',
        body: formData
      });
      setUploadProgress(70);

      if (res.ok) {
        const fileData = await res.json();
        setUploadProgress(100);
        
        // Emit chat message containing the shared file URL
        socket.emit('chat-message', {
          sessionId,
          senderId: userId,
          senderName: displayName,
          message: `Shared file: ${file.name}`,
          fileUrl: fileData.fileUrl,
          fileName: fileData.fileName,
          fileType: fileData.fileType
        });
        
        showToast(`File shared: ${file.name}`, 'success');
      } else {
        showToast('File size or type not supported', 'error');
      }
    } catch (e) {
      showToast('Network error sharing file', 'error');
    } finally {
      setTimeout(() => setUploadProgress(null), 1000);
    }
  };

  const onDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    handleFileUpload(file);
  };

  // --- REAL-TIME AUDIO & VIDEO MIXING FOR AGENT RECORDING ---
  const startRecordingStream = async () => {
    if (!socket || isRecording) return;
    
    try {
      // 1. Emit start event
      socket.emit('start-recording', { sessionId });
      
      // 2. Set up hidden canvas for mixing video streams
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      mixCanvasRef.current = canvas;
      const ctx = canvas.getContext('2d');

      // Video tracks
      const localVideoElement = localVideoRef.current;
      const remoteVideoElement = remoteVideoRef.current;

      const drawLoop = () => {
        ctx.fillStyle = '#090d16'; // sleek deep background
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw side-by-side local & remote screens
        let videoCount = 0;
        if (localVideoElement && localStream) videoCount++;
        if (remoteVideoElement && remoteStream) videoCount++;

        if (videoCount === 1) {
          // Fill screen with active stream
          const activeVideo = (localVideoElement && localStream) ? localVideoElement : remoteVideoElement;
          ctx.drawImage(activeVideo, 0, 0, canvas.width, canvas.height);
        } else if (videoCount === 2) {
          // Render side by side
          ctx.drawImage(localVideoElement, 0, 120, 630, 480);
          ctx.drawImage(remoteVideoElement, 650, 120, 630, 480);
        } else {
          // Loading text placeholder
          ctx.fillStyle = '#ffffff';
          ctx.font = '24px Inter';
          ctx.fillText('Waiting for video connection...', 450, 360);
        }

        canvasAnimFrameRef.current = requestAnimationFrame(drawLoop);
      };

      // Launch canvas render loop
      drawLoop();

      // 3. Audio Context mixing for audio tracks
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioCtx;
      const dest = audioCtx.createMediaStreamDestination();

      let localAudioSourceNode = null;
      let remoteAudioSourceNode = null;

      // Add local audio
      if (localStream && localStream.getAudioTracks().length > 0) {
        localAudioSourceNode = audioCtx.createMediaStreamSource(localStream);
        localAudioSourceNode.connect(dest);
      }

      // Add remote audio
      if (remoteStream && remoteStream.getAudioTracks().length > 0) {
        remoteAudioSourceNode = audioCtx.createMediaStreamSource(remoteStream);
        remoteAudioSourceNode.connect(dest);
      }

      // 4. Capture mixed Stream
      const mixStream = new MediaStream();
      
      // Get mixed video track
      const videoTrack = canvas.captureStream(24).getVideoTracks()[0];
      if (videoTrack) mixStream.addTrack(videoTrack);

      // Get mixed audio track
      const audioTrack = dest.stream.getAudioTracks()[0];
      if (audioTrack) mixStream.addTrack(audioTrack);

      // 5. Initialize MediaRecorder
      const options = { mimeType: 'video/webm;codecs=vp8,opus' };
      const recorder = new MediaRecorder(mixStream, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = async (e) => {
        if (e.data && e.data.size > 0) {
          const buffer = await e.data.arrayBuffer();
          // Emit binary chunks directly to the backend
          socket.emit('recording-chunk', {
            sessionId,
            chunk: buffer
          });
        }
      };

      // Record in 1-second chunks
      recorder.start(1000);
      console.log('Client-side MediaRecorder initialized & streaming...');
    } catch (e) {
      console.error('Recording initializer error:', e);
      showToast('Unable to start screen recording mixer', 'error');
    }
  };

  const stopRecordingStream = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (canvasAnimFrameRef.current) {
      cancelAnimationFrame(canvasAnimFrameRef.current);
    }
    if (socket) {
      socket.emit('stop-recording', { sessionId });
    }
  };

  const toggleRecording = () => {
    if (!isRecording) {
      startRecordingStream();
    } else {
      stopRecordingStream();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-between p-6 overflow-y-auto">
      
      {/* Upper Status Header */}
      <header className="flex justify-between items-center bg-slate-900/40 border border-white/5 px-6 py-3 rounded-2xl mb-6 shadow-md">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-brand-indigo to-brand-purple p-1.5 rounded-lg">
            <Video className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-bold text-slate-200">SupportVision Room: {sessionId}</span>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs text-slate-300">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
            <span className="font-mono font-bold">{formatTime(callDuration)}</span>
          </div>

          <div className="h-4 w-px bg-slate-800" />

          <div className="flex items-center gap-1.5 text-xs font-bold">
            {connStatus === 'Connected' ? (
              <span className="text-emerald-400 flex items-center gap-1">
                <Wifi className="w-3.5 h-3.5" />
                <span>CONNECTED</span>
              </span>
            ) : connStatus === 'Reconnecting' ? (
              <span className="text-amber-400 flex items-center gap-1 animate-pulse">
                <WifiOff className="w-3.5 h-3.5" />
                <span>RECONNECTING</span>
              </span>
            ) : (
              <span className="text-rose-500 flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>DISCONNECTED</span>
              </span>
            )}
          </div>

          {/* pulsing recording indicator for agent */}
          {isRecording && (
            <div className="bg-rose-600/15 border border-rose-500/30 px-3 py-1 rounded-xl flex items-center gap-1.5 pulse-rec">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              <span className="text-[9px] font-bold tracking-widest text-rose-300">REC</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Core Layout Grid */}
      <div className="flex-1 flex flex-col gap-6 max-w-6xl mx-auto w-full">
        
        {/* Row 1: side-by-side video feeds */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Agent Video Column */}
          <div className="aspect-video rounded-3xl bg-slate-900 border border-white/5 relative overflow-hidden shadow-xl flex items-center justify-center">
            {role !== 'AGENT' && !remoteStream ? (
              <div className="flex flex-col items-center gap-3 text-center p-6">
                <div className="w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 animate-pulse">
                  <Video className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-300">Waiting for Agent...</h4>
                  <p className="text-[10px] text-slate-500 mt-1 max-w-xs">The support representative will stream video once connected.</p>
                </div>
              </div>
            ) : (
              <video
                ref={role === 'AGENT' ? localVideoRef : remoteVideoRef}
                autoPlay
                playsInline
                muted={role === 'AGENT'} // mute self local loopback
                className="w-full h-full object-cover"
              />
            )}
            <div className="absolute bottom-4 left-4 px-2 py-1 bg-slate-950/80 border border-slate-800 rounded-lg text-[10px] font-bold text-indigo-300 uppercase tracking-wide">
              Agent Video {role === 'AGENT' && '(You)'}
            </div>
          </div>

          {/* Customer Video Column */}
          <div className="aspect-video rounded-3xl bg-slate-900 border border-white/5 relative overflow-hidden shadow-xl flex items-center justify-center">
            {role === 'AGENT' && !remoteStream ? (
              <div className="flex flex-col items-center gap-3 text-center p-6">
                <div className="w-12 h-12 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 animate-pulse">
                  <Video className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-300">Waiting for Customer...</h4>
                  <p className="text-[10px] text-slate-500 mt-1 max-w-xs">Provide the link token to your customer to initialize their stream.</p>
                </div>
              </div>
            ) : (
              <video
                ref={role === 'AGENT' ? remoteVideoRef : localVideoRef}
                autoPlay
                playsInline
                muted={role !== 'AGENT'} // mute self local loopback
                className="w-full h-full object-cover"
              />
            )}
            <div className="absolute bottom-4 left-4 px-2 py-1 bg-slate-950/80 border border-slate-800 rounded-lg text-[10px] font-bold text-purple-300 uppercase tracking-wide">
              Customer Video {role !== 'AGENT' && '(You)'}
            </div>
          </div>
        </div>

        {/* Row 2: Full-width Chat Panel */}
        <div 
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`glass-panel rounded-3xl border border-white/5 flex flex-col justify-between shadow-xl h-72 relative overflow-hidden transition-all ${
            isDragging ? 'bg-indigo-500/5 border-indigo-500/30' : ''
          }`}
        >
          {isDragging && (
            <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center gap-2 text-indigo-400 z-10">
              <Paperclip className="w-6 h-6 animate-bounce" />
              <span className="text-xs font-semibold">Drop diagnostic files here to share</span>
            </div>
          )}

          {/* Chat Messages */}
          <div className="flex-1 p-5 overflow-y-auto flex flex-col gap-3.5">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <MessageSquare className="w-6 h-6 text-slate-700 mb-1.5" />
                <span className="text-xs text-slate-400 font-semibold">Diagnostic Chat Started</span>
                <p className="text-[10px] text-slate-500 mt-0.5">Drag & drop files or type text to exchange screenshots or log updates.</p>
              </div>
            ) : (
              messages.map((m) => {
                const isSelf = m.senderId === userId || m.senderName === displayName;
                return (
                  <div 
                    key={m.id} 
                    className={`flex flex-col gap-0.5 max-w-[80%] ${
                      isSelf ? 'self-end items-end' : 'self-start items-start'
                    }`}
                  >
                    <span className="text-[9px] text-slate-500 font-bold">{m.senderName}</span>
                    <div className={`p-3 rounded-2xl text-xs leading-relaxed ${
                      isSelf 
                        ? 'bg-brand-indigo text-white rounded-tr-none' 
                        : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none'
                    }`}>
                      {m.message}
                      {m.fileUrl && (
                        <div className="mt-2 p-1.5 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-3 max-w-sm">
                          <div className="flex items-center gap-1.5 overflow-hidden">
                            {m.fileType?.startsWith('image/') ? (
                              <img 
                                src={`http://localhost:5000${m.fileUrl}`} 
                                alt="Shared file" 
                                className="w-8 h-8 rounded object-cover border border-white/5 shrink-0"
                              />
                            ) : (
                              <FileText className="w-4.5 h-4.5 text-indigo-400 shrink-0" />
                            )}
                            <span className="text-[10px] text-slate-300 font-semibold truncate max-w-[120px]">{m.fileName}</span>
                          </div>
                          <a
                            href={`http://localhost:5000${m.fileUrl}`}
                            download
                            className="p-1 hover:bg-slate-800 rounded text-indigo-400 hover:text-indigo-300"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Upload Progress */}
          {uploadProgress !== null && (
            <div className="bg-slate-900 h-1 w-full overflow-hidden">
              <div className="bg-brand-purple h-full transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
            </div>
          )}

          {/* Chat Inputs */}
          <footer className="p-3 bg-slate-950/60 border-t border-slate-900">
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Type your support message..."
                className="flex-1 glass-input px-4 py-2.5 rounded-xl text-xs"
              />
              
              <label className="p-2.5 bg-slate-900 border border-slate-850 hover:border-slate-700 rounded-xl flex items-center justify-center cursor-pointer text-slate-400 hover:text-white transition-colors">
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => handleFileUpload(e.target.files[0])}
                />
                <Paperclip className="w-4 h-4" />
              </label>

              <button
                type="submit"
                className="bg-brand-indigo hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5"
              >
                <span>Send</span>
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </footer>
        </div>

        {/* Row 3: Bottom Control Bar */}
        <footer className="flex justify-center items-center gap-4">
          <div className="glass-panel px-6 py-4 rounded-3xl border border-white/5 shadow-2xl flex items-center gap-4">
            {/* Mute Button */}
            <button
              onClick={toggleMute}
              className={`px-4 py-2.5 rounded-xl border flex items-center gap-2 text-xs font-semibold transition-all ${
                isMuted
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              {isMuted ? <MicOff className="w-4.5 h-4.5" /> : <Mic className="w-4.5 h-4.5" />}
              <span>{isMuted ? 'Unmute Microphone' : 'Mute Microphone'}</span>
            </button>

            {/* Camera Button */}
            <button
              onClick={toggleCamera}
              className={`px-4 py-2.5 rounded-xl border flex items-center gap-2 text-xs font-semibold transition-all ${
                isCameraOff
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              {isCameraOff ? <VideoOff className="w-4.5 h-4.5" /> : <Video className="w-4.5 h-4.5" />}
              <span>{isCameraOff ? 'Camera On' : 'Camera Off'}</span>
            </button>

            {/* Screen Share (Keep as a bonus diagnostics feature!) */}
            <button
              onClick={toggleScreenShare}
              className={`p-2.5 rounded-xl border transition-all ${
                isScreenSharing
                  ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
              title="Share Screen"
            >
              <Monitor className="w-4.5 h-4.5" />
            </button>

            {/* Record Call (Agent only) */}
            {role === 'AGENT' && (
              <button
                onClick={toggleRecording}
                className={`px-4 py-2.5 rounded-xl border flex items-center gap-2 text-xs font-semibold transition-all ${
                  isRecording
                    ? 'bg-rose-600 border-rose-500 text-white shadow-lg shadow-rose-600/20 animate-pulse'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <Radio className="w-4.5 h-4.5" />
                <span>{isRecording ? 'Recording...' : 'Record Session'}</span>
              </button>
            )}

            <div className="w-px h-6 bg-slate-800" />

            {/* End Call Button */}
            <button
              onClick={exitCall}
              className="bg-rose-600 hover:bg-rose-500 text-white px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-rose-600/20 transition-colors"
            >
              <PhoneOff className="w-4.5 h-4.5" />
              <span>End Session</span>
            </button>
          </div>
        </footer>

      </div>
    </div>
  );
}
