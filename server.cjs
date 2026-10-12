const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = process.env.PORT || 3000;
const DIST_DIR = path.join(__dirname, 'dist');
const PUBLIC_DIR = fs.existsSync(path.join(DIST_DIR, 'index.html')) ? DIST_DIR : __dirname;
const DATA_DIR = process.env.NEXUS_DATA_DIR ? path.resolve(process.env.NEXUS_DATA_DIR) : path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PASSWORD_ITERATIONS = 210000;
const MAX_WS_PAYLOAD = 64 * 1024;
const ALLOW_INSECURE_DEV_AUTH = process.env.ALLOW_INSECURE_DEV_AUTH === '1';

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial Database Schema (EMPTY OF FAKE USERS - Only real data persists)
function getInitialDb() {
  return {
    users: [],          // [{ id, username, email, displayName, passwordHash, salt, avatar, bio, status, createdAt }]
    sessions: [],       // [{ token, userId, expiresAt }]
    friendships: [],    // [{ id, user1Id, user2Id, status: 'accepted', createdAt }]
    friendRequests: [], // [{ id, fromUserId, toUserId, status: 'pending', createdAt }]
    servers: [],        // [{ id, name, acronym, color, ownerId, members: [{ userId, role }], channels: [{ id, name, type }] }]
    messages: [],       // [{ id, channelId, serverId, authorId, authorName, authorAvatar, text, timestamp }]
    directMessages: [], // [{ id, conversationId, senderId, recipientId, text, timestamp }]
    voiceParticipants: {}, // channelId -> [{ userId, username, displayName, avatar, isMuted, isDeafened, isCameraOn, isScreenSharing, joinedAt }]
    gameRooms: [],      // [{ id, code, gameType, name, hostId, maxPlayers, players, status, gameState, currentTurn, winner, createdAt }]
    musicRooms: [       // [{ id, name, hostId, currentTrackIndex, isPlaying, startedAt, pauseOffset, listeners: [], queue: [] }]
      {
        id: 'mr-community-lounge',
        name: 'Nexus Social Chill Lounge 🎧',
        hostId: 'system',
        currentTrackIndex: 0,
        isPlaying: true,
        startedAt: Date.now(),
        pauseOffset: 0,
        listeners: [],
        queue: [
          {
            id: 'trk-1',
            title: 'Midnight Lo-Fi Chillwave',
            artist: 'Nexus Audio Labs',
            license: 'Creative Commons CC0 Public Domain',
            duration: 180,
            bpm: 82,
            chords: [[220.0, 261.63, 329.63, 493.88], [174.61, 261.63, 329.63, 392.00], [130.81, 261.63, 329.63, 392.00], [196.00, 246.94, 293.66, 440.00]],
            artwork: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=300&q=80'
          },
          {
            id: 'trk-2',
            title: 'Electric Cyberpunk Pulse',
            artist: 'SynthWave Studio',
            license: 'Creative Commons CC-BY 4.0 Royalty Free',
            duration: 210,
            bpm: 110,
            chords: [[146.83, 220.00, 293.66, 349.23], [164.81, 246.94, 329.63, 392.00], [174.61, 261.63, 349.23, 440.00], [196.00, 293.66, 392.00, 493.88]],
            artwork: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=300&q=80'
          },
          {
            id: 'trk-3',
            title: 'Starlight Ambient Glow',
            artist: 'Solaris Beats',
            license: 'Public Domain Dedication (CC0)',
            duration: 240,
            bpm: 72,
            chords: [[261.63, 329.63, 392.00, 523.25], [196.00, 246.94, 293.66, 392.00], [220.00, 261.63, 329.63, 440.00], [174.61, 220.00, 261.63, 349.23]],
            artwork: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=300&q=80'
          }
        ]
      }
    ],
    webrtcSignals: []   // [{ fromUserId, toUserId, channelId, signal, timestamp }]
  };
}

let db = getInitialDb();

// Load or initialize DB
if (fs.existsSync(DB_FILE)) {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    db = JSON.parse(raw);
    // Ensure all collections exist
    const initial = getInitialDb();
    for (const key in initial) {
      if (!db[key]) db[key] = initial[key];
    }
  } catch (e) {
    console.error('Error reading db.json, initializing fresh db:', e.message);
    db = getInitialDb();
  }
} else {
  saveDbSync();
}

function saveDbSync() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

// Cryptography Helpers
function derivePassword(password, salt, iterations) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, iterations, 64, 'sha512', (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex'), iterations = PASSWORD_ITERATIONS) {
  const hash = (await derivePassword(password, salt, iterations)).toString('hex');
  return { hash, salt, iterations };
}

async function verifyPassword(password, user) {
  if (!user || !user.passwordHash || !user.salt) return false;
  const iterations = user.passwordIterations || 10000;
  const verify = await derivePassword(password, user.salt, iterations);
  const expected = Buffer.from(user.passwordHash, 'hex');
  return expected.length === verify.length && crypto.timingSafeEqual(expected, verify);
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Authentication Middleware
function getRequestToken(req) {
  const authHeader = req.headers['authorization'];
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.headers['cookie']) {
    const cookies = req.headers['cookie'].split(';').map(c => c.trim());
    const sessCookie = cookies.find(c => c.startsWith('session_token='));
    if (sessCookie) {
      token = sessCookie.split('=')[1];
    }
  }

  return token;
}

function getAuthUser(req) {
  const token = getRequestToken(req);
  if (!token) return null;
  const session = db.sessions.find(s => s.token === token && s.expiresAt > Date.now());
  if (!session) return null;

  const user = db.users.find(u => u.id === session.userId);
  if (!user) return null;
  return { ...user, token };
}

// Connected WebSocket Clients
const wsClients = new Set(); // Set of { socket, user }
const requestBuckets = new Map();

function rateLimitExceeded(req, bucket, limit, windowMs = 15 * 60 * 1000) {
  const key = `${req.socket.remoteAddress || 'unknown'}:${bucket}`;
  const now = Date.now();
  const current = requestBuckets.get(key);
  if (!current || current.resetAt <= now) {
    requestBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  current.count += 1;
  return current.count > limit;
}

function broadcast(event, payload, excludeSocket = null) {
  const msg = JSON.stringify({ event, payload });
  for (const client of wsClients) {
    if (client.user && client.socket !== excludeSocket && client.socket.writable) {
      sendWsFrame(client.socket, msg);
    }
  }
}

function broadcastToChannelMembers(channelId, event, payload) {
  const msg = JSON.stringify({ event, payload });
  for (const client of wsClients) {
    if (client.user && client.socket.writable && userCanAccessChannel(client.user.id, channelId)) {
      sendWsFrame(client.socket, msg);
    }
  }
}

function broadcastToVoiceChannel(channelId, event, payload) {
  const participants = db.voiceParticipants[channelId] || [];
  const memberIds = new Set(participants.map(participant => participant.userId));
  const msg = JSON.stringify({ event, payload });
  for (const client of wsClients) {
    if (client.user && client.socket.writable && memberIds.has(client.user.id)) {
      sendWsFrame(client.socket, msg);
    }
  }
}

function sendToUser(userId, event, payload) {
  const msg = JSON.stringify({ event, payload });
  for (const client of wsClients) {
    if (client.user && client.user.id === userId && client.socket.writable) {
      sendWsFrame(client.socket, msg);
    }
  }
}

function gameRoomForUser(room, userId) {
  const safeRoom = JSON.parse(JSON.stringify(room));
  const state = safeRoom.gameState;
  if (!state || safeRoom.status !== 'playing') return safeRoom;
  if (safeRoom.gameType === 'rps') {
    const ownChoice = state.choices?.[userId];
    state.choicesSubmitted = Object.keys(state.choices || {});
    state.choices = ownChoice ? { [userId]: ownChoice } : {};
  }
  if (safeRoom.gameType === 'guess') delete state.target;
  if (safeRoom.gameType === 'trivia') {
    state.questions = (state.questions || []).map(({ answer, ...question }) => question);
    const ownAnswer = state.answers?.[userId];
    state.answers = ownAnswer === undefined ? {} : { [userId]: ownAnswer };
  }
  return safeRoom;
}

function broadcastGameRoom(event, room) {
  for (const client of wsClients) {
    if (!client.socket.writable || !client.user) continue;
    sendWsFrame(client.socket, JSON.stringify({ event, payload: gameRoomForUser(room, client.user.id) }));
  }
}

function findChannel(channelId) {
  for (const server of db.servers) {
    const channel = server.channels.find(candidate => candidate.id === channelId);
    if (channel) return { server, channel };
  }
  return null;
}

function userCanAccessChannel(userId, channelId) {
  const match = findChannel(channelId);
  return !!match && match.server.members.some(member => member.userId === userId);
}

function userCanJoinVoiceChannel(userId, channelId) {
  if (channelId === 'nexus-main-lounge') return true;
  const match = findChannel(channelId);
  return !!match && match.channel.type !== 'text' &&
    match.server.members.some(member => member.userId === userId);
}

function usersShareVoiceChannel(firstUserId, secondUserId, channelId) {
  const participants = db.voiceParticipants[channelId] || [];
  return participants.some(participant => participant.userId === firstUserId) &&
    participants.some(participant => participant.userId === secondUserId);
}

function spotifyEmbedIsAllowed(value) {
  if (value === null || value === undefined || value === '') return true;
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' && url.hostname === 'open.spotify.com' && url.pathname.startsWith('/embed/');
  } catch {
    return false;
  }
}

