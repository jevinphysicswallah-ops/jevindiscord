import type { ViewId } from '../types';
import { Icon } from './Icon';

const labels: Record<ViewId, { title: string; eyebrow: string }> = {
  home: { title: 'Good evening', eyebrow: 'HOMEBASE' },
  voice: { title: 'Voice lounge', eyebrow: 'LIVE ROOM' },
  music: { title: 'Listen together', eyebrow: 'SYNCHRONIZED SESSION' },
  games: { title: 'Game room', eyebrow: 'PLAY SOMETHING' },
  friends: { title: 'Your people', eyebrow: 'SOCIAL' },
  chat: { title: 'Community chat', eyebrow: 'CHANNEL' },
};

export function Topbar({ view, title, onMenu, onSearch }: { view: ViewId; title?: string; onMenu: () => void; onSearch: () => void }) {
  const item = labels[view];
  return (
    <header className="topbar">
      <button className="icon-button mobile-only" onClick={onMenu} aria-label="Open navigation"><Icon name="menu" /></button>
      <div><span>{item.eyebrow}</span><h1>{title || item.title}</h1></div>
      <div className="topbar-actions">
        <button className="search-trigger" onClick={onSearch}><Icon name="search" size={17} /><span>Search Nexus</span><kbd>⌘ K</kbd></button>
        <div className="connection-pill"><i /> Live</div>
      </div>
    </header>
  );
}
