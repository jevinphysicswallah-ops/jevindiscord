# Nexus

Nexus is a colorful, room-first social app for small gaming groups. It combines persistent chat, WebRTC voice/video, screen sharing, synchronized room state, Spotify embeds, and lightweight multiplayer games in one responsive interface.

## What works

- Account registration and sign-in with secure, HTTP-only sessions.
- Spaces with member-only text and voice channels.
- WebSocket chat, presence, friend requests, game state, voice state, and music-room synchronization.
- Peer-to-peer microphone, camera, and screen-share tracks with STUN discovery.
- Microphone filtering (85 Hz high-pass, 7.5 kHz low-pass, and speech-presence EQ), speaking detection, and shared voice indicators.
- Optional system audio when the browser and selected screen-share source support it.
- A shared listening queue with a locally generated ambient synth for the built-in tracks.
- Spotify track, album, playlist, episode, show, and search embeds synchronized as room state.
- Tic-tac-toe, Connect Four, best-of-three Rock Paper Scissors, Reaction Battle, Number Hunt, and Trivia Sprint.

Spotify playback is not captured, decrypted, or rebroadcast by Nexus. Each participant plays an official Spotify embed on their own device under Spotify's terms. Fully synchronized play/pause/seek for Spotify requires the official Spotify Web Playback SDK and the account capabilities Spotify requires.

## Run locally

Requirements: Node.js 18 or newer.

```bash
npm install
npm run dev
```

The development launcher starts Vite and the native Node.js API/WebSocket server together. To run the production bundle:

```bash
npm start
```

`npm start` builds the React client and serves `dist/` from `server.cjs` on port 3000. Set `PORT` to use a different port and `NEXUS_DATA_DIR` to keep the JSON database somewhere else.

## Verify

```bash
npm run verify
npm test
```

`npm run verify` runs ESLint, TypeScript, the Vite production build, and a Node syntax check. `npm test` starts an isolated temporary server and verifies authentication, private-channel authorization, multi-user WebSockets, music updates, Spotify URL validation, speaking state, and WebRTC signaling.

## Architecture

- `src/` — modular React 19 + TypeScript client built by Vite.
- `src/hooks/useVoiceRoom.ts` — WebRTC mesh, audio DSP, speaking detection, camera, and screen sharing.
- `src/hooks/useLoungeSynth.ts` — locally generated ambient playback for Nexus tracks.
- `server.cjs` — dependency-free Node HTTP, REST, RFC 6455 WebSocket, game, and persistence server.
- `test_full_suite.cjs` — isolated integration suite with three concurrent clients.

## Production notes

The current peer-to-peer mesh is best for small rooms. Before operating Nexus publicly, add an authenticated TURN service for restrictive networks and move persistence from the synchronous JSON store to SQLite or PostgreSQL. Large voice rooms should use an SFU rather than full mesh.
