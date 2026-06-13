import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { PrismaClient } from '@prisma/client';
import Turn from 'node-turn';

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);

// Get dirname in ES Module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middlewares
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

// Constants
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret';
const TURN_PORT = parseInt(process.env.TURN_PORT || '3478');
const TURN_USER = process.env.TURN_USER || 'supportvision';
const TURN_PASS = process.env.TURN_PASS || 'supportvisionpass123!';

// In-memory stats for metrics
let connectedParticipantsCount = 0;
let errorsCount = 0;

// Multer storage configuration for chat attachments
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// ==========================================
// AUTH MIDDLEWARE
// ==========================================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

const requireRole = (role) => {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: 'Access denied: unauthorized role' });
    }
    next();
  };
};

// ==========================================
// AUTH ROUTES
// ==========================================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (role !== 'AGENT' && role !== 'CUSTOMER') {
      return res.status(400).json({ error: 'Invalid role selection' });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role
      }
    });

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (error) {
    console.error('Registration error:', error);
    errorsCount++;
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (error) {
    console.error('Login error:', error);
    errorsCount++;
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    });
  } catch (error) {
    console.error('Auth verification error:', error);
    errorsCount++;
    res.status(500).json({ error: 'Verification failed' });
  }
});

// ==========================================
// SESSION MANAGEMENT ROUTES
// ==========================================
app.post('/api/sessions', authenticateToken, requireRole('AGENT'), async (req, res) => {
  try {
    const { title } = req.body;

    const session = await prisma.session.create({
      data: {
        title: title || `Support Call - ${new Date().toLocaleDateString()}`,
        status: 'ACTIVE'
      }
    });

    // Log the creation event
    await prisma.sessionEvent.create({
      data: {
        sessionId: session.id,
        eventType: 'JOIN',
        userId: req.user.id,
        details: `Session created by Agent ${req.user.name}`
      }
    });

    res.status(201).json(session);
  } catch (error) {
    console.error('Session creation error:', error);
    errorsCount++;
    res.status(500).json({ error: 'Failed to create session' });
  }
});

