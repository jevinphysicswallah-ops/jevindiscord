const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const TEST_PORT = Number(process.env.TEST_PORT || 3210);
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-test-'));
let serverProcess = null;

function startTestServer() {
  return new Promise((resolve, reject) => {
    serverProcess = spawn(process.execPath, ['server.cjs'], {
      cwd: __dirname,
      env: {
        ...process.env,
        PORT: String(TEST_PORT),
        NEXUS_DATA_DIR: TEST_DATA_DIR,
        ALLOW_INSECURE_DEV_AUTH: '1'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const timeout = setTimeout(() => reject(new Error('Test server did not start in time.')), 8000);
    serverProcess.stdout.on('data', chunk => {
      if (String(chunk).includes('SERVER IS LIVE')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    serverProcess.stderr.on('data', chunk => process.stderr.write(chunk));
    serverProcess.on('exit', code => {
      if (code && code !== 0) reject(new Error(`Test server exited with code ${code}.`));
    });
  });
}

function cleanup() {
  if (serverProcess && !serverProcess.killed) serverProcess.kill('SIGTERM');
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
}

function apiRequest(pathname, method = 'GET', body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, BASE_URL);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(json.error || `HTTP ${res.statusCode}: ${data}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Zero-dependency pure Node.js WebSocket client
class SimpleWsClient {
  constructor(token, name) {
    this.token = token;
    this.name = name;
    this.events = [];
    this.socket = null;
    this.buffer = Buffer.alloc(0);
  }

  connect() {
    return new Promise((resolve, reject) => {
      const key = crypto.randomBytes(16).toString('base64');
      const req = http.request({
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path: '/ws',
        headers: {
          'Connection': 'Upgrade',
          'Upgrade': 'websocket',
          'Sec-WebSocket-Key': key,
          'Sec-WebSocket-Version': '13'
        }
      });

      req.on('upgrade', (res, socket) => {
        this.socket = socket;
        this.socket.on('data', (chunk) => this._onData(chunk));
        this.socket.on('error', (err) => console.error(`${this.name} socket error:`, err.message));
        
        // Send initial auth packet
        this.send({ event: 'auth', payload: { token: this.token } });
        resolve(this);
      });

      req.on('error', reject);
      req.end();
    });
  }

  send(dataObj) {
    if (!this.socket || !this.socket.writable) return;
    const payload = Buffer.from(JSON.stringify(dataObj), 'utf8');
    const length = payload.length;
    const maskKey = crypto.randomBytes(4);

    let header;
    if (length <= 125) {
      header = Buffer.alloc(6);
      header[0] = 0x81;
      header[1] = 0x80 | length;
      maskKey.copy(header, 2);
    } else if (length <= 65535) {
      header = Buffer.alloc(8);
      header[0] = 0x81;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(length, 2);
      maskKey.copy(header, 4);
    } else {
      header = Buffer.alloc(14);
      header[0] = 0x81;
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(length), 2);
      maskKey.copy(header, 10);
    }

    const maskedPayload = Buffer.alloc(length);
    for (let i = 0; i < length; i++) {
      maskedPayload[i] = payload[i] ^ maskKey[i % 4];
    }

    this.socket.write(Buffer.concat([header, maskedPayload]));
  }

  _onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 2) {
      const firstByte = this.buffer[0];
      const secondByte = this.buffer[1];
      const opcode = firstByte & 0x0f;
      const isMasked = (secondByte & 0x80) !== 0;
      let payloadLength = secondByte & 0x7f;
      let offset = 2;

      if (payloadLength === 126) {
        if (this.buffer.length < 4) break;
        payloadLength = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLength === 127) {
        if (this.buffer.length < 10) break;
        payloadLength = Number(this.buffer.readBigUInt64BE(2));
        offset = 10;
      }

      let maskKey = null;
      if (isMasked) {
        if (this.buffer.length < offset + 4) break;
        maskKey = this.buffer.slice(offset, offset + 4);
        offset += 4;
      }

      if (this.buffer.length < offset + payloadLength) break;

      const payload = this.buffer.slice(offset, offset + payloadLength);
      this.buffer = this.buffer.slice(offset + payloadLength);

      if (isMasked && maskKey) {
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= maskKey[i % 4];
        }
      }

      if (opcode === 0x01) {
        try {
          const parsed = JSON.parse(payload.toString('utf8'));
          this.events.push(parsed);
        } catch (e) {}
      }
    }
  }

  close() {
    if (this.socket) {
      try { this.socket.destroy(); } catch (e) {}
    }
  }
}

async function runTests() {
  console.log('========================================================');
  console.log('🧪 RUNNING COMPREHENSIVE AUTOMATED VERIFICATION SUITE');
  console.log('========================================================\n');

  try {
    // 1. Authenticate Host, Friend, and Dad
    console.log('1. Authenticating real user accounts:');
    const hostAuth = await apiRequest('/api/auth/google', 'POST', {
      email: 'pg.74849@gmail.com',
      displayName: 'tejash patel',
      avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=pg74849',
      googleId: 'google_pg74849'
    });
    console.log(`   ✅ Host Logged In: ${hostAuth.user.displayName} (${hostAuth.user.email})`);

    const friendAuth = await apiRequest('/api/auth/google', 'POST', {
      email: 'jevinphysicswallah@gmail.com',
      displayName: 'Jevin Patel',
      avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=jevinphysicswal',
      googleId: 'google_jevinphysicswal'
    });
    console.log(`   ✅ Friend Logged In: ${friendAuth.user.displayName} (${friendAuth.user.email})`);

    const dadAuth = await apiRequest('/api/auth/google', 'POST', {
      email: 'npmithaiwala06@gmail.com',
      displayName: 'Dad (N.P. Patel)',
      avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=npmithaiwala06',
      googleId: 'google_npmithaiwala06'
    });
    console.log(`   ✅ Dad Logged In: ${dadAuth.user.displayName} (${dadAuth.user.email})`);

    // 2. Fetch Shared Music Rooms
    console.log('\n2. Verifying Shared Synchronized Music Rooms:');
    const musicData = await apiRequest('/api/music/rooms', 'GET', null, hostAuth.token);
    if (!musicData.rooms || musicData.rooms.length === 0) {
      throw new Error('No music rooms returned');
    }
    const musicRoom = musicData.rooms[0];
    console.log(`   ✅ Found Music Room: "${musicRoom.name}" with ${musicRoom.queue.length} songs in queue`);

    // 3. Connect WebSockets for all 3 users
    console.log('\n3. Connecting Real-time WebSockets:');
    const hostWs = await new SimpleWsClient(hostAuth.token, 'Host').connect();
    const friendWs = await new SimpleWsClient(friendAuth.token, 'Friend').connect();
    const dadWs = await new SimpleWsClient(dadAuth.token, 'Dad').connect();
    console.log('   ✅ Host, Friend, and Dad WebSockets Connected!');

    // Verify private space traffic stays private to its members.
    const privateSpace = await apiRequest('/api/servers', 'POST', { name: 'Host Private Space', color: '#7c5cff' }, hostAuth.token);
    const privateTextChannel = privateSpace.server.channels.find(channel => channel.type === 'text');
    const privateVoiceChannel = privateSpace.server.channels.find(channel => channel.type === 'voice');
    hostWs.send({ event: 'send_message', payload: { channelId: privateTextChannel.id, text: 'members only' } });
    friendWs.send({ event: 'voice_state', payload: { channelId: privateVoiceChannel.id, isMuted: false } });
    await new Promise(r => setTimeout(r, 400));
    if (friendWs.events.some(e => e.event === 'new_message' && e.payload?.channelId === privateTextChannel.id)) {
      throw new Error('Private channel message leaked to a non-member.');
    }
    const privateVoiceState = await apiRequest(`/api/voice/${privateVoiceChannel.id}`, 'GET', null, hostAuth.token);
    if (privateVoiceState.participants.some(participant => participant.userId === friendAuth.user.id)) {
      throw new Error('A non-member joined a private voice channel.');
    }
    console.log('   ✅ Private text and voice channels reject non-member access!');

    // 4. Test Song Editing & Full Access
    console.log('\n4. Testing Song Editing ("You can edit all the songs"):');
    const initialTrack = musicRoom.queue[0];
    const newTitle = 'Midnight Lo-Fi Echoes (Edited by Host)';
    const newArtist = 'Nexus Studio Live';

    hostWs.send({
      event: 'music_action',
      payload: {
        roomId: musicRoom.id,
        action: 'edit_track',
        data: {
          trackId: initialTrack.id,
          title: newTitle,
          artist: newArtist,
          duration: 220,
          genre: 'chill'
        }
      }
    });

    await new Promise(r => setTimeout(r, 600));

    // Verify Dad & Friend received the edited song
    const friendReceivedUpdate = friendWs.events.find(e => e.event === 'music_room_update' && e.payload?.room?.queue?.[0]?.title === newTitle);
    const dadReceivedUpdate = dadWs.events.find(e => e.event === 'music_room_update' && e.payload?.room?.queue?.[0]?.title === newTitle);

    if (!friendReceivedUpdate || !dadReceivedUpdate) {
      throw new Error('Friend or Dad failed to receive music_room_update with edited song!');
    }
    console.log(`   ✅ Edit Song Synced across all devices! Title: "${newTitle}"`);

    // 5. Test Full Spotify Access & Synchronized Embed
    console.log('\n5. Testing synchronized Spotify room selection:');
    const spotifyEmbedUrl = 'https://open.spotify.com/embed/track/0VjIjW4GlUZAMYd2vXMi3b?utm_source=generator&theme=0';

    dadWs.send({ event: 'music_action', payload: { roomId: musicRoom.id, action: 'set_spotify_embed', data: { spotifyEmbed: 'https://example.com/fake-player' } } });
    await new Promise(r => setTimeout(r, 250));
    const afterRejectedEmbed = await apiRequest('/api/music/rooms', 'GET', null, hostAuth.token);
    if (afterRejectedEmbed.rooms[0].spotifyEmbed === 'https://example.com/fake-player') {
      throw new Error('Non-Spotify iframe URL was accepted.');
    }
    
    // Dad embeds a Spotify song
    dadWs.send({
      event: 'music_action',
      payload: {
        roomId: musicRoom.id,
        action: 'set_spotify_embed',
        data: {
          spotifyEmbed: spotifyEmbedUrl,
          track: {
            title: 'Blinding Lights',
            artist: 'The Weeknd',
            spotifyUrl: 'https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b'
          }
        }
      }
    });

    await new Promise(r => setTimeout(r, 600));

    const hostReceivedSpotify = hostWs.events.find(e => e.event === 'music_room_update' && e.payload?.room?.spotifyEmbed === spotifyEmbedUrl);
    const friendReceivedSpotify = friendWs.events.find(e => e.event === 'music_room_update' && e.payload?.room?.spotifyEmbed === spotifyEmbedUrl);

    if (!hostReceivedSpotify || !friendReceivedSpotify) {
      throw new Error('Host or Friend failed to receive synchronized Spotify embed!');
    }
    console.log('   ✅ Official Spotify embed selection matched across all devices!');

    // 6. Test Voice Lounge Full Mesh WebRTC Voice Calling for Dad, Friend, and Host
    console.log('\n6. Testing Voice Lounge Multi-User Voice Mesh ("Dad can hear me and my friend also when we join the voice lounge"):');
    const channelId = 'nexus-main-lounge';

    // All 3 join the voice lounge
    hostWs.send({ event: 'voice_state', payload: { channelId, isSpeaking: false, isMuted: false } });
    friendWs.send({ event: 'voice_state', payload: { channelId, isSpeaking: false, isMuted: false } });
    dadWs.send({ event: 'voice_state', payload: { channelId, isSpeaking: false, isMuted: false } });

    await new Promise(r => setTimeout(r, 600));

    // Dad speaks
    dadWs.send({ event: 'voice_speaking', payload: { channelId, isSpeaking: true } });
    await new Promise(r => setTimeout(r, 400));

    const hostSawDadSpeak = hostWs.events.find(e => e.event === 'voice_speaking' && e.payload?.userId === dadAuth.user.id && e.payload?.isSpeaking === true);
    const friendSawDadSpeak = friendWs.events.find(e => e.event === 'voice_speaking' && e.payload?.userId === dadAuth.user.id && e.payload?.isSpeaking === true);

    if (!hostSawDadSpeak || !friendSawDadSpeak) {
      throw new Error('Host or Friend failed to receive Dad voice_speaking signal!');
    }
    console.log('   ✅ Dad speaking event received by Host and Friend (Auto-ducking triggers)!');

    // Host speaks to Dad and Friend
    hostWs.send({ event: 'voice_speaking', payload: { channelId, isSpeaking: true } });
    await new Promise(r => setTimeout(r, 400));

    const dadSawHostSpeak = dadWs.events.find(e => e.event === 'voice_speaking' && e.payload?.userId === hostAuth.user.id && e.payload?.isSpeaking === true);
    const friendSawHostSpeak = friendWs.events.find(e => e.event === 'voice_speaking' && e.payload?.userId === hostAuth.user.id && e.payload?.isSpeaking === true);

    if (!dadSawHostSpeak || !friendSawHostSpeak) {
      throw new Error('Dad or Friend failed to receive Host voice_speaking signal!');
    }
    console.log('   ✅ Host speaking event received by Dad and Friend!');

    // WebRTC signaling between Dad and Host
    const dummySdpOffer = { type: 'offer', sdp: 'v=0\r\no=host 1234 1234 IN IP4 0.0.0.0\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' };
    hostWs.send({
      event: 'webrtc_signal',
      payload: { targetUserId: dadAuth.user.id, signal: { channelId, description: dummySdpOffer } }
    });
    await new Promise(r => setTimeout(r, 400));

    const dadReceivedSdp = dadWs.events.find(e => e.event === 'webrtc_signal' && e.payload?.fromUserId === hostAuth.user.id && e.payload?.signal?.description?.type === 'offer');
    if (!dadReceivedSdp) {
      throw new Error('Dad failed to receive Host WebRTC SDP Offer!');
    }
    console.log('   ✅ WebRTC P2P Voice Signal established between Host and Dad!');

    // Cleanup WebSockets
    hostWs.close();
    friendWs.close();
    dadWs.close();

    console.log('\n========================================================');
    console.log('🎉 ALL AUTOMATED TESTS PASSED WITH 100% SUCCESS!');
    console.log('========================================================');
    return true;

  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.message);
    return false;
  }
}

startTestServer()
  .then(runTests)
  .then(ok => {
    cleanup();
    process.exitCode = ok ? 0 : 1;
  })
  .catch(error => {
    console.error('\n❌ TEST SETUP FAILED:', error.message);
    cleanup();
    process.exitCode = 1;
  });
