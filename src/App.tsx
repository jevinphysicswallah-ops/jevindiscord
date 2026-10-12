import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AppSidebar } from './components/AppSidebar';
import { AuthScreen } from './components/AuthScreen';
import { Icon } from './components/Icon';
import { Topbar } from './components/Topbar';
import { useRealtime } from './hooks/useRealtime';
import { useVoiceRoom } from './hooks/useVoiceRoom';
import { ApiError, api, jsonBody } from './lib/api';
import type { Channel, GameRoom, Message, MusicRoom, NexusServer, User, ViewId } from './types';
import { ChatView } from './views/ChatView';
import { FriendsView } from './views/FriendsView';
import { GamesView } from './views/GamesView';
import { HomeView } from './views/HomeView';
import { MusicView } from './views/MusicView';
import { VoiceView } from './views/VoiceView';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [view, setView] = useState<ViewId>('home');
  const [servers, setServers] = useState<NexusServer[]>([]);
  const [selectedServer, setSelectedServer] = useState<NexusServer | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [voiceTarget, setVoiceTarget] = useState({ id: 'nexus-main-lounge', name: 'After-hours lounge', context: 'Nexus community' });
  const [musicRoom, setMusicRoom] = useState<MusicRoom | null>(null);
  const [games, setGames] = useState<GameRoom[]>([]);
  const [people, setPeople] = useState<User[]>([]);
  const [liveMessage, setLiveMessage] = useState<Message | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [createSpaceOpen, setCreateSpaceOpen] = useState(false);
  const [toast, setToast] = useState('');

  const { status: realtimeStatus, send: sendRealtime, subscribe } = useRealtime(!!user);
  const voice = useVoiceRoom({ user: user ?? anonymousUser, send: sendRealtime, subscribe });
  const musicRoomId = musicRoom?.id;

  const loadCore = useCallback(async () => {
    const [serverData, musicData, gameData, peopleData] = await Promise.all([
      api<{ servers: NexusServer[] }>('/api/servers'),
      api<{ rooms: MusicRoom[] }>('/api/music/rooms'),
      api<{ rooms: GameRoom[] }>('/api/games/rooms'),
      api<{ users: User[] }>('/api/users/lounge'),
    ]);
    setServers(serverData.servers);
    setSelectedServer((current) => current ?? serverData.servers[0] ?? null);
    setSelectedChannel((current) => current ?? serverData.servers[0]?.channels[0] ?? null);
    setMusicRoom(musicData.rooms[0] ?? null);
    setGames(gameData.rooms);
    setPeople(peopleData.users);
  }, []);

  useEffect(() => {
    void api<{ user: User }>('/api/auth/me').then(({ user: nextUser }) => {
      setUser(nextUser);
      return loadCore();
    }).catch(() => undefined).finally(() => setBooting(false));
  }, [loadCore]);

  useEffect(() => {
    if (!user) return;
    const unsubscribers = [
      subscribe('new_message', (payload) => setLiveMessage(payload as Message)),
      subscribe('music_room_update', (payload) => setMusicRoom((payload as { room: MusicRoom }).room)),
      subscribe('game_room_update', (payload) => setGames((current) => upsertRoom(current, payload as GameRoom))),
      subscribe('game_room_created', (payload) => setGames((current) => upsertRoom(current, payload as GameRoom))),
      subscribe('user_presence', (payload) => {
        const update = payload as Partial<User> & { userId: string };
        setPeople((current) => current.map((person) => person.id === update.userId ? { ...person, ...update } : person));
      }),
      subscribe('friend_request', () => showToast('You have a new friend request.')),
      subscribe('voice_invite', (payload) => showToast(`${(payload as { fromDisplayName: string }).fromDisplayName} invited you to voice.`)),
      subscribe('error', (payload) => showToast(String(payload))),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [subscribe, user]);

  useEffect(() => {
    if (!user || !musicRoomId || realtimeStatus !== 'online') return;
    sendRealtime('music_action', { roomId: musicRoomId, action: 'join', data: {} });
  }, [musicRoomId, realtimeStatus, sendRealtime, user]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setSearchOpen((open) => !open);
      }
      if (event.key === 'Escape') { setSearchOpen(false); setCreateSpaceOpen(false); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 3500);
  }

  async function authenticated(nextUser: User) {
    setUser(nextUser); setBooting(true);
    try { await loadCore(); } finally { setBooting(false); }
  }

  async function logout() {
    voice.leave();
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* Local cleanup still applies. */ }
    setUser(null); setServers([]); setMusicRoom(null); setView('home');
  }

  function chooseChannel(server: NexusServer, channel: Channel) {
    setSelectedServer(server);
    setSelectedChannel(channel);
    if (channel.type === 'text') {
      setView('chat');
    } else {
      setVoiceTarget({ id: channel.id, name: channel.name, context: server.name });
      setView('voice');
    }
  }

  function chooseView(next: ViewId) {
    if (next === 'voice') {
      setVoiceTarget({ id: 'nexus-main-lounge', name: 'After-hours lounge', context: 'Nexus community' });
      setSelectedChannel(null);
    }
    setView(next);
  }

  const sendMusicAction = useCallback((action: string, data: unknown = {}) => {
    if (!musicRoom) return;
    sendRealtime('music_action', { roomId: musicRoom.id, action, data });
  }, [musicRoom, sendRealtime]);

  const sendGameAction = useCallback((roomId: string, action: string, data: unknown = {}) => {
    sendRealtime('game_action', { roomId, action, data });
  }, [sendRealtime]);

  const activePeople = useMemo(() => people.filter((person) => person.status !== 'offline'), [people]);

  if (booting) return <div className="splash"><div className="brand-mark large"><span>N</span></div><div className="splash-word">NEXUS</div><span className="button-spinner" /></div>;
  if (!user) return <AuthScreen onAuthenticated={(nextUser) => void authenticated(nextUser)} />;

  return (
    <div className="app-shell">
      <AppSidebar
        user={user} view={view} servers={servers} selectedServer={selectedServer} selectedChannel={selectedChannel}
        mobileOpen={mobileOpen} realtimeStatus={realtimeStatus} onView={chooseView} onChannel={chooseChannel}
        onLogout={() => void logout()} onCreateSpace={() => setCreateSpaceOpen(true)} onCloseMobile={() => setMobileOpen(false)}
      />
      <main className="app-main">
        <Topbar view={view} title={view === 'voice' ? voiceTarget.name : undefined} onMenu={() => setMobileOpen(true)} onSearch={() => setSearchOpen(true)} />
        {view === 'home' && <HomeView user={user} servers={servers} musicRoom={musicRoom} onlinePeople={activePeople} onView={chooseView} />}
        {view === 'voice' && <VoiceView user={user} voice={voice} target={voiceTarget} />}
        {view === 'music' && <MusicView room={musicRoom} sendAction={sendMusicAction} ducking={voice.participants.some((participant) => participant.userId !== user.id && participant.isSpeaking)} />}
        {view === 'games' && <GamesView user={user} rooms={games} sendAction={sendGameAction} onRefresh={() => void loadCore()} />}
        {view === 'friends' && <FriendsView onVoice={() => chooseView('voice')} />}
        {view === 'chat' && <ChatView user={user} server={selectedServer} channel={selectedChannel} liveMessage={liveMessage} send={sendRealtime} onVoice={() => chooseView('voice')} />}
        {!servers.length && view === 'home' && <button className="floating-create" onClick={() => setCreateSpaceOpen(true)}><Icon name="plus"/> Create your first space</button>}
      </main>
      {searchOpen && <CommandMenu onClose={() => setSearchOpen(false)} onView={(next) => { chooseView(next); setSearchOpen(false); }} servers={servers} onChannel={(server, channel) => { chooseChannel(server, channel); setSearchOpen(false); }} />}
      {createSpaceOpen && <CreateSpaceModal onClose={() => setCreateSpaceOpen(false)} onCreated={(server) => { setServers((current) => [...current, server]); setSelectedServer(server); setSelectedChannel(server.channels[0] ?? null); setCreateSpaceOpen(false); showToast(`${server.name} is ready.`); }} />}
      {toast && <div className="toast"><Icon name="sparkles" size={17}/>{toast}</div>}
    </div>
  );
}

