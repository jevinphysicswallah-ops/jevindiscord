import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { useLoungeSynth } from '../hooks/useLoungeSynth';
import { formatDuration, spotifyEmbedFromInput } from '../lib/spotify';
import type { MusicRoom, Track } from '../types';

interface MusicViewProps {
  room: MusicRoom | null;
  sendAction: (action: string, data?: unknown) => void;
  ducking?: boolean;
}

export function MusicView({ room, sendAction, ducking = false }: MusicViewProps) {
  const [input, setInput] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [localSound, setLocalSound] = useState(false);
  const track = room?.currentTrack ?? room?.queue[room.currentTrackIndex ?? 0];
  useLoungeSynth(room, track, localSound, ducking);

  useEffect(() => {
    if (!room || !track) return;
    const update = () => {
      const base = room.isPlaying ? Date.now() - room.startedAt : room.pauseOffset;
      setElapsed(Math.max(0, Math.min(track.duration, base / 1000)));
    };
    update();
    const timer = window.setInterval(update, 500);
    return () => window.clearInterval(timer);
  }, [room, track]);

  const progress = useMemo(() => track ? Math.min(100, (elapsed / track.duration) * 100) : 0, [elapsed, track]);

  function shareSpotify(event: FormEvent) {
    event.preventDefault();
    const parsed = spotifyEmbedFromInput(input);
    if (!parsed) return;
    sendAction('set_spotify_embed', {
      spotifyEmbed: parsed.embed,
      track: { title: parsed.label, artist: 'Spotify', spotifyUrl: parsed.canonical, duration: 210 },
    });
    setInput('');
  }

  if (!room || !track) return <div className="view"><div className="panel loading-panel"><span className="button-spinner" /> Loading the lounge…</div></div>;

  return (
    <div className="view music-view">
      <section className="player-card">
        <div className="player-ambient" style={{ backgroundImage: track.artwork ? `url(${track.artwork})` : undefined }} />
        <div className="player-main">
          <div className="album-art" style={{ backgroundImage: track.artwork ? `url(${track.artwork})` : undefined }}>
            {!track.artwork && <Icon name="music" size={56}/>}<div className="vinyl-ridge" />
          </div>
          <div className="track-info">
            <span className="eyebrow light"><i className="live-pip" /> PLAYING FOR THE ROOM</span>
            <h2>{track.title}</h2><p>{track.artist}</p>
            <div className="progress-wrap">
              <button className="progress-track" aria-label="Seek track" onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                sendAction('seek', { seconds: ((event.clientX - rect.left) / rect.width) * track.duration });
              }}><i style={{ width: `${progress}%` }}><b /></i></button>
              <div><span>{formatDuration(elapsed)}</span><span>-{formatDuration(Math.max(0, track.duration - elapsed))}</span></div>
            </div>
            <div className="transport-controls">
              <button onClick={() => sendAction('previous')} aria-label="Previous track"><Icon name="back" /></button>
              <button className="main-play" onClick={() => sendAction(room.isPlaying ? 'pause' : 'play')} aria-label={room.isPlaying ? 'Pause' : 'Play'}><Icon name={room.isPlaying ? 'pause' : 'play'} size={25}/></button>
              <button onClick={() => sendAction('skip')} aria-label="Next track"><Icon name="skip" /></button>
            </div>
          </div>
        </div>
        <div className="listener-strip"><div className="avatar-stack">{room.listeners.slice(0,4).map((person, index) => <img key={person.userId} src={person.avatar} alt="" style={{ '--avatar-index': index } as React.CSSProperties}/>)}</div><span>{room.listeners.length ? `${room.listeners.length} listening now` : 'Be the first listener'}</span>{track.spotifyUrl ? <span className="device-audio-note">Use the Spotify player below</span> : <button className={`local-sound-toggle ${localSound ? 'active' : ''}`} onClick={() => setLocalSound((value) => !value)}><Icon name="headphones" size={15}/>{localSound ? (ducking ? 'Ducked for voice' : 'Sound on') : 'Listen here'}</button>}<i className="equalizer"><b/><b/><b/><b/></i></div>
      </section>

      <div className="music-columns">
        <section className="panel queue-panel">
          <div className="panel-heading"><div><span className="eyebrow">UP NEXT</span><h2>Room queue</h2></div><span className="count-chip">{room.queue.length} tracks</span></div>
          <div className="queue-list">
            {room.queue.map((item: Track, index) => (
              <button className={index === room.currentTrackIndex ? 'active' : ''} key={item.id} onClick={() => sendAction('select_track', { index })}>
                <span className="queue-index">{index === room.currentTrackIndex ? <i className="equalizer"><b/><b/><b/></i> : String(index + 1).padStart(2, '0')}</span>
                <span className="queue-art" style={{ backgroundImage: item.artwork ? `url(${item.artwork})` : undefined }}><Icon name="music" size={18}/></span>
                <span className="queue-copy"><strong>{item.title}</strong><small>{item.artist}{item.suggestedBy ? ` · added by ${item.suggestedBy}` : ''}</small></span>
                <time>{formatDuration(item.duration)}</time><Icon name="more" size={18}/>
              </button>
            ))}
          </div>
        </section>

        <aside className="panel spotify-panel">
          <div className="spotify-title"><span className="spotify-mark">◉</span><div><span className="eyebrow">SPOTIFY</span><h2>Share a listening link</h2></div></div>
          <p>Paste a Spotify track, album, or playlist. Nexus synchronizes the room choice; playback still comes from Spotify on each listener’s device.</p>
          <form onSubmit={shareSpotify} className="spotify-form"><Icon name="search" size={17}/><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Spotify link or search" aria-label="Spotify link or search"/><button type="submit"><Icon name="send" size={17}/></button></form>
          {room.spotifyEmbed ? <div className="spotify-frame"><iframe src={room.spotifyEmbed} title="Shared Spotify player" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"/><button className="text-button" onClick={() => sendAction('set_spotify_embed', { spotifyEmbed: null })}>Remove shared player</button></div> : <div className="spotify-empty"><div><Icon name="music" size={25}/></div><strong>No Spotify link shared</strong><span>The room queue above remains available.</span></div>}
          <div className="legal-note"><Icon name="shield" size={16}/><span>Each listener uses Spotify under Spotify’s own terms. Nexus does not capture or rebroadcast protected audio.</span></div>
        </aside>
      </div>
    </div>
  );
}
