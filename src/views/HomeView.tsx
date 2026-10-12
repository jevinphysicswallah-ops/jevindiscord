import type { MusicRoom, NexusServer, User, ViewId } from '../types';
import { Icon } from '../components/Icon';

interface HomeViewProps {
  user: User;
  servers: NexusServer[];
  musicRoom: MusicRoom | null;
  onlinePeople: User[];
  onView: (view: ViewId) => void;
}

export function HomeView({ user, servers, musicRoom, onlinePeople, onView }: HomeViewProps) {
  const track = musicRoom?.currentTrack;
  return (
    <div className="view home-view">
      <section className="hero-card">
        <div className="hero-noise" />
        <div className="hero-copy">
          <span className="eyebrow light"><Icon name="radio" size={15} /> YOUR NIGHT, ONE PLACE</span>
          <h2>Hey {user.displayName.split(' ')[0]},<br /><span>the room feels better with you in it.</span></h2>
          <p>Start a voice hangout, queue the soundtrack, then pull everyone into a quick game without leaving Nexus.</p>
          <div className="hero-actions">
            <button className="light-button" onClick={() => onView('voice')}><Icon name="voice" size={18} /> Open voice lounge</button>
            <button className="ghost-light-button" onClick={() => onView('music')}><Icon name="music" size={18} /> Queue a track</button>
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="planet"><span /><i /></div>
          <div className="floating-player glass-card">
            <div className="mini-art"><Icon name="music" size={23} /></div>
            <div><small>NOW FLOATING</small><strong>{track?.title || 'Your next soundtrack'}</strong><span>{track?.artist || 'Open the lounge to begin'}</span></div>
            <i className="equalizer"><b /><b /><b /><b /></i>
          </div>
          <div className="float-avatar one">K</div><div className="float-avatar two">M</div><div className="float-avatar three">J</div>
        </div>
      </section>

      <section className="quick-grid">
        <button className="quick-card coral" onClick={() => onView('voice')}>
          <div className="quick-icon"><Icon name="voice" size={24} /></div><span>DROP IN</span><h3>Voice lounge</h3><p>Low-latency talk with video and screen share.</p><b><Icon name="chevron" size={18} /></b>
        </button>
        <button className="quick-card violet" onClick={() => onView('music')}>
          <div className="quick-icon"><Icon name="music" size={24} /></div><span>PRESS PLAY</span><h3>Shared listening</h3><p>One queue, synchronized room state, every device.</p><b><Icon name="chevron" size={18} /></b>
        </button>
        <button className="quick-card mint" onClick={() => onView('games')}>
          <div className="quick-icon"><Icon name="game" size={24} /></div><span>QUICK MATCH</span><h3>Game room</h3><p>Friendly rounds with no downloads or setup.</p><b><Icon name="chevron" size={18} /></b>
        </button>
      </section>

      <div className="home-columns">
        <section className="panel activity-panel">
          <div className="panel-heading"><div><span className="eyebrow">HAPPENING NOW</span><h2>Find your people</h2></div><button className="text-button" onClick={() => onView('friends')}>See everyone <Icon name="chevron" size={15} /></button></div>
          <div className="activity-list">
            {onlinePeople.length ? onlinePeople.slice(0, 4).map((person, index) => (
              <div className="activity-row" key={person.id}>
                <div className="profile-avatar-wrap"><img src={person.avatar} alt="" /><i className={`presence ${person.status}`} /></div>
                <div><strong>{person.displayName}</strong><span>{person.customStatus || (index % 2 ? 'Building the perfect queue' : 'Ready to hang out')}</span></div>
                <button className="small-button" onClick={() => onView('voice')}><Icon name="voice" size={15} /> Join</button>
              </div>
            )) : <div className="warm-empty"><span>✦</span><h3>It’s quiet—for now</h3><p>Invite a friend or open a room. Good nights usually start with one person.</p><button className="small-button" onClick={() => onView('friends')}>Find friends</button></div>}
          </div>
        </section>
        <aside className="panel pulse-panel">
          <span className="eyebrow">YOUR NEXUS</span><h2>This week</h2>
          <div className="stat-ring"><div><strong>{servers.length}</strong><span>spaces</span></div></div>
          <div className="pulse-stats"><div><strong>{onlinePeople.length}</strong><span>friends online</span></div><div><strong>{musicRoom?.queue.length ?? 0}</strong><span>tracks queued</span></div></div>
          <p><Icon name="sparkles" size={16} /> Small rooms make the best conversations.</p>
        </aside>
      </div>
    </div>
  );
}
