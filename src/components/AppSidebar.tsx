import type { Channel, NexusServer, User, ViewId } from '../types';
import { Icon } from './Icon';

interface AppSidebarProps {
  user: User;
  view: ViewId;
  servers: NexusServer[];
  selectedServer: NexusServer | null;
  selectedChannel: Channel | null;
  mobileOpen: boolean;
  realtimeStatus: 'offline' | 'connecting' | 'online';
  onView: (view: ViewId) => void;
  onChannel: (server: NexusServer, channel: Channel) => void;
  onLogout: () => void;
  onCreateSpace: () => void;
  onCloseMobile: () => void;
}

const navigation: Array<{ id: ViewId; label: string; caption: string; icon: Parameters<typeof Icon>[0]['name'] }> = [
  { id: 'home', label: 'Homebase', caption: 'Tonight at a glance', icon: 'home' },
  { id: 'voice', label: 'Voice lounge', caption: 'Drop in and talk', icon: 'voice' },
  { id: 'music', label: 'Listen together', caption: 'Shared queue', icon: 'music' },
  { id: 'games', label: 'Game room', caption: 'Quick multiplayer', icon: 'game' },
  { id: 'friends', label: 'Your people', caption: 'Friends and invites', icon: 'users' },
];

export function AppSidebar(props: AppSidebarProps) {
  const { user, view, servers, selectedServer, selectedChannel, mobileOpen, realtimeStatus, onView, onChannel, onLogout, onCreateSpace, onCloseMobile } = props;
  return (
    <>
      {mobileOpen && <button className="mobile-backdrop" aria-label="Close navigation" onClick={onCloseMobile} />}
      <aside className={`app-sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-brand-row">
          <a className="brand" href="/" onClick={(event) => { event.preventDefault(); onView('home'); }}>
            <span className="brand-mark"><span>N</span></span><span>Nexus</span>
          </a>
          <button className="icon-button mobile-only" onClick={onCloseMobile} aria-label="Close navigation"><Icon name="close" /></button>
        </div>

        <nav className="primary-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <button key={item.id} className={view === item.id && (item.id !== 'voice' || !selectedChannel) ? 'active' : ''} onClick={() => { onView(item.id); onCloseMobile(); }}>
              <span className="nav-icon"><Icon name={item.icon} size={19} /></span>
              <span><strong>{item.label}</strong><small>{item.caption}</small></span>
              {item.id === 'voice' && <i className="live-pip" />}
            </button>
          ))}
        </nav>

        <div className="sidebar-section-head"><span>YOUR SPACES</span><button aria-label="Create a server" onClick={onCreateSpace}><Icon name="plus" size={16} /></button></div>
        <div className="space-list">
          {!servers.length && <p className="sidebar-empty">Create a space to unlock permanent text and voice channels.</p>}
          {servers.map((server) => (
            <div className="space-block" key={server.id}>
              <button className="space-title" onClick={() => {
                const first = server.channels[0];
                if (first) onChannel(server, first);
              }}>
                <span className="space-avatar" style={{ background: server.color }}>{server.acronym}</span>
                <span>{server.name}</span><Icon name="chevron" size={15} />
              </button>
              {(selectedServer?.id === server.id ? server.channels : []).map((channel) => (
                <button
                  key={channel.id}
                  className={`channel-link ${selectedChannel?.id === channel.id && (view === 'chat' || view === 'voice') ? 'active' : ''}`}
                  onClick={() => { onChannel(server, channel); onCloseMobile(); }}
                >
                  <Icon name={channel.type === 'text' ? 'hash' : 'voice'} size={16} />
                  <span>{channel.name}</span>
                  {channel.type !== 'text' && <i className="channel-signal"><b /><b /><b /></i>}
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="sidebar-profile">
          <div className="profile-avatar-wrap"><img src={user.avatar} alt="" /><i className={`presence ${user.status}`} /></div>
          <div className="profile-copy"><strong>{user.displayName}</strong><span><i className={`socket-dot ${realtimeStatus}`} />{realtimeStatus === 'online' ? 'Connected' : realtimeStatus}</span></div>
          <button className="icon-button" aria-label="Settings"><Icon name="settings" size={18} /></button>
          <button className="icon-button" aria-label="Sign out" onClick={onLogout}><Icon name="logout" size={18} /></button>
        </div>
      </aside>
    </>
  );
}
