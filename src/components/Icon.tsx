import type { SVGProps } from 'react';

type IconName =
  | 'home' | 'voice' | 'music' | 'game' | 'users' | 'hash' | 'mic' | 'micOff'
  | 'headphones' | 'video' | 'screen' | 'phoneOff' | 'play' | 'pause' | 'skip'
  | 'back' | 'send' | 'plus' | 'search' | 'settings' | 'sparkles' | 'chevron'
  | 'copy' | 'check' | 'logout' | 'menu' | 'close' | 'radio' | 'shield' | 'more';

const paths: Record<IconName, React.ReactNode> = {
  home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></>,
  voice: <><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/></>,
  music: <><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></>,
  game: <><path d="M6 11h4M8 9v4"/><path d="M15 12h.01M18 10h.01"/><path d="M17.3 5H6.7a4 4 0 0 0-3.9 3.2l-1 5A4 4 0 0 0 8 17l1.2-1h5.6l1.2 1a4 4 0 0 0 6.2-3.8l-1-5A4 4 0 0 0 17.3 5Z"/></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></>,
  hash: <><path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/></>,
  mic: <><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5"/></>,
  micOff: <><path d="m2 2 20 20"/><path d="M9 9v3a3 3 0 0 0 5.1 2.1M15 9.4V5a3 3 0 0 0-5.6-1.5M17 16.9A7 7 0 0 0 19 12v-2M5 10v2a7 7 0 0 0 10.8 5.9M12 19v3"/></>,
  headphones: <><path d="M4 14a8 8 0 0 1 16 0"/><path d="M18 19v-5h3v5a2 2 0 0 1-2 2h-1ZM6 19v-5H3v5a2 2 0 0 0 2 2h1Z"/></>,
  video: <><rect x="3" y="5" width="14" height="14" rx="2"/><path d="m17 10 4-2v8l-4-2"/></>,
  screen: <><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></>,
  phoneOff: <><path d="m2 2 20 20M8.5 8.5 6.7 6.7a2 2 0 0 0-2.8 0L2.7 7.9c-.5.5-.7 1.2-.4 1.8 2.2 5.3 6.3 9.4 11.6 11.6.6.3 1.3.1 1.8-.4l1.2-1.2a2 2 0 0 0 0-2.8l-2.4-2.4"/><path d="m14.5 5.5 2.8-2.8a2 2 0 0 1 2.8 0l1.2 1.2c.5.5.7 1.2.4 1.8-.5 1.3-1.2 2.5-2 3.6"/></>,
  play: <path d="m8 5 11 7-11 7Z"/>, pause: <><path d="M9 5v14M15 5v14"/></>,
  skip: <><path d="m5 4 10 8-10 8Z"/><path d="M19 5v14"/></>, back: <><path d="m19 20-10-8 10-8Z"/><path d="M5 5v14"/></>,
  send: <><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>, search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  sparkles: <><path d="m12 3-1.2 3.3L7.5 7.5l3.3 1.2L12 12l1.2-3.3 3.3-1.2-3.3-1.2Z"/><path d="m5 14-.8 2.2L2 17l2.2.8L5 20l.8-2.2L8 17l-2.2-.8ZM19 13l-.8 2.2-2.2.8 2.2.8L19 19l.8-2.2L22 16l-2.2-.8Z"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>, copy: <><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>,
  check: <path d="m5 12 4 4L19 6"/>, logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>, close: <><path d="m6 6 12 12M18 6 6 18"/></>,
  radio: <><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19 5a10 10 0 0 1 0 14M5 19A10 10 0 0 1 5 5"/></>,
  shield: <><path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3Z"/><path d="m9 12 2 2 4-4"/></>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
};

export function Icon({ name, size = 20, ...props }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
