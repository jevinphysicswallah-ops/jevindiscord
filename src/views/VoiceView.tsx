import { useEffect, useRef } from 'react';
import { Icon } from '../components/Icon';
import type { User, VoiceParticipant } from '../types';

function StreamTile({ stream, label, self = false, active = false }: { stream: MediaStream | null; label: string; self?: boolean; active?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  const hasVideo = !!stream?.getVideoTracks().length;
  return (
    <article className={`video-tile ${active ? 'speaking' : ''}`}>
      {hasVideo ? <video ref={ref} autoPlay playsInline muted={self} /> : <div className="tile-avatar">{label.slice(0, 1).toUpperCase()}</div>}
      <div className="tile-meta"><span>{label}{self ? ' (you)' : ''}</span>{active && <i className="speaking-bars"><b/><b/><b/></i>}</div>
      {!self && <audio ref={(element) => { if (element && element.srcObject !== stream) element.srcObject = stream; }} autoPlay />}
    </article>
  );
}

interface VoiceViewProps {
  user: User;
  target: { id: string; name: string; context: string };
  voice: {
    channelId: string | null;
    participants: VoiceParticipant[];
    localStream: MediaStream | null;
    remoteStreams: Record<string, MediaStream>;
    muted: boolean;
    deafened: boolean;
    cameraOn: boolean;
    sharingScreen: boolean;
    localSpeaking: boolean;
    error: string | null;
    join: (id: string) => Promise<void>;
    leave: () => void;
    toggleMute: () => void;
    toggleDeafen: () => void;
    toggleCamera: () => Promise<void>;
    toggleScreen: () => Promise<void>;
  };
}

export function VoiceView({ user, voice, target }: VoiceViewProps) {
  const joined = voice.channelId === target.id;
  const others = voice.participants.filter((participant) => participant.userId !== user.id);
  return (
    <div className="view voice-view">
      <section className="voice-stage panel">
        <div className="voice-stage-head">
          <div><span className="eyebrow"><i className="live-pip" /> {joined ? 'YOU’RE IN THE ROOM' : `${target.context.toUpperCase()} · OPEN`}</span><h2>{target.name}</h2><p>{joined ? `${voice.participants.length || 1} participant${voice.participants.length === 1 ? '' : 's'} connected` : 'A comfortable room for voice, video, and whatever’s on your screen.'}</p></div>
          <div className="latency-chip"><i /> P2P audio</div>
        </div>

        {!joined ? (
          <div className="voice-welcome">
            <div className="voice-rings"><span><Icon name="voice" size={34} /></span><i/><i/><i/></div>
            <h3>Your mic stays yours until you join.</h3>
            <p>Nexus will ask for microphone access. Camera and screen sharing always stay off until you choose them.</p>
            {voice.error && <div className="form-error">{voice.error}</div>}
            <button className="primary-button" onClick={() => void voice.join(target.id)}><Icon name="voice" size={18} /> Join {target.name}</button>
          </div>
        ) : (
          <>
            <div className="video-grid">
              <StreamTile stream={voice.localStream} label={user.displayName} self active={voice.localSpeaking} />
              {others.map((participant) => <StreamTile key={participant.userId} stream={voice.remoteStreams[participant.userId] ?? null} label={participant.displayName} active={participant.isSpeaking} />)}
              {!others.length && <div className="invite-tile"><span><Icon name="plus" size={25} /></span><h3>Room for more</h3><p>Share Nexus with a friend and they’ll appear here.</p></div>}
            </div>
            {voice.error && <div className="form-error stage-error">{voice.error}</div>}
            <div className="call-controls" aria-label="Call controls">
              <button className={voice.muted ? 'danger' : ''} onClick={voice.toggleMute}><Icon name={voice.muted ? 'micOff' : 'mic'} /><span>{voice.muted ? 'Unmute' : 'Mute'}</span></button>
              <button className={voice.deafened ? 'active' : ''} onClick={voice.toggleDeafen}><Icon name="headphones" /><span>{voice.deafened ? 'Undeafen' : 'Deafen'}</span></button>
              <button className={voice.cameraOn ? 'active' : ''} onClick={() => void voice.toggleCamera()}><Icon name="video" /><span>Camera</span></button>
              <button className={voice.sharingScreen ? 'active' : ''} onClick={() => void voice.toggleScreen()}><Icon name="screen" /><span>Share</span></button>
              <button className="hangup" onClick={voice.leave}><Icon name="phoneOff" /><span>Leave</span></button>
            </div>
          </>
        )}
      </section>

      <aside className="voice-side panel">
        <span className="eyebrow">ROOM NOTES</span><h3>Designed for game night</h3>
        <ul className="feature-list">
          <li><span><Icon name="mic" size={17} /></span><div><strong>Voice cleanup</strong><p>Echo cancellation, noise suppression, and auto gain are requested from your browser.</p></div></li>
          <li><span><Icon name="screen" size={17} /></span><div><strong>One-click sharing</strong><p>Share a window, a tab, or your screen. You choose what people can see.</p></div></li>
          <li><span><Icon name="shield" size={17} /></span><div><strong>Direct when possible</strong><p>Media travels peer-to-peer. A TURN relay is still recommended for production networks.</p></div></li>
        </ul>
        <div className="privacy-note"><Icon name="shield" size={17}/><span><strong>Privacy check</strong>Your mic and camera controls reflect the actual browser tracks.</span></div>
      </aside>
    </div>
  );
}
