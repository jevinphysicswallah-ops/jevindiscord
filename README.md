# ⚡ Nexus App

> **All-in-One Social Gaming, High-Fidelity Synchronized Music Lounge & Voice Mesh Platform**

Nexus App is an ultra-fast, modern communication and gaming platform inspired by Discord. It seamlessly brings friends and family together with real-time text chat, crystal-clear WebRTC voice channels, synchronized Spotify music listening, and multiplayer parlor games.

---

## ✨ Features

- 🎧 **Synchronized Spotify Music Lounge**:
  - Live shared playback queue across all connected users (Host, Dad, and Friends).
  - Search any song/artist or paste Spotify URLs in real-time.
  - Multi-user song editing and automatic synchronization.
  - Premium lossless Hi-Fi audio streaming simulation (320kbps).

- 🎙️ **Voice Mesh & Stage Channels**:
  - WebRTC mesh audio with intelligent auto-ducking when others speak.
  - Spatial audio, mute/deafen controls, and diagnostic latency metrics.
  - Hardware camera video integration with Picture-in-Picture (PIP) floating webcam when switching channels.

- 🎮 **Social Gaming Hub**:
  - Built-in parlor and arcade games (Tic-Tac-Toe, Rock Paper Scissors, Wordle, etc.).
  - Live leaderboards, multi-player matchmaking, and lobby lobbies.

- 💬 **Real-time Messaging & Channels**:
  - Persistent WebSocket chat channels, direct messages, and system notifications.
  - Rich reactions, embeds, and status updates.

- 🌄 **Glassmorphism & Natural Visual Themes**:
  - Sleek modern glass aesthetic with natural mountain, aurora, forest, and ocean backdrops.
  - Responsive layout for desktop and mobile web browsers.

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js** v18+ installed on your system.

### 2. Run the Server
Start the unified backend server (handles both HTTP static serving and real-time WebSockets):
```bash
node server.cjs
```

The application will be live at:
- **Local machine**: `http://localhost:3000`
- **Local Network (LAN)**: `http://192.168.31.21:3000` (or your LAN IP)

### 3. Run Automated Verification Tests
```bash
node test_full_suite.cjs
```

---

## 🛠️ Architecture

- **Backend**: Built with vanilla Node.js (`server.cjs`) leveraging native HTTP and WebSocket protocols for zero-dependency speed and sub-millisecond event broadcasting.
- **Frontend**: Single-page React application (`index.html`) using Lucide icons, Tailwind CSS styling, and live WebRTC audio/video mesh.
- **Persistence**: File-backed JSON data store (`data/db.json`) preserving users, messages, settings, and shared playlist queues.

---

## 📜 License

MIT License. Designed and crafted for the Nexus community.