app.get('/api/sessions/active', authenticateToken, async (req, res) => {
  try {
    const sessions = await prisma.session.findMany({
      where: { status: 'ACTIVE' },
      include: {
        participants: {
          where: { leftAt: null }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(sessions);
  } catch (error) {
    console.error('Fetch active sessions error:', error);
    errorsCount++;
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

app.get('/api/sessions/history', authenticateToken, async (req, res) => {
  try {
    const sessions = await prisma.session.findMany({
      where: { status: 'ENDED' },
      include: {
        participants: true,
        messages: true
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(sessions);
  } catch (error) {
    console.error('Fetch history error:', error);
    errorsCount++;
    res.status(500).json({ error: 'Failed to fetch session history' });
  }
});

app.get('/api/sessions/:id', authenticateToken, async (req, res) => {
  try {
    const session = await prisma.session.findUnique({
      where: { id: req.params.id },
      include: {
        participants: true,
        messages: { orderBy: { createdAt: 'asc' } },
        events: { orderBy: { timestamp: 'asc' } }
      }
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(session);
  } catch (error) {
    console.error('Fetch session details error:', error);
    errorsCount++;
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

app.post('/api/sessions/:id/end', authenticateToken, async (req, res) => {
  try {
    const session = await prisma.session.findUnique({ where: { id: req.params.id } });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Update session status
    const endedSession = await prisma.session.update({
      where: { id: req.params.id },
      data: {
        status: 'ENDED',
        endedAt: new Date()
      }
    });

    // Close all active participants
    await prisma.sessionParticipant.updateMany({
      where: { sessionId: req.params.id, leftAt: null },
      data: { leftAt: new Date() }
    });

    // Log the end event
    await prisma.sessionEvent.create({
      data: {
        sessionId: req.params.id,
        eventType: 'FORCE_END',
        userId: req.user.id,
        details: `Session terminated by user ${req.user.name}`
      }
    });

    // Notify clients in the room via Socket
    io.to(req.params.id).emit('session-ended');

    res.json({ message: 'Session ended successfully', session: endedSession });
  } catch (error) {
    console.error('End session error:', error);
    errorsCount++;
    res.status(500).json({ error: 'Failed to end session' });
  }
});

// Verify invitation token
app.get('/api/sessions/join/:token', async (req, res) => {
  try {
    const session = await prisma.session.findUnique({
      where: { id: req.params.token }
    });

    if (!session) {
      return res.status(404).json({ error: 'Invalid invite link: Session not found.' });
    }

    if (session.status === 'ENDED') {
      return res.status(400).json({ error: 'This session has already ended.' });
    }

    res.json({ valid: true, session });
  } catch (error) {
    console.error('Token validation error:', error);
    errorsCount++;
    res.status(500).json({ error: 'Failed to validate invite link.' });
  }
});

// ==========================================
// FILE UPLOAD ROUTE
// ==========================================
app.post('/api/uploads', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const fileUrl = `/uploads/${req.file.filename}`;
  res.status(201).json({
    fileUrl,
    fileName: req.file.originalname,
    fileType: req.file.mimetype
  });
});

// ==========================================
// METRICS ENDPOINT
// ==========================================
app.get('/api/metrics', async (req, res) => {
  try {
    const activeSessionsCount = await prisma.session.count({ where: { status: 'ACTIVE' } });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const totalSessionsToday = await prisma.session.count({
      where: {
        createdAt: {
          gte: today
        }
      }
    });

    // Format metrics in Prometheus Exposition format
    let metrics = `# HELP active_sessions The number of active sessions currently running
# TYPE active_sessions gauge
active_sessions ${activeSessionsCount}

# HELP connected_participants The number of connected WebSocket clients
# TYPE connected_participants gauge
connected_participants ${connectedParticipantsCount}

# HELP total_sessions_today The number of support sessions created today
# TYPE total_sessions_today counter
total_sessions_today ${totalSessionsToday}

# HELP error_rate The cumulative count of handled server errors
# TYPE error_rate counter
error_rate ${errorsCount}
`;
    res.set('Content-Type', 'text/plain; version=0.0.4');
    res.send(metrics);
  } catch (err) {
    console.error('Metrics gather error:', err);
    res.status(500).send('Error gathering metrics');
  }
});

// Internal metrics JSON endpoint for Agent dashboard widget
app.get('/api/metrics/json', authenticateToken, async (req, res) => {
  try {
    const activeSessions = await prisma.session.count({ where: { status: 'ACTIVE' } });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const totalSessionsToday = await prisma.session.count({
      where: {
        createdAt: {
          gte: today
        }
      }
    });

    res.json({
      activeSessions,
      connectedParticipants: connectedParticipantsCount,
      totalSessionsToday,
      errorRate: errorsCount
    });
  } catch (err) {
    res.status(500).json({ error: 'Metrics fetch failed' });
  }
});

// Fallback error handler
app.use((err, req, res, next) => {
  console.error('Unhandled request error:', err);
  errorsCount++;
  res.status(500).json({ error: 'An unexpected server error occurred' });
});


// ==========================================
// SOCKET.IO REAL-TIME & SIGNALING
// ==========================================
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Track stream files dynamically
const activeRecordings = new Map(); // sessionId -> { writeStream, filePath, rawFilename }

io.on('connection', (socket) => {
  connectedParticipantsCount++;
  let currentSessionId = null;
  let participantLogId = null;
  let userDisplayName = 'Guest';

  // Join Room
  socket.on('join-room', async ({ sessionId, userId, displayName, role }) => {
    currentSessionId = sessionId;
    userDisplayName = displayName || 'Guest';

    try {
      // Assert session exists in database and is ACTIVE
      const session = await prisma.session.findUnique({
        where: { id: sessionId }
      });

      if (!session || session.status !== 'ACTIVE') {
        console.warn(`Socket [${socket.id}] tried to join invalid or inactive session: ${sessionId}`);
        socket.emit('error', 'Session not found or already closed');
        return;
      }

      socket.join(sessionId);
      console.log(`Socket [${socket.id}] joined room: ${sessionId} as ${displayName} (${role})`);

      // 1. Log participant entry in database
      const participant = await prisma.sessionParticipant.create({
        data: {
          sessionId,
          userId: userId || null,
          displayName: userDisplayName,
          role
        }
      });
      participantLogId = participant.id;

      // Log event
      await prisma.sessionEvent.create({
        data: {
          sessionId,
          eventType: 'JOIN',
          userId: userId || null,
          details: `${userDisplayName} (${role}) joined the call`
        }
      });

      // 2. Notify other participants in the room
      socket.to(sessionId).emit('participant-joined', {
        id: socket.id,
        participantId: participant.id,
        displayName: userDisplayName,
        role
      });

      // 3. Emit current participants back to the joining user
      const clients = Array.from(io.sockets.adapter.rooms.get(sessionId) || []);
      const otherClients = clients.filter(id => id !== socket.id);
      socket.emit('current-participants', otherClients);

    } catch (error) {
      console.error('Error logging participant join:', error);
      errorsCount++;
      socket.emit('error', 'An error occurred while joining the session');
    }
  });

  // WebRTC Signaling Events
  socket.on('webrtc-offer', ({ targetId, offer }) => {
    io.to(targetId).emit('webrtc-offer', {
      senderId: socket.id,
      offer
    });
  });

  socket.on('webrtc-answer', ({ targetId, answer }) => {
    io.to(targetId).emit('webrtc-answer', {
      senderId: socket.id,
      answer
    });
  });

  socket.on('ice-candidate', ({ targetId, candidate }) => {
    io.to(targetId).emit('ice-candidate', {
      senderId: socket.id,
      candidate
    });
  });

  // Real-time Chat Messaging
  socket.on('chat-message', async (data) => {
    const { sessionId, senderId, senderName, message, fileUrl, fileName, fileType } = data;
    if (!sessionId) return;

    try {
      // Assert session exists in database
      const session = await prisma.session.findUnique({
        where: { id: sessionId }
      });

      if (!session) {
        console.warn(`ChatMessage received for invalid session: ${sessionId}`);
        return;
      }

      // Save message to Database
      const savedMsg = await prisma.chatMessage.create({
        data: {
          sessionId,
          senderId: senderId || null,
          senderName,
          message,
          fileUrl: fileUrl || null,
          fileName: fileName || null,
          fileType: fileType || null
        }
      });

      // Broadcast message to everyone in the room
      io.to(sessionId).emit('chat-message', savedMsg);
    } catch (err) {
      console.error('Error saving chat message:', err);
      errorsCount++;
    }
  });

  // ==========================================
  // SESSION RECORDING FLUX
  // ==========================================
  socket.on('start-recording', async ({ sessionId }) => {
    console.log(`Starting recording for session: ${sessionId}`);
    try {
      // Create path
      const rawFilename = `recording-${sessionId}-${Date.now()}.webm`;
      const filePath = path.join(uploadsDir, rawFilename);
      const writeStream = fs.createWriteStream(filePath);

      activeRecordings.set(sessionId, {
        writeStream,
        filePath,
        rawFilename
      });

      // Update Database
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          recordingStatus: 'RECORDING'
        }
      });

      // Log event
      await prisma.sessionEvent.create({
        data: {
          sessionId,
          eventType: 'START_RECORDING',
          details: 'Call recording started by agent'
        }
      });

      io.to(sessionId).emit('recording-started');
    } catch (err) {
      console.error('Start recording error:', err);
      errorsCount++;
    }
  });

  socket.on('recording-chunk', ({ sessionId, chunk }) => {
    const recording = activeRecordings.get(sessionId);
    if (recording && recording.writeStream) {
      recording.writeStream.write(Buffer.from(chunk));
    }
  });

  socket.on('stop-recording', async ({ sessionId }) => {
    console.log(`Stopping recording for session: ${sessionId}`);
    const recording = activeRecordings.get(sessionId);

    if (recording) {
      try {
        recording.writeStream.end();
        activeRecordings.delete(sessionId);

        // Update database to PROCESSING
        await prisma.session.update({
          where: { id: sessionId },
          data: {
            recordingStatus: 'PROCESSING'
          }
        });

        // Log event
        await prisma.sessionEvent.create({
          data: {
            sessionId,
            eventType: 'STOP_RECORDING',
            details: 'Call recording stopped'
          }
        });

        io.to(sessionId).emit('recording-processing');

        // Post-processing WebM to MP4 via FFmpeg (fallback-safe)
        const mp4Filename = `recording-${sessionId}.mp4`;
        const outputMp4Path = path.join(uploadsDir, mp4Filename);

        exec('ffmpeg -version', (err) => {
          if (err) {
            // FFmpeg is not installed, keep raw webm file as fallback
            console.warn('FFmpeg is not installed on path. Saving raw WebM instead of converting.');
            prisma.session.update({
              where: { id: sessionId },
              data: {
                recordingPath: `/uploads/${recording.rawFilename}`,
                recordingStatus: 'READY'
              }
            }).then(() => {
              io.to(sessionId).emit('recording-ready', { url: `/uploads/${recording.rawFilename}` });
            }).catch(e => console.error(e));
          } else {
            // FFmpeg available, perform conversion
            const cmd = `ffmpeg -y -i "${recording.filePath}" -c:v libx264 -pix_fmt yuv420p -c:a aac -strict -2 "${outputMp4Path}"`;
            console.log(`Running FFmpeg: ${cmd}`);
            exec(cmd, (ffmpegErr) => {
              if (ffmpegErr) {
                console.error('FFmpeg processing failed:', ffmpegErr);
                // Fallback to raw webm
                prisma.session.update({
                  where: { id: sessionId },
                  data: {
                    recordingPath: `/uploads/${recording.rawFilename}`,
                    recordingStatus: 'READY'
                  }
                }).then(() => {
                  io.to(sessionId).emit('recording-ready', { url: `/uploads/${recording.rawFilename}` });
                }).catch(e => console.error(e));
              } else {
                console.log(`FFmpeg successful conversion: ${mp4Filename}`);
                // Delete the raw webm to save space
                try {
                  fs.unlinkSync(recording.filePath);
                } catch (e) {
                  console.error('Error unlinking webm:', e);
                }

                prisma.session.update({
                  where: { id: sessionId },
                  data: {
                    recordingPath: `/uploads/${mp4Filename}`,
                    recordingStatus: 'READY'
                  }
                }).then(() => {
                  io.to(sessionId).emit('recording-ready', { url: `/uploads/${mp4Filename}` });
                }).catch(e => console.error(e));
              }
            });
          }
        });

      } catch (err) {
        console.error('Error saving recording file:', err);
        errorsCount++;
      }
    }
  });

  // Handle Disconnects
  socket.on('disconnect', async () => {
    connectedParticipantsCount = Math.max(0, connectedParticipantsCount - 1);
    console.log(`Socket disconnected: ${socket.id}`);

    if (currentSessionId && participantLogId) {
      try {
        // Mark participant left in DB
        await prisma.sessionParticipant.update({
          where: { id: participantLogId },
          data: { leftAt: new Date() }
        });

        // Log leave event
        await prisma.sessionEvent.create({
          data: {
            sessionId: currentSessionId,
            eventType: 'LEAVE',
            details: `${userDisplayName} left or disconnected from the call`
          }
        });

        // Check if there is an active recording and clean up if disconnected
        if (activeRecordings.has(currentSessionId)) {
          const rec = activeRecordings.get(currentSessionId);
          rec.writeStream.end();
          activeRecordings.delete(currentSessionId);
          await prisma.session.update({
            where: { id: currentSessionId },
            data: { recordingStatus: null }
          });
        }

        // Notify room members
        io.to(currentSessionId).emit('participant-left', { id: socket.id });

      } catch (error) {
        console.error('Error logging participant disconnect:', error);
        errorsCount++;
      }
    }
  });
});

// ==========================================
// RUN THE TURN SERVER
// ==========================================
let turnServer;
try {
  turnServer = new Turn({
    authMech: 'long-term',
    credentials: {
      [TURN_USER]: TURN_PASS
    },
    listeningPort: TURN_PORT
  });
  turnServer.start();
  console.log(`STUN/TURN server running on port ${TURN_PORT} (User: ${TURN_USER})`);
} catch (err) {
  console.error('Could not start node-turn server. Port might be occupied or permission denied.', err);
  errorsCount++;
}

// Auto-seed demo agent
async function seedDemoAgent() {
  try {
    const email = 'agent@demo.com';
    const agent = await prisma.user.findUnique({ where: { email } });
    if (!agent) {
      const hashedPassword = await bcrypt.hash('password123', 10);
      await prisma.user.create({
        data: {
          name: 'Demo Agent',
          email,
          password: hashedPassword,
          role: 'AGENT'
        }
      });
      console.log(`Demo agent auto-seeded successfully! (agent@demo.com / password123)`);
    } else {
      console.log(`Demo agent (agent@demo.com) already exists.`);
    }
  } catch (error) {
    console.error('Error auto-seeding demo agent:', error);
  }
}

// Start Server
server.listen(PORT, () => {
  console.log(`Express API Server listening on port ${PORT}`);
  seedDemoAgent();
});