// Native RFC 6455 WebSocket Implementation
function handleWsUpgrade(req, socket, head) {
  const requestUrl = new URL(req.url, 'http://localhost');
  if (requestUrl.pathname !== '/ws') {
    socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  const key = req.headers['sec-websocket-key'];
  const version = req.headers['sec-websocket-version'];
  if (!key || version !== '13') {
    socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  const origin = req.headers.origin;
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const requestHost = String(req.headers.host || '').split(':')[0];
      const bothLocal = ['localhost', '127.0.0.1'].includes(originUrl.hostname) && ['localhost', '127.0.0.1'].includes(requestHost);
      if (originUrl.host !== req.headers.host && !bothLocal) {
        socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
    } catch {
      socket.destroy();
      return;
    }
  }

  const accept = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  const headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`
  ];

  socket.write(headers.join('\r\n') + '\r\n\r\n');

  // Authenticate from query param or header
  const token = getRequestToken(req);
  const session = token ? db.sessions.find(candidate => candidate.token === token && candidate.expiresAt > Date.now()) : null;
  const user = session ? db.users.find(candidate => candidate.id === session.userId) || null : null;
  const client = { socket, user };
  wsClients.add(client);
  if (user) {
    user.status = 'online';
    saveDbSync();
    broadcast('user_presence', { userId: user.id, status: 'online' });
  }

  let buffer = Buffer.alloc(0);

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 2) {
      const firstByte = buffer[0];
      const secondByte = buffer[1];
      const isFinal = (firstByte & 0x80) !== 0;
      const opcode = firstByte & 0x0f;
      const isMasked = (secondByte & 0x80) !== 0;
      let payloadLength = secondByte & 0x7f;
      let offset = 2;

      if (payloadLength === 126) {
        if (buffer.length < 4) break;
        payloadLength = buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLength === 127) {
        if (buffer.length < 10) break;
        const wideLength = buffer.readBigUInt64BE(2);
        if (wideLength > BigInt(MAX_WS_PAYLOAD)) {
          socket.destroy();
          return;
        }
        payloadLength = Number(wideLength);
        offset = 10;
      }

      if (!isMasked || !isFinal || payloadLength > MAX_WS_PAYLOAD) {
        socket.destroy();
        return;
      }

      let maskKey = null;
      if (isMasked) {
        if (buffer.length < offset + 4) break;
        maskKey = buffer.slice(offset, offset + 4);
        offset += 4;
      }

      if (buffer.length < offset + payloadLength) break;

      const payload = buffer.slice(offset, offset + payloadLength);
      buffer = buffer.slice(offset + payloadLength);

      if (isMasked && maskKey) {
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= maskKey[i % 4];
        }
      }

      // Handle Opcode
      if (opcode === 0x08) {
        // Close frame
        socket.end();
        break;
      } else if (opcode === 0x09) {
        // Ping -> Pong
        const pong = Buffer.alloc(2);
        pong[0] = 0x8a;
        pong[1] = 0x00;
        socket.write(pong);
      } else if (opcode === 0x01) {
        // Text message
        try {
          const rawText = payload.toString('utf8');
          const data = JSON.parse(rawText);
          handleWsMessage(client, data);
        } catch (err) {
          console.error('WS parse error:', err.message);
        }
      }
    }
  });

  socket.on('close', () => {
    wsClients.delete(client);
    if (client.user) {
      // Check if user has other active connections
      const remaining = Array.from(wsClients).some(c => c.user && c.user.id === client.user.id);
      if (!remaining) {
        const u = db.users.find(u => u.id === client.user.id);
        if (u) {
          u.status = 'offline';
          saveDbSync();
          broadcast('user_presence', {
            userId: u.id,
            username: u.username,
            displayName: u.displayName,
            avatar: u.avatar,
            status: 'offline'
          });
        }
      }
      // Remove from any voice channels
      for (const chId in db.voiceParticipants) {
        db.voiceParticipants[chId] = db.voiceParticipants[chId].filter(p => p.userId !== client.user.id);
        broadcastToVoiceChannel(chId, 'voice_update', { channelId: chId, participants: db.voiceParticipants[chId] });
      }

      // Clean up or forfeit active game rooms
      for (const room of [...db.gameRooms]) {
        if (room.players.some(p => p.userId === client.user.id)) {
          room.players = room.players.filter(p => p.userId !== client.user.id);
          if (room.players.length === 0) {
            db.gameRooms = db.gameRooms.filter(r => r.id !== room.id);
          } else {
            if (room.status === 'playing') {
              room.status = 'finished';
              room.winner = room.players[0].userId;
            }
          }
          broadcastGameRoom('game_room_update', room);
        }
      }
      saveDbSync();
    }
  });

  socket.on('error', () => {
    wsClients.delete(client);
  });
}

function sendWsFrame(socket, message) {
  if (!socket || !socket.writable) return;
  try {
    const payload = Buffer.from(message, 'utf8');
    const length = payload.length;
    let header;

    if (length <= 125) {
      header = Buffer.alloc(2);
      header[0] = 0x81; // FIN + text opcode
      header[1] = length;
    } else if (length <= 65535) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    }

    socket.write(Buffer.concat([header, payload]));
  } catch (err) {
    // Socket was closed abruptly by peer; safe ignore
  }
}

function handleWsMessage(client, data) {
  try {
    if (!data || typeof data !== 'object') return;
    const { event, payload = {} } = data;

    if (event === 'auth') {
      const session = db.sessions.find(s => s.token === payload.token && s.expiresAt > Date.now());
      if (session) {
        client.user = db.users.find(u => u.id === session.userId) || null;
        if (client.user) {
          client.user.status = 'online';
          saveDbSync();
          broadcast('user_presence', {
            userId: client.user.id,
            username: client.user.username,
            displayName: client.user.displayName,
            avatar: client.user.avatar,
            status: 'online'
          });
          sendWsFrame(client.socket, JSON.stringify({ event: 'auth_success', payload: { user: sanitizeUser(client.user) } }));
        }
      }
      return;
    }

    if (!client.user) {
      sendWsFrame(client.socket, JSON.stringify({ event: 'error', payload: 'Unauthorized' }));
      return;
    }

    // Real-time Chat
    if (event === 'send_message') {
      if (!payload.text || !payload.channelId) return;
      const text = String(payload.text).trim().slice(0, 2000);
      if (!text || !userCanAccessChannel(client.user.id, payload.channelId)) {
        sendWsFrame(client.socket, JSON.stringify({ event: 'error', payload: 'You cannot post in that channel.' }));
        return;
      }
      const msg = {
        id: 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        channelId: payload.channelId,
        serverId: payload.serverId || null,
        authorId: client.user.id,
        authorName: client.user.displayName,
        authorUsername: client.user.username,
        authorAvatar: client.user.avatar,
        text,
        timestamp: new Date().toISOString()
      };
      db.messages.push(msg);
      saveDbSync();
      broadcastToChannelMembers(msg.channelId, 'new_message', msg);
      return;
    }

    // Real-time Direct Message
    if (event === 'send_dm') {
      if (!payload.text || !payload.recipientId) return;
      const dm = {
        id: 'dm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        senderId: client.user.id,
        recipientId: payload.recipientId,
        senderName: client.user.displayName,
        senderAvatar: client.user.avatar,
        text: payload.text.trim(),
        timestamp: new Date().toISOString()
      };
      db.directMessages.push(dm);
      saveDbSync();
      sendToUser(payload.recipientId, 'new_dm', dm);
      sendToUser(client.user.id, 'new_dm', dm);
      return;
    }

    // Real-time WebRTC Signaling (Voice & Video Call)
    if (event === 'webrtc_signal') {
      const channelId = payload.signal?.channelId;
      if (!payload.targetUserId || !channelId) return;
      if (!usersShareVoiceChannel(client.user.id, payload.targetUserId, channelId)) return;
      sendToUser(payload.targetUserId, 'webrtc_signal', {
        fromUserId: client.user.id,
        fromUsername: client.user.username,
        signal: payload.signal
      });
      return;
    }

    // Voice Invite (invite friend to voice channel)
    if (event === 'voice_invite') {
      const { targetUserId, channelId, channelName, serverId, serverName } = payload;
      if (!targetUserId) return;
      sendToUser(targetUserId, 'voice_invite', {
        fromUserId: client.user.id,
        fromDisplayName: client.user.displayName,
        fromUsername: client.user.username,
        fromAvatar: client.user.avatar,
        channelId,
        channelName,
        serverId,
        serverName
      });
      return;
    }

    // Lightweight Real-time Voice Speaking Indicator (Zero Disk I/O, Zero renegotiation lag)
    if (event === 'voice_speaking') {
      const { channelId, isSpeaking } = payload;
      if (!channelId) return;
      const part = db.voiceParticipants[channelId]?.find(p => p.userId === client.user.id);
      if (!part) return;
      part.isSpeaking = !!isSpeaking;
      broadcastToVoiceChannel(channelId, 'voice_speaking', {
        channelId,
        userId: client.user.id,
        isSpeaking: !!isSpeaking
      });
      return;
    }

    // Voice State Update (Mute, Deafen, Camera, Screen Share)
    if (event === 'voice_state') {
      const { channelId, isMuted, isDeafened, isCameraOn, isScreenSharing, isSpeaking } = payload;
      if (!channelId) return;
      if (!userCanJoinVoiceChannel(client.user.id, channelId)) return;
      if (!db.voiceParticipants[channelId]) db.voiceParticipants[channelId] = [];
      
      let part = db.voiceParticipants[channelId].find(p => p.userId === client.user.id);
      if (!part) {
        part = {
          userId: client.user.id,
          username: client.user.username,
          displayName: client.user.displayName,
          avatar: client.user.avatar,
          isMuted: !!isMuted,
          isDeafened: !!isDeafened,
          isCameraOn: !!isCameraOn,
          isScreenSharing: !!isScreenSharing,
          isSpeaking: !!isSpeaking,
          joinedAt: new Date().toISOString()
        };
        db.voiceParticipants[channelId].push(part);
      } else {
        if (isMuted !== undefined) part.isMuted = isMuted;
        if (isDeafened !== undefined) part.isDeafened = isDeafened;
        if (isCameraOn !== undefined) part.isCameraOn = isCameraOn;
        if (isScreenSharing !== undefined) part.isScreenSharing = isScreenSharing;
        if (isSpeaking !== undefined) part.isSpeaking = isSpeaking;
      }
      saveDbSync();
      broadcastToVoiceChannel(channelId, 'voice_update', { channelId, participants: db.voiceParticipants[channelId] });
      return;
    }

    // Voice Leave
    if (event === 'voice_leave') {
      const { channelId } = payload;
      if (channelId && db.voiceParticipants[channelId]) {
        db.voiceParticipants[channelId] = db.voiceParticipants[channelId].filter(p => p.userId !== client.user.id);
        saveDbSync();
        broadcastToVoiceChannel(channelId, 'voice_update', { channelId, participants: db.voiceParticipants[channelId] });
      }
      return;
    }

    // Multiplayer Game Actions (Turn-based and real-time state)
    if (event === 'game_action') {
      handleGameAction(client.user, payload);
      return;
    }

    // Shared Synchronized Music Lounge Actions (Free Legal CC0/Royalty-Free Audio)
    if (event === 'music_action') {
      handleMusicAction(client.user, payload);
      return;
    }
  } catch (err) {
    console.error('Error handling WebSocket message:', err.message);
  }
}

// Synchronized Shared Music Lounge Logic Engine
function handleMusicAction(user, payload) {
  if (!payload || !payload.roomId) return;
  const { roomId, action, data = {} } = payload;
  const room = db.musicRooms.find(r => r.id === roomId);
  if (!room) return;

  const now = Date.now();

  if (action === 'join') {
    if (!room.listeners.some(l => l.userId === user.id)) {
      room.listeners.push({
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar,
        joinedAt: now
      });
    }
  } else if (action === 'leave') {
    room.listeners = room.listeners.filter(l => l.userId !== user.id);
  } else if (action === 'play') {
    room.isPlaying = true;
    room.startedAt = now - (room.pauseOffset || 0);
  } else if (action === 'pause') {
    room.isPlaying = false;
    const durMs = (room.queue[room.currentTrackIndex]?.duration || 180) * 1000;
    room.pauseOffset = (now - (room.startedAt || now)) % durMs;
  } else if (action === 'skip') {
    const nextIdx = (room.currentTrackIndex + 1) % room.queue.length;
    room.currentTrackIndex = nextIdx;
    room.isPlaying = true;
    room.startedAt = now;
    room.pauseOffset = 0;
  } else if (action === 'previous') {
    const prevIdx = (room.currentTrackIndex - 1 + room.queue.length) % room.queue.length;
    room.currentTrackIndex = prevIdx;
    room.isPlaying = true;
    room.startedAt = now;
    room.pauseOffset = 0;
  } else if (action === 'select_track') {
    if (Number.isInteger(data.index) && data.index >= 0 && data.index < room.queue.length) {
      room.currentTrackIndex = data.index;
      room.isPlaying = true;
      room.startedAt = now;
      room.pauseOffset = 0;
    }
  } else if (action === 'seek') {
    const duration = room.queue[room.currentTrackIndex]?.duration || 180;
    const seconds = Number(data.seconds);
    if (Number.isFinite(seconds)) {
      room.pauseOffset = Math.max(0, Math.min(duration, seconds)) * 1000;
      room.startedAt = now - room.pauseOffset;
    }
  } else if (action === 'edit_track') {
    const { trackId, index, title, artist, duration, artwork, spotifyUrl, genre, chords } = data;
    const trk = (trackId ? room.queue.find(t => t.id === trackId) : null) || (index !== undefined && room.queue[index] ? room.queue[index] : null);
    if (trk) {
      if (title !== undefined) trk.title = String(title).trim();
      if (artist !== undefined) trk.artist = String(artist).trim();
      if (duration !== undefined) trk.duration = Math.max(10, Number(duration) || 180);
      if (artwork !== undefined && String(artwork).trim()) trk.artwork = String(artwork).trim();
      if (spotifyUrl !== undefined) trk.spotifyUrl = String(spotifyUrl).trim();
      if (chords !== undefined && Array.isArray(chords)) trk.chords = chords;
      if (genre !== undefined) trk.genre = genre;
      trk.editedBy = user.displayName;
    }
  } else if (action === 'delete_track') {
    const { trackId } = data;
    if (room.queue.length > 1) {
      const idx = room.queue.findIndex(t => t.id === trackId);
      if (idx !== -1) {
        room.queue.splice(idx, 1);
        if (room.currentTrackIndex >= room.queue.length) {
          room.currentTrackIndex = 0;
        }
      }
    }
  } else if (action === 'reorder_track') {
    const { fromIndex, toIndex } = data;
    if (fromIndex >= 0 && fromIndex < room.queue.length && toIndex >= 0 && toIndex < room.queue.length) {
      const item = room.queue.splice(fromIndex, 1)[0];
      room.queue.splice(toIndex, 0, item);
      if (room.currentTrackIndex === fromIndex) {
        room.currentTrackIndex = toIndex;
      }
    }
  } else if (action === 'set_spotify_embed') {
    if (!spotifyEmbedIsAllowed(data.spotifyEmbed)) return;
    room.spotifyEmbed = data.spotifyEmbed || null;
    if (data.track) {
      const existing = room.queue.find(t => t.spotifyUrl && t.spotifyUrl === data.track.spotifyUrl);
      if (!existing && data.track.title) {
        room.queue.push({
          id: 'trk-' + Date.now(),
          title: data.track.title,
          artist: data.track.artist || 'Spotify Artist',
          license: 'Spotify Player Stream',
          duration: data.track.duration || 210,
          bpm: 100,
          artwork: data.track.artwork || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=400&q=80',
          spotifyUrl: data.track.spotifyUrl,
          suggestedBy: user.displayName
        });
      }
    }
  } else if (action === 'suggest') {
    if (data.title && data.artist) {
      room.queue.push({
        id: 'trk-' + Date.now(),
        title: data.title.trim(),
        artist: data.artist.trim(),
        license: data.license || 'Creative Commons CC0 Public Domain',
        duration: data.duration || 180,
        bpm: data.bpm || 90,
        chords: data.chords || [[220.0, 261.63, 329.63, 493.88], [174.61, 261.63, 329.63, 392.00]],
        artwork: data.artwork || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=300&q=80',
        spotifyUrl: data.spotifyUrl || '',
        suggestedBy: user.displayName
      });
    }
  }

  saveDbSync();
  broadcast('music_room_update', {
    room: {
      ...room,
      serverTime: now,
      currentTrack: room.queue[room.currentTrackIndex] || room.queue[0]
    }
  });
}

// Multiplayer Game Logic Engine
function handleGameAction(user, payload) {
  if (!payload || !payload.roomId) return;
  const { roomId, action, data } = payload;
  const room = db.gameRooms.find(r => r.id === roomId);
  if (!room) return;

  const player = room.players.find(p => p.userId === user.id);
  if (!player && action !== 'leave') return;

  if (action === 'leave') {
    room.players = room.players.filter(p => p.userId !== user.id);
    if (room.players.length === 0) {
      db.gameRooms = db.gameRooms.filter(r => r.id !== room.id);
    } else {
      if (room.status === 'playing') {
        room.status = 'finished';
        room.winner = room.players[0].userId;
      }
    }
    saveDbSync();
    broadcastGameRoom('game_room_update', room);
    return;
  }

  if (action === 'ready') {
    player.isReady = !player.isReady;
    if (room.players.length >= 2 && room.players.every(p => p.isReady)) {
      room.status = 'playing';
      room.currentTurn = room.players[0].userId;
      initializeGameState(room);
    }
  } else if (action === 'move') {
    processGameMove(room, user.id, data);
  } else if (action === 'rematch') {
    room.status = 'waiting';
    room.winner = null;
    room.players.forEach(p => p.isReady = false);
    initializeGameState(room);
  }

  saveDbSync();
  broadcastGameRoom('game_room_update', room);
}

function initializeGameState(room) {
  const p1 = room.players[0]?.userId || 'p1';
  const p2 = room.players[1]?.userId || 'p2';

  if (room.gameType === 'tictactoe') {
    room.gameState = {
      board: Array(9).fill(null),
      playerSymbols: {
        [p1]: 'X',
        [p2]: 'O'
      }
    };
  } else if (room.gameType === 'connect4') {
    room.gameState = {
      grid: Array(6).fill(null).map(() => Array(7).fill(null)),
      playerColors: {
        [p1]: 'red',
        [p2]: 'yellow'
      }
    };
  } else if (room.gameType === 'rps') {
    room.gameState = {
      round: 1,
      choices: {},
      scores: {
        [p1]: 0,
        [p2]: 0
      },
      roundWinner: null
    };
  } else if (room.gameType === 'reaction') {
    room.gameState = {
      startTime: Date.now() + 3000 + Math.floor(Math.random() * 4000),
      clicks: {}
    };
  } else if (room.gameType === 'guess') {
    room.gameState = {
      target: Math.floor(Math.random() * 100) + 1,
      guesses: []
    };
  } else if (room.gameType === 'trivia') {
    room.gameState = {
      questionIndex: 0,
      scores: {},
      answers: {},
      questions: [
        { q: 'Which company developed TypeScript?', options: ['Google', 'Microsoft', 'Meta', 'Apple'], answer: 1 },
        { q: 'What port does HTTP commonly use by default?', options: ['21', '80', '443', '8080'], answer: 1 },
        { q: 'Which protocol is used for low-latency peer-to-peer voice and video?', options: ['FTP', 'WebRTC', 'SSH', 'SMTP'], answer: 1 },
        { q: 'What is the full form of DOM in web development?', options: ['Data Object Model', 'Document Object Model', 'Direct Output Module', 'Distributed Order Matrix'], answer: 1 }
      ]
    };
    room.players.forEach(p => room.gameState.scores[p.userId] = 0);
  }
}

function processGameMove(room, userId, data) {
  if (room.status !== 'playing') return;

  // Tic-Tac-Toe
  if (room.gameType === 'tictactoe') {
    if (room.currentTurn !== userId) return;
    const { index } = data;
    if (index < 0 || index > 8 || room.gameState.board[index] !== null) return;

    const symbol = room.gameState.playerSymbols[userId];
    room.gameState.board[index] = symbol;

    // Check Win
    const lines = [
      [0,1,2], [3,4,5], [6,7,8],
      [0,3,6], [1,4,7], [2,5,8],
      [0,4,8], [2,4,6]
    ];
    let won = false;
    for (const [a, b, c] of lines) {
      if (room.gameState.board[a] && room.gameState.board[a] === room.gameState.board[b] && room.gameState.board[a] === room.gameState.board[c]) {
        won = true;
        break;
      }
    }

    if (won) {
      room.status = 'finished';
      room.winner = userId;
    } else if (room.gameState.board.every(cell => cell !== null)) {
      room.status = 'finished';
      room.winner = 'draw';
    } else {
      // Toggle turn
      const nextPlayer = room.players.find(p => p.userId !== userId);
      room.currentTurn = nextPlayer ? nextPlayer.userId : userId;
    }
  }

  // Connect Four
  else if (room.gameType === 'connect4') {
    if (room.currentTurn !== userId) return;
    const { col } = data;
    if (col < 0 || col > 6) return;

    // Drop piece into bottom-most empty row in column
    let targetRow = -1;
    for (let r = 5; r >= 0; r--) {
      if (!room.gameState.grid[r][col]) {
        targetRow = r;
        break;
      }
    }
    if (targetRow === -1) return; // Column full

    const color = room.gameState.playerColors[userId];
    room.gameState.grid[targetRow][col] = color;

    // Check 4 in a row
    if (checkConnect4Win(room.gameState.grid, targetRow, col, color)) {
      room.status = 'finished';
      room.winner = userId;
    } else if (room.gameState.grid[0].every(cell => cell !== null)) {
      room.status = 'finished';
      room.winner = 'draw';
    } else {
      const nextPlayer = room.players.find(p => p.userId !== userId);
      room.currentTurn = nextPlayer ? nextPlayer.userId : userId;
    }
  }

  // Rock Paper Scissors
  else if (room.gameType === 'rps') {
    const { choice } = data;
    if (!['rock', 'paper', 'scissors'].includes(choice)) return;
    if (room.gameState.choices[userId] !== undefined) return;
    room.gameState.choices[userId] = choice;

    if (Object.keys(room.gameState.choices).length === 2) {
      if (!room.players[0] || !room.players[1]) return;
      const p1 = room.players[0].userId;
      const p2 = room.players[1].userId;
      const c1 = room.gameState.choices[p1];
      const c2 = room.gameState.choices[p2];

      let roundWin = null;
      if (c1 === c2) {
        roundWin = 'draw';
      } else if (
        (c1 === 'rock' && c2 === 'scissors') ||
        (c1 === 'paper' && c2 === 'rock') ||
        (c1 === 'scissors' && c2 === 'paper')
      ) {
        roundWin = p1;
        room.gameState.scores[p1]++;
      } else {
        roundWin = p2;
        room.gameState.scores[p2]++;
      }
      room.gameState.roundWinner = roundWin;

      if (room.gameState.scores[p1] >= 2) {
        room.status = 'finished';
        room.winner = p1;
      } else if (room.gameState.scores[p2] >= 2) {
        room.status = 'finished';
        room.winner = p2;
      } else {
        room.gameState.round++;
        room.gameState.choices = {};
      }
    }
  }

  // Reaction Battle
  else if (room.gameType === 'reaction') {
    if (room.gameState.clicks[userId] !== undefined) return;
    const now = Date.now();
    if (now < room.gameState.startTime) {
      // False start!
      room.gameState.clicks[userId] = 99999;
    } else {
      room.gameState.clicks[userId] = now - room.gameState.startTime;
    }

    if (Object.keys(room.gameState.clicks).length >= room.players.length) {
      let bestTime = Infinity;
      let fastestUser = null;
      for (const [uId, time] of Object.entries(room.gameState.clicks)) {
        if (time < bestTime) {
          bestTime = time;
          fastestUser = uId;
        }
      }
      room.status = 'finished';
      room.winner = fastestUser;
    }
  }

  // Number Guessing
  else if (room.gameType === 'guess') {
    if (room.currentTurn !== userId) return;
    const { guess } = data;
    const num = parseInt(guess, 10);
    if (!Number.isInteger(num) || num < 1 || num > 100) return;
    const target = room.gameState.target;
    let hint = 'Correct!';
    if (num < target) hint = 'Higher';
    if (num > target) hint = 'Lower';

    const playerObj = room.players.find(p => p.userId === userId);
    room.gameState.guesses.push({
      userId,
      username: playerObj ? playerObj.username : 'Gamer',
      guess: num,
      hint
    });

    if (num === target) {
      room.status = 'finished';
      room.winner = userId;
    } else {
      const nextPlayer = room.players.find(p => p.userId !== userId);
      room.currentTurn = nextPlayer ? nextPlayer.userId : userId;
    }
  }

  // Multiplayer Trivia
  else if (room.gameType === 'trivia') {
    const { answerIndex } = data;
    const currentQ = room.gameState.questions[room.gameState.questionIndex];
    if (!currentQ) return;
    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= currentQ.options.length) return;
    if (!room.gameState.answers) room.gameState.answers = {};
    if (room.gameState.answers[userId] !== undefined) return; // Already answered

    room.gameState.answers[userId] = answerIndex;
    if (answerIndex === currentQ.answer) {
      room.gameState.scores[userId] = (room.gameState.scores[userId] || 0) + 10;
    }

    if (Object.keys(room.gameState.answers).length >= room.players.length) {
      if (room.gameState.questionIndex + 1 < room.gameState.questions.length) {
        room.gameState.questionIndex++;
        room.gameState.answers = {};
      } else {
        room.status = 'finished';
        let highScore = -1;
        let winnerId = 'draw';
        for (const [pId, sc] of Object.entries(room.gameState.scores)) {
          if (sc > highScore) {
            highScore = sc;
            winnerId = pId;
          } else if (sc === highScore) {
            winnerId = 'draw';
          }
        }
        room.winner = winnerId;
      }
    }
  }
}

function checkConnect4Win(grid, r, c, color) {
  const dirs = [
    [[0, 1], [0, -1]], // horizontal
    [[1, 0], [-1, 0]], // vertical
    [[1, 1], [-1, -1]], // diag \
    [[1, -1], [-1, 1]], // diag /
  ];
  for (const [d1, d2] of dirs) {
    let count = 1;
    for (const [dr, dc] of [d1, d2]) {
      let cr = r + dr;
      let cc = c + dc;
      while (cr >= 0 && cr < 6 && cc >= 0 && cc < 7 && grid[cr][cc] === color) {
        count++;
        cr += dr;
        cc += dc;
      }
    }
    if (count >= 4) return true;
  }
  return false;
}

function sanitizeUser(u) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    email: u.email,
    avatar: u.avatar,
    bio: u.bio || '',
    status: u.status || 'offline',
    customStatus: u.customStatus || '',
    createdAt: u.createdAt
  };
}

function sanitizePublicUser(u) {
  const user = sanitizeUser(u);
  delete user.email;
  return user;
}

// HTTP Request Handler
const server = http.createServer((req, res) => {
  // Same-origin by default; an explicit CORS_ORIGIN may be set for a separate trusted client.
  if (process.env.CORS_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), display-capture=(self), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' ws: wss:; frame-src https://open.spotify.com; media-src 'self' blob:");

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // JSON Body Parser Helper
  function parseJsonBody(cb) {
    let body = '';
    let tooLarge = false;
    req.on('data', chunk => {
      if (tooLarge) return;
      body += chunk;
      if (body.length > 256 * 1024) {
        tooLarge = true;
        sendJson(413, { error: 'Request body is too large.' });
      }
    });
    req.on('end', () => {
      if (tooLarge) return;
      try {
        const data = body ? JSON.parse(body) : {};
        Promise.resolve(cb(null, data)).catch(error => {
          console.error('Request handler failed:', error.message);
          if (!res.headersSent) sendJson(500, { error: 'Server error' });
        });
      } catch (err) {
        cb(err);
      }
    });
  }

  function sendJson(status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  function setSessionCookie(token, maxAgeSeconds = 30 * 24 * 60 * 60) {
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const secure = forwardedProto === 'https' || !!req.socket.encrypted;
    res.setHeader('Set-Cookie', `session_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`);
  }

  // ========================================================
  // REST API ENDPOINTS
  // ========================================================

  // 1. AUTH: REGISTER
  if (req.method === 'POST' && pathname === '/api/auth/register') {
    if (rateLimitExceeded(req, 'register', 8)) return sendJson(429, { error: 'Too many registration attempts. Try again later.' });
    parseJsonBody(async (err, body) => {
      if (err) return sendJson(400, { error: 'Invalid JSON' });
      const { displayName, username, email, password } = body;

      if (!displayName || !username || !email || !password) {
        return sendJson(400, { error: 'All fields are required.' });
      }

      const cleanUsername = username.trim().toLowerCase();
      const cleanEmail = email.trim().toLowerCase();

      if (!/^[a-z0-9_]{3,24}$/.test(cleanUsername)) {
        return sendJson(400, { error: 'Username must be 3–24 letters, numbers, or underscores.' });
      }
      if (displayName.trim().length < 1 || displayName.trim().length > 40) {
        return sendJson(400, { error: 'Display name must be 1–40 characters.' });
      }

      // Email format check
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return sendJson(400, { error: 'Please enter a valid email address.' });
      }

      if (password.length < 8 || password.length > 128) {
        return sendJson(400, { error: 'Password must be 8–128 characters.' });
      }

      // Check unique username & email
      if (db.users.some(u => u.username === cleanUsername)) {
        return sendJson(409, { error: 'Username is already taken.' });
      }
      if (db.users.some(u => u.email === cleanEmail)) {
        return sendJson(409, { error: 'Email is already registered.' });
      }

      const { hash, salt, iterations } = await hashPassword(password);
      const newUser = {
        id: 'usr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        displayName: displayName.trim(),
        username: cleanUsername,
        email: cleanEmail,
        passwordHash: hash,
        salt,
        passwordIterations: iterations,
        avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanUsername}`,
        bio: 'Ready to play! 🎮',
        status: 'online',
        customStatus: 'In Gaming Lounge',
        createdAt: new Date().toISOString()
      };

      db.users.push(newUser);

      // Generate Session Token
      const token = generateToken();
      db.sessions.push({
        token,
        userId: newUser.id,
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days
      });

      saveDbSync();
      setSessionCookie(token);
      sendJson(201, { user: sanitizeUser(newUser) });
    });
    return;
  }

  // 2. AUTH: LOGIN
  if (req.method === 'POST' && pathname === '/api/auth/login') {
    if (rateLimitExceeded(req, 'login', 20)) return sendJson(429, { error: 'Too many login attempts. Try again later.' });
    parseJsonBody(async (err, body) => {
      if (err) return sendJson(400, { error: 'Invalid JSON' });
      const { login, password } = body;

      if (!login || !password) {
        return sendJson(400, { error: 'Username/email and password required.' });
      }

      const cleanLogin = login.trim().toLowerCase();
      const user = db.users.find(u => u.username === cleanLogin || u.email === cleanLogin);

      if (!user || !(await verifyPassword(password, user))) {
        return sendJson(401, { error: 'Invalid username/email or password.' });
      }

      if (!user.passwordIterations || user.passwordIterations < PASSWORD_ITERATIONS) {
        const upgraded = await hashPassword(password);
        user.passwordHash = upgraded.hash;
        user.salt = upgraded.salt;
        user.passwordIterations = upgraded.iterations;
      }

      user.status = 'online';

      const token = generateToken();
      db.sessions.push({
        token,
        userId: user.id,
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000
      });

      saveDbSync();
      setSessionCookie(token);
      sendJson(200, { user: sanitizeUser(user) });
    });
    return;
  }

  // 2a. AUTH: FORGOT PASSWORD
  if (req.method === 'POST' && pathname === '/api/auth/forgot-password') {
    if (rateLimitExceeded(req, 'password-reset', 5)) return sendJson(429, { error: 'Too many reset attempts. Try again later.' });
    if (!ALLOW_INSECURE_DEV_AUTH) {
      return sendJson(501, { error: 'Password reset email delivery is not configured.' });
    }
    parseJsonBody(async (err, body) => {
      if (err) return sendJson(400, { error: 'Invalid JSON' });
      const { email } = body;
      if (!email) return sendJson(400, { error: 'Email address is required.' });

      const cleanEmail = email.trim().toLowerCase();
      const user = db.users.find(u => u.email === cleanEmail);
      if (!user) {
        // Return success message to avoid email enumeration
        return sendJson(200, { success: true, message: 'If an account exists, a reset token has been generated.' });
      }

      // Generate a secure 6-digit reset token
      const resetToken = Math.floor(100000 + Math.random() * 900000).toString();
      user.resetToken = resetToken;
      user.resetTokenExpires = Date.now() + 15 * 60 * 1000; // 15 mins
      saveDbSync();

      // Return resetToken in dev response for immediate local testing
      sendJson(200, {
        success: true,
        message: 'Password reset code generated.',
        resetToken,
        note: 'In local development, use code: ' + resetToken
      });
    });
    return;
  }

  // 2b. AUTH: RESET PASSWORD
  if (req.method === 'POST' && pathname === '/api/auth/reset-password') {
    parseJsonBody(async (err, body) => {
      if (err) return sendJson(400, { error: 'Invalid JSON' });
      const { email, resetToken, newPassword } = body;
      if (!email || !resetToken || !newPassword) {
        return sendJson(400, { error: 'Email, reset code, and new password are required.' });
      }

      if (newPassword.length < 8 || newPassword.length > 128) {
        return sendJson(400, { error: 'Password must be 8–128 characters.' });
      }

      const cleanEmail = email.trim().toLowerCase();
      const user = db.users.find(u => u.email === cleanEmail && u.resetToken === resetToken.trim());
      if (!user || !user.resetTokenExpires || user.resetTokenExpires < Date.now()) {
        return sendJson(400, { error: 'Invalid or expired reset code.' });
      }

      const { hash, salt, iterations } = await hashPassword(newPassword);
      user.passwordHash = hash;
      user.salt = salt;
      user.passwordIterations = iterations;
      delete user.resetToken;
      delete user.resetTokenExpires;

      // Invalidate existing sessions for security
      db.sessions = db.sessions.filter(s => s.userId !== user.id);

      // Generate new session token
      const token = generateToken();
      db.sessions.push({
        token,
        userId: user.id,
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000
      });

      saveDbSync();
      setSessionCookie(token);
      sendJson(200, { success: true, user: sanitizeUser(user), message: 'Password updated successfully!' });
    });
    return;
  }

  // 2c. AUTH: GOOGLE ONE-CLICK SIGN IN (NO PASSWORD REQUIRED)
  if (req.method === 'POST' && pathname === '/api/auth/google') {
    if (rateLimitExceeded(req, 'dev-auth', 20)) return sendJson(429, { error: 'Too many authentication attempts. Try again later.' });
    if (!ALLOW_INSECURE_DEV_AUTH) {
      return sendJson(404, { error: 'Development authentication is disabled.' });
    }
    parseJsonBody((err, body) => {
      if (err) return sendJson(400, { error: 'Invalid JSON' });
      const { email, displayName, avatar, googleId } = body;

      if (!email) {
        return sendJson(400, { error: 'Google account email is required.' });
      }

      const cleanEmail = email.trim().toLowerCase();
      let user = db.users.find(u => u.email === cleanEmail || (googleId && u.googleId === googleId));

      if (!user) {
        // Automatically create account from Google profile
        const baseUsername = (cleanEmail.split('@')[0] || 'gamer')
          .replace(/[^a-z0-9_]/g, '')
          .slice(0, 15);
        let uniqueUsername = baseUsername || 'gamer';
        let counter = 1;
        while (db.users.some(u => u.username === uniqueUsername)) {
          uniqueUsername = `${baseUsername}${counter++}`;
        }

        user = {
          id: 'usr-g-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          displayName: (displayName || cleanEmail.split('@')[0]).trim(),
          username: uniqueUsername,
          email: cleanEmail,
          googleId: googleId || 'g_' + Date.now(),
          passwordHash: null,
          salt: null,
          avatar: avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${uniqueUsername}`,
          bio: 'Connected via Google 🚀',
          status: 'online',
          customStatus: 'In Gaming Lounge',
          createdAt: new Date().toISOString()
        };
        db.users.push(user);
      } else {
        user.status = 'online';
        if (avatar && !user.avatar.includes('dicebear')) {
          user.avatar = avatar;
        }
      }

      const token = generateToken();
      db.sessions.push({
        token,
        userId: user.id,
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000
      });

      saveDbSync();
      setSessionCookie(token);
      sendJson(200, { user: sanitizeUser(user), token });
    });
    return;
  }

  // 3. AUTH: LOGOUT
  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    const authUser = getAuthUser(req);
    if (authUser) {
      db.sessions = db.sessions.filter(s => s.token !== authUser.token);
      const remaining = db.sessions.some(s => s.userId === authUser.id);
      if (!remaining) {
        const u = db.users.find(u => u.id === authUser.id);
        if (u) u.status = 'offline';
      }
      saveDbSync();
    }
    setSessionCookie('', 0);
    sendJson(200, { success: true });
    return;
  }

  // 4. AUTH: GET CURRENT USER
  if (req.method === 'GET' && pathname === '/api/auth/me') {
    const authUser = getAuthUser(req);
    if (!authUser) return sendJson(401, { error: 'Not authenticated' });
    sendJson(200, { user: sanitizeUser(authUser) });
    return;
  }

  // 5. AUTH: UPDATE PROFILE
  if (req.method === 'PUT' && pathname === '/api/auth/profile') {
    const authUser = getAuthUser(req);
    if (!authUser) return sendJson(401, { error: 'Not authenticated' });

    parseJsonBody((err, body) => {
      if (err) return sendJson(400, { error: 'Invalid JSON' });
      const user = db.users.find(u => u.id === authUser.id);
      if (!user) return sendJson(404, { error: 'User not found' });

      if (body.displayName) user.displayName = body.displayName.trim();
      if (body.bio !== undefined) user.bio = body.bio.trim();
      if (body.customStatus !== undefined) user.customStatus = body.customStatus.trim();
      if (body.avatar) user.avatar = body.avatar.trim();
      if (body.status) user.status = body.status;

      saveDbSync();
      broadcast('user_presence', { userId: user.id, status: user.status, customStatus: user.customStatus });
      sendJson(200, { user: sanitizeUser(user) });
    });
    return;
  }

  // 6. SOCIAL: SEARCH & LOUNGE USERS
  if (req.method === 'GET' && (pathname === '/api/users/search' || pathname === '/api/users/lounge')) {
    const authUser = getAuthUser(req);
    if (!authUser) return sendJson(401, { error: 'Not authenticated' });
    const q = (parsedUrl.searchParams.get('q') || '').trim().toLowerCase();

    let results = db.users.filter(u => u.id !== authUser.id);
    if (q) {
      results = results.filter(u => u.username.includes(q) || u.displayName.toLowerCase().includes(q));
    }
    results = results.slice(0, 15).map(sanitizePublicUser);

    sendJson(200, { users: results });
    return;
  }

  // 7. SOCIAL: FRIENDS & FRIEND REQUESTS
  if (req.method === 'GET' && pathname === '/api/friends') {
    const authUser = getAuthUser(req);
    if (!authUser) return sendJson(401, { error: 'Not authenticated' });

    // Find accepted friendships
    const friendIds = db.friendships
      .filter(f => f.user1Id === authUser.id || f.user2Id === authUser.id)
      .map(f => f.user1Id === authUser.id ? f.user2Id : f.user1Id);

    const friends = db.users.filter(u => friendIds.includes(u.id)).map(sanitizePublicUser);

    // Find pending requests received
    const pendingReceived = db.friendRequests
      .filter(r => r.toUserId === authUser.id && r.status === 'pending')
      .map(r => {
        const fromUser = db.users.find(u => u.id === r.fromUserId);
        return { id: r.id, user: fromUser ? sanitizePublicUser(fromUser) : null };
      })
      .filter(r => r.user !== null);

    // Find pending requests sent
    const pendingSent = db.friendRequests
      .filter(r => r.fromUserId === authUser.id && r.status === 'pending')
      .map(r => {
        const toUser = db.users.find(u => u.id === r.toUserId);
        return { id: r.id, user: toUser ? sanitizePublicUser(toUser) : null };
      })
      .filter(r => r.user !== null);

    sendJson(200, { friends, pendingReceived, pendingSent });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/friends/request') {
    const authUser = getAuthUser(req);
    if (!authUser) return sendJson(401, { error: 'Not authenticated' });

    parseJsonBody((err, body) => {
      if (err) return sendJson(400, { error: 'Invalid JSON' });
      const { targetUsername } = body;
      if (!targetUsername || typeof targetUsername !== 'string') return sendJson(400, { error: 'A username is required.' });
      const targetUser = db.users.find(u => u.username === targetUsername.trim().toLowerCase());

      if (!targetUser) return sendJson(404, { error: 'User not found.' });
      if (targetUser.id === authUser.id) return sendJson(400, { error: 'You cannot add yourself.' });

      // Check if already friends
      const isFriend = db.friendships.some(
        f => (f.user1Id === authUser.id && f.user2Id === targetUser.id) || (f.user1Id === targetUser.id && f.user2Id === authUser.id)
      );
      if (isFriend) return sendJson(400, { error: 'You are already friends.' });

      // Check existing pending request
      const existingReq = db.friendRequests.find(
        r => r.fromUserId === authUser.id && r.toUserId === targetUser.id && r.status === 'pending'
      );
      if (existingReq) return sendJson(400, { error: 'Friend request already sent.' });

      const newReq = {
        id: 'req-' + Date.now(),
        fromUserId: authUser.id,
        toUserId: targetUser.id,
        status: 'pending',
        createdAt: new Date().toISOString()
      };
      db.friendRequests.push(newReq);
      saveDbSync();

      sendToUser(targetUser.id, 'friend_request', { id: newReq.id, fromUser: sanitizePublicUser(authUser) });
      sendJson(200, { success: true, message: 'Friend request sent!' });
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/friends/respond') {
    const authUser = getAuthUser(req);
    if (!authUser) return sendJson(401, { error: 'Not authenticated' });

    parseJsonBody((err, body) => {
      const { requestId, action } = body; // action: 'accept' | 'reject'
      const reqIdx = db.friendRequests.findIndex(r => r.id === requestId && r.toUserId === authUser.id);
      if (reqIdx === -1) return sendJson(404, { error: 'Request not found' });

      const fr = db.friendRequests[reqIdx];
      if (action === 'accept') {
        db.friendships.push({
          id: 'frnd-' + Date.now(),
          user1Id: fr.fromUserId,
          user2Id: authUser.id,
          createdAt: new Date().toISOString()
        });
        db.friendRequests.splice(reqIdx, 1);
        saveDbSync();
        sendToUser(fr.fromUserId, 'friend_accepted', { user: sanitizePublicUser(authUser) });
        const fromUserObj = db.users.find(u => u.id === fr.fromUserId);
        sendToUser(authUser.id, 'friend_accepted', { user: fromUserObj ? sanitizePublicUser(fromUserObj) : null });
        sendJson(200, { success: true, message: 'Friend accepted!' });
      } else {
        db.friendRequests.splice(reqIdx, 1);
        saveDbSync();
        sendJson(200, { success: true, message: 'Friend request rejected.' });
      }
    });
    return;
  }

  // 8. SERVERS & CHANNELS
  if (req.method === 'GET' && pathname === '/api/servers') {
    const authUser = getAuthUser(req);
    if (!authUser) return sendJson(401, { error: 'Not authenticated' });

    const userServers = db.servers.filter(s => s.members.some(m => m.userId === authUser.id));
    sendJson(200, { servers: userServers });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/servers') {
    const authUser = getAuthUser(req);
    if (!authUser) return sendJson(401, { error: 'Not authenticated' });

    parseJsonBody((err, body) => {
      const { name, color } = body;
      if (!name) return sendJson(400, { error: 'Server name is required' });

      const acronym = name.trim().split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase();
      const newServer = {
        id: 'srv-' + Date.now(),
        name: name.trim(),
        acronym: acronym || 'NEW',
        color: color || '#5865f2',
        ownerId: authUser.id,
        inviteCode: crypto.randomBytes(4).toString('hex').toUpperCase(),
        members: [{ userId: authUser.id, role: 'Owner' }],
        channels: [
          { id: 'ch-general-' + Date.now(), name: 'general', type: 'text' },
          { id: 'ch-gaming-' + Date.now(), name: 'gaming-chat', type: 'text' },
          { id: 'ch-lounge-' + Date.now(), name: 'Voice Lounge', type: 'voice' }
        ],
        createdAt: new Date().toISOString()
      };

      db.servers.push(newServer);
      saveDbSync();
      sendJson(201, { server: newServer });
    });
    return;
  }

  // 8b. DISCOVER PUBLIC SERVERS
  if (req.method === 'GET' && pathname === '/api/servers/discover') {
    const authUser = getAuthUser(req);
    const publicServers = db.servers.map(s => ({
      id: s.id,
      name: s.name,
      acronym: s.acronym,
      color: s.color,
      inviteCode: s.inviteCode,
      memberCount: s.members.length,
      isMember: authUser ? s.members.some(m => m.userId === authUser.id) : false
    }));
    sendJson(200, { servers: publicServers });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/servers/join') {
    const authUser = getAuthUser(req);
    if (!authUser) return sendJson(401, { error: 'Not authenticated' });

    parseJsonBody((err, body) => {
      const { inviteCode } = body;
      if (!inviteCode || typeof inviteCode !== 'string') {
        return sendJson(400, { error: 'Server invite code is required.' });
      }
      const serverToJoin = db.servers.find(s => s.inviteCode === inviteCode.trim().toUpperCase());
      if (!serverToJoin) return sendJson(404, { error: 'Invalid server invite code.' });

      if (!serverToJoin.members.some(m => m.userId === authUser.id)) {
        serverToJoin.members.push({ userId: authUser.id, role: 'Member' });
        saveDbSync();
      }
      sendJson(200, { server: serverToJoin });
    });
    return;
  }

  // 9. MESSAGES
  if (req.method === 'GET' && pathname.startsWith('/api/channels/') && pathname.endsWith('/messages')) {
    const authUser = getAuthUser(req);
    if (!authUser) return sendJson(401, { error: 'Not authenticated' });
    const parts = pathname.split('/');
    const channelId = parts[3];
    if (!userCanAccessChannel(authUser.id, channelId)) return sendJson(403, { error: 'You cannot access that channel.' });
    const msgs = db.messages.filter(m => m.channelId === channelId).slice(-100);
    sendJson(200, { messages: msgs });
    return;
  }

  // 10. MULTIPLAYER GAME ROOMS
  if (req.method === 'GET' && pathname === '/api/games/rooms') {
    const authUser = getAuthUser(req);
    if (!authUser) return sendJson(401, { error: 'Not authenticated' });
    sendJson(200, { rooms: db.gameRooms.map(room => gameRoomForUser(room, authUser.id)) });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/games/create') {
    const authUser = getAuthUser(req);
    if (!authUser) return sendJson(401, { error: 'Not authenticated' });

    parseJsonBody((err, body) => {
      const { gameType, name, maxPlayers = 2 } = body;
      const supportedGames = ['tictactoe', 'connect4', 'rps', 'reaction', 'guess', 'trivia'];
      if (!supportedGames.includes(gameType)) return sendJson(400, { error: 'Unsupported game type.' });
      const safeMaxPlayers = Math.max(2, Math.min(8, Number(maxPlayers) || 2));
      const code = crypto.randomBytes(3).toString('hex').toUpperCase();

      const newRoom = {
        id: 'gm-' + Date.now(),
        code,
        gameType,
        name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 60) : `${authUser.displayName}'s ${gameType.toUpperCase()}`,
        hostId: authUser.id,
        maxPlayers: safeMaxPlayers,
        players: [{
          userId: authUser.id,
          username: authUser.username,
          displayName: authUser.displayName,
          avatar: authUser.avatar,
          isReady: false,
          score: 0
        }],
        status: 'waiting', // 'waiting' | 'playing' | 'finished'
        gameState: null,
        currentTurn: null,
        winner: null,
        createdAt: new Date().toISOString()
      };

      db.gameRooms.push(newRoom);
      saveDbSync();
      broadcastGameRoom('game_room_created', newRoom);
      sendJson(201, { room: gameRoomForUser(newRoom, authUser.id) });
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/games/join') {
    const authUser = getAuthUser(req);
    if (!authUser) return sendJson(401, { error: 'Not authenticated' });

    parseJsonBody((err, body) => {
      const { code } = body;
      if (!code || typeof code !== 'string') return sendJson(400, { error: 'Game room code is required.' });
      const room = db.gameRooms.find(r => r.code === code.trim().toUpperCase());
      if (!room) return sendJson(404, { error: 'Game room not found.' });

      if (room.players.length >= room.maxPlayers && !room.players.some(p => p.userId === authUser.id)) {
        return sendJson(400, { error: 'Game room is full.' });
      }

      if (!room.players.some(p => p.userId === authUser.id)) {
        room.players.push({
          userId: authUser.id,
          username: authUser.username,
          displayName: authUser.displayName,
          avatar: authUser.avatar,
          isReady: false,
          score: 0
        });
        saveDbSync();
        broadcastGameRoom('game_room_update', room);
      }

      sendJson(200, { room: gameRoomForUser(room, authUser.id) });
    });
    return;
  }

  // 11. VOICE ROOM PARTICIPANTS
  if (req.method === 'GET' && pathname.startsWith('/api/voice/')) {
    const authUser = getAuthUser(req);
    if (!authUser) return sendJson(401, { error: 'Not authenticated' });
    const channelId = pathname.replace('/api/voice/', '');
    if (!userCanJoinVoiceChannel(authUser.id, channelId)) return sendJson(403, { error: 'You cannot access that voice channel.' });
    sendJson(200, { participants: db.voiceParticipants[channelId] || [] });
    return;
  }

  // 11b. SHARED SYNCHRONIZED MUSIC ROOMS
  if (req.method === 'GET' && pathname === '/api/music/rooms') {
    const authUser = getAuthUser(req);
    if (!authUser) return sendJson(401, { error: 'Not authenticated' });
    if (!db.musicRooms || db.musicRooms.length === 0) {
      db.musicRooms = getInitialDb().musicRooms;
      saveDbSync();
    }
    const now = Date.now();
    const rooms = db.musicRooms.map(r => ({
      ...r,
      serverTime: now,
      currentTrack: r.queue[r.currentTrackIndex] || r.queue[0]
    }));
    sendJson(200, { rooms });
    return;
  }

  // 12. STATIC FILE & SPA SERVING
  let reqPath = pathname;
  if (reqPath === '/' || !path.extname(reqPath)) {
    reqPath = '/index.html';
  }

  const filePath = path.resolve(PUBLIC_DIR, '.' + reqPath);
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
    sendJson(403, { error: 'Forbidden' });
    return;
  }
  const extname = String(path.extname(filePath)).toLowerCase();
  const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.map': 'application/json'
  };
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
      } else {
        res.writeHead(500);
        res.end('Server Error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType + '; charset=utf-8' });
      res.end(content, 'utf-8');
    }
  });
});

// Attach WebSocket Upgrade Handler
server.on('upgrade', handleWsUpgrade);

// Detect Local Network Wi-Fi IPv4 Address
function getLocalIpAddress() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (net.family === 'IPv4' && !net.internal) {
        if (!net.address.startsWith('169.254')) {
          return net.address;
        }
      }
    }
  }
  return '127.0.0.1';
}

const localIp = getLocalIpAddress();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`================================================================`);
  console.log(`🎮 REAL SOCIAL GAMING PLATFORM SERVER IS LIVE!`);
  console.log(`👉 Local:              http://localhost:${PORT}`);
  console.log(`👉 Wi-Fi Local Network: http://${localIp}:${PORT}`);
  console.log(`📡 WebSocket:          ws://${localIp}:${PORT}`);
  console.log(`🔒 Database:           data/db.json (Fully persistent)`);
  console.log(`================================================================`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the other process or set PORT to another value.`);
    process.exitCode = 1;
    return;
  }
  console.error('Server failed:', error);
  process.exitCode = 1;
});