const anonymousUser: User = { id: '', username: '', displayName: '', avatar: '', status: 'offline' };

function upsertRoom(rooms: GameRoom[], next: GameRoom) {
  if (!next.players?.length) return rooms.filter((room) => room.id !== next.id);
  return rooms.some((room) => room.id === next.id) ? rooms.map((room) => room.id === next.id ? next : room) : [next, ...rooms];
}

function CommandMenu({ onClose, onView, servers, onChannel }: { onClose: () => void; onView: (view: ViewId) => void; servers: NexusServer[]; onChannel: (server: NexusServer, channel: Channel) => void }) {
  const [query, setQuery] = useState('');
  const entries = [
    { label: 'Homebase', icon: 'home' as const, action: () => onView('home') },
    { label: 'Voice lounge', icon: 'voice' as const, action: () => onView('voice') },
    { label: 'Listen together', icon: 'music' as const, action: () => onView('music') },
    { label: 'Game room', icon: 'game' as const, action: () => onView('games') },
    { label: 'Your people', icon: 'users' as const, action: () => onView('friends') },
    ...servers.flatMap((server) => server.channels.map((channel) => ({ label: `${server.name} / ${channel.name}`, icon: (channel.type === 'text' ? 'hash' : 'voice') as 'hash' | 'voice', action: () => onChannel(server, channel) }))),
  ].filter((entry) => entry.label.toLowerCase().includes(query.toLowerCase()));
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-label="Search Nexus" onMouseDown={onClose}><div className="command-menu" onMouseDown={(event) => event.stopPropagation()}><div className="command-input"><Icon name="search"/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Where do you want to go?"/><kbd>ESC</kbd></div><div className="command-results">{entries.map((entry) => <button key={entry.label} onClick={entry.action}><span><Icon name={entry.icon}/></span>{entry.label}<Icon name="chevron" size={16}/></button>)}</div></div></div>;
}

function CreateSpaceModal({ onClose, onCreated }: { onClose: () => void; onCreated: (server: NexusServer) => void }) {
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ server: NexusServer }>('/api/servers', { method: 'POST', ...jsonBody({ name: form.get('name'), color: form.get('color') }) });
      onCreated(result.server);
    } catch (reason) { setError(reason instanceof ApiError ? reason.message : 'Could not create the space.'); }
  }
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="space-title" onMouseDown={onClose}><form className="create-modal glass-card" onSubmit={(event) => void submit(event)} onMouseDown={(event) => event.stopPropagation()}><button type="button" className="icon-button modal-close" onClick={onClose}><Icon name="close"/></button><span className="eyebrow">A PLACE OF YOUR OWN</span><h2 id="space-title">Create a space</h2><p>Every space starts with text, gaming, and voice channels.</p><label>Space name<input name="name" required maxLength={40} placeholder="Friday Night Crew" autoFocus/></label><label>Accent color<input name="color" type="color" defaultValue="#7c5cff"/></label>{error && <div className="form-error">{error}</div>}<button className="primary-button" type="submit"><Icon name="plus"/> Create space</button></form></div>;
}

export default App;
