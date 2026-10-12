export type Presence = 'online' | 'idle' | 'dnd' | 'offline';

export interface User {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  avatar: string;
  bio?: string;
  status: Presence;
  customStatus?: string;
}

export interface Channel {
  id: string;
  name: string;
  type: 'text' | 'voice' | 'stage';
}

export interface NexusServer {
  id: string;
  name: string;
  acronym: string;
  color: string;
  inviteCode: string;
  members: Array<{ userId: string; role: string }>;
  channels: Channel[];
}

export interface Message {
  id: string;
  channelId: string;
  authorId: string;
  authorName: string;
  authorUsername?: string;
  authorAvatar?: string;
  text: string;
  timestamp: string;
}

export interface VoiceParticipant {
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  isMuted: boolean;
  isDeafened: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  isSpeaking?: boolean;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  duration: number;
  artwork?: string;
  spotifyUrl?: string;
  suggestedBy?: string;
  bpm?: number;
  chords?: number[][];
}

export interface MusicRoom {
  id: string;
  name: string;
  currentTrackIndex: number;
  currentTrack: Track;
  isPlaying: boolean;
  startedAt: number;
  pauseOffset: number;
  listeners: Array<Pick<User, 'id' | 'username' | 'displayName' | 'avatar'> & { userId: string }>;
  queue: Track[];
  spotifyEmbed?: string | null;
  serverTime: number;
}

export type GameType = 'tictactoe' | 'connect4' | 'rps' | 'reaction' | 'guess' | 'trivia';

export interface GameRoom {
  id: string;
  code: string;
  gameType: GameType;
  name: string;
  hostId: string;
  maxPlayers: number;
  players: Array<Pick<User, 'username' | 'displayName' | 'avatar'> & { userId: string; isReady: boolean; score: number }>;
  status: 'waiting' | 'playing' | 'finished';
  gameState: Record<string, unknown> | null;
  currentTurn: string | null;
  winner: string | null;
}

export type ViewId = 'home' | 'voice' | 'music' | 'games' | 'friends' | 'chat';

export interface RealtimeEnvelope<T = unknown> {
  event: string;
  payload: T;
}
