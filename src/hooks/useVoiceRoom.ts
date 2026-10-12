import { useCallback, useEffect, useRef, useState } from 'react';
import type { User, VoiceParticipant } from '../types';

interface SignalPayload {
  fromUserId: string;
  signal: {
    channelId?: string;
    description?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
  };
}

interface VoiceRoomOptions {
  user: User;
  send: (event: string, payload: unknown) => boolean;
  subscribe: (event: string, listener: (payload: unknown) => void) => () => void;
}

const rtcConfig: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
};

export function useVoiceRoom({ user, send, subscribe }: VoiceRoomOptions) {
  const [channelId, setChannelId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const pendingCandidatesRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenAudioTracksRef = useRef<MediaStreamTrack[]>([]);
  const deafenedRef = useRef(false);

  useEffect(() => {
    channelRef.current = channelId;
  }, [channelId]);

  useEffect(() => {
    deafenedRef.current = deafened;
  }, [deafened]);

  const closePeer = useCallback((peerId: string) => {
    peersRef.current.get(peerId)?.close();
    peersRef.current.delete(peerId);
    setRemoteStreams((current) => {
      const next = { ...current };
      delete next[peerId];
      return next;
    });
  }, []);

  const createPeer = useCallback((peerId: string) => {
    const existing = peersRef.current.get(peerId);
    if (existing) return existing;
    const peer = new RTCPeerConnection(rtcConfig);
    peersRef.current.set(peerId, peer);
    streamRef.current?.getTracks().forEach((track) => peer.addTrack(track, streamRef.current!));

    peer.onicecandidate = ({ candidate }) => {
      if (candidate) send('webrtc_signal', { targetUserId: peerId, signal: { channelId: channelRef.current, candidate } });
    };
    peer.ontrack = ({ streams }) => {
      const [stream] = streams;
      if (stream) {
        stream.getAudioTracks().forEach((track) => { track.enabled = !deafenedRef.current; });
        setRemoteStreams((current) => ({ ...current, [peerId]: stream }));
      }
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'failed' || peer.connectionState === 'closed') closePeer(peerId);
    };
    return peer;
  }, [closePeer, send]);

  const makeOffer = useCallback(async (peerId: string) => {
    const peer = createPeer(peerId);
    if (peer.signalingState !== 'stable') return;
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    send('webrtc_signal', { targetUserId: peerId, signal: { channelId: channelRef.current, description: peer.localDescription } });
  }, [createPeer, send]);

  useEffect(() => subscribe('webrtc_signal', (raw) => {
    const { fromUserId, signal } = raw as SignalPayload;
    if (!fromUserId || !signal || signal.channelId !== channelRef.current) return;
    void (async () => {
      const peer = createPeer(fromUserId);
      try {
        if (signal.description) {
          await peer.setRemoteDescription(signal.description);
          const queued = pendingCandidatesRef.current.get(fromUserId) ?? [];
          for (const candidate of queued) await peer.addIceCandidate(candidate);
          pendingCandidatesRef.current.delete(fromUserId);
          if (signal.description.type === 'offer') {
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            send('webrtc_signal', { targetUserId: fromUserId, signal: { channelId: channelRef.current, description: peer.localDescription } });
          }
        } else if (signal.candidate) {
          if (peer.remoteDescription) await peer.addIceCandidate(signal.candidate);
          else pendingCandidatesRef.current.set(fromUserId, [...(pendingCandidatesRef.current.get(fromUserId) ?? []), signal.candidate]);
        }
      } catch (reason) {
        console.warn('WebRTC negotiation failed', reason);
      }
    })();
  }), [createPeer, send, subscribe]);

  useEffect(() => subscribe('voice_update', (raw) => {
    const update = raw as { channelId: string; participants: VoiceParticipant[] };
    if (update.channelId !== channelRef.current) return;
    setParticipants(update.participants);
    const liveIds = new Set(update.participants.map((participant) => participant.userId));
    peersRef.current.forEach((_peer, peerId) => {
      if (!liveIds.has(peerId)) closePeer(peerId);
    });
    update.participants.forEach((participant) => {
      if (participant.userId !== user.id && user.id.localeCompare(participant.userId) < 0) void makeOffer(participant.userId);
    });
  }), [closePeer, makeOffer, subscribe, user.id]);

  useEffect(() => subscribe('voice_speaking', (raw) => {
    const update = raw as { channelId: string; userId: string; isSpeaking: boolean };
    if (update.channelId !== channelRef.current) return;
    setParticipants((current) => current.map((participant) => participant.userId === update.userId
      ? { ...participant, isSpeaking: update.isSpeaking }
      : participant));
  }), [subscribe]);

  useEffect(() => {
    if (!localStream || !channelId) return;
    const context = new AudioContext();
    const source = context.createMediaStreamSource(localStream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = .72;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    let frame = 0;
    let speaking = false;
    let lastVoiceAt = 0;
    const detect = () => {
      analyser.getByteTimeDomainData(samples);
      let energy = 0;
      for (const sample of samples) {
        const centered = (sample - 128) / 128;
        energy += centered * centered;
      }
      const rms = Math.sqrt(energy / samples.length);
      if (rms > .035 && !muted) lastVoiceAt = performance.now();
      const next = !muted && performance.now() - lastVoiceAt < 360;
      if (next !== speaking) {
        speaking = next;
        setLocalSpeaking(next);
        send('voice_speaking', { channelId, isSpeaking: next });
      }
      frame = requestAnimationFrame(detect);
    };
    detect();
    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      void context.close();
      setLocalSpeaking(false);
    };
  }, [channelId, localStream, muted, send]);

  const join = useCallback(async (nextChannelId: string) => {
    setError(null);
    try {
      if (channelRef.current && channelRef.current !== nextChannelId) {
        send('voice_leave', { channelId: channelRef.current });
        streamRef.current?.getTracks().forEach((track) => track.stop());
        sourceStreamRef.current?.getTracks().forEach((track) => track.stop());
        if (audioContextRef.current) await audioContextRef.current.close();
        audioContextRef.current = null;
        peersRef.current.forEach((peer) => peer.close());
        peersRef.current.clear();
        cameraTrackRef.current = null;
        screenTrackRef.current = null;
        screenAudioTracksRef.current = [];
        setCameraOn(false);
        setSharingScreen(false);
      }
      const sourceStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      sourceStreamRef.current = sourceStream;
      const context = new AudioContext();
      await context.resume();
      const source = context.createMediaStreamSource(sourceStream);
      const highpass = context.createBiquadFilter();
      const lowpass = context.createBiquadFilter();
      const presence = context.createBiquadFilter();
      const output = context.createMediaStreamDestination();
      highpass.type = 'highpass'; highpass.frequency.value = 85;
      lowpass.type = 'lowpass'; lowpass.frequency.value = 7_500;
      presence.type = 'peaking'; presence.frequency.value = 2_000; presence.Q.value = 1.1; presence.gain.value = 2.5;
      source.connect(highpass).connect(lowpass).connect(presence).connect(output);
      const stream = new MediaStream(output.stream.getAudioTracks());
      audioContextRef.current = context;
      streamRef.current = stream;
      setLocalStream(stream);
      channelRef.current = nextChannelId;
      setChannelId(nextChannelId);
      setMuted(false);
      send('voice_state', { channelId: nextChannelId, isMuted: false, isDeafened: false, isCameraOn: false, isScreenSharing: false });
    } catch {
      sourceStreamRef.current?.getTracks().forEach((track) => track.stop());
      sourceStreamRef.current = null;
      setError('Microphone access was blocked. Allow microphone permission, then try again.');
    }
  }, [send]);

  const leave = useCallback(() => {
    if (channelRef.current) send('voice_leave', { channelId: channelRef.current });
    streamRef.current?.getTracks().forEach((track) => track.stop());
    sourceStreamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    sourceStreamRef.current = null;
    if (audioContextRef.current) void audioContextRef.current.close();
    audioContextRef.current = null;
    peersRef.current.forEach((peer) => peer.close());
    peersRef.current.clear();
    pendingCandidatesRef.current.clear();
    cameraTrackRef.current = null;
    screenTrackRef.current = null;
    screenAudioTracksRef.current = [];
    setLocalStream(null);
    setRemoteStreams({});
    setParticipants([]);
    setChannelId(null);
    channelRef.current = null;
    setCameraOn(false);
    setSharingScreen(false);
  }, [send]);

  useEffect(() => leave, [leave]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
    send('voice_state', { channelId: channelRef.current, isMuted: next });
  }, [muted, send]);

  const toggleDeafen = useCallback(() => {
    const next = !deafened;
    Object.values(remoteStreams).forEach((stream) => stream.getAudioTracks().forEach((track) => { track.enabled = !next; }));
    setDeafened(next);
    send('voice_state', { channelId: channelRef.current, isDeafened: next });
  }, [deafened, remoteStreams, send]);

  const toggleCamera = useCallback(async () => {
    if (!streamRef.current || !channelRef.current) return;
    if (cameraOn) {
      cameraTrackRef.current?.stop();
      if (cameraTrackRef.current && !sharingScreen) streamRef.current.removeTrack(cameraTrackRef.current);
      cameraTrackRef.current = null;
      if (!sharingScreen) peersRef.current.forEach((peer) => peer.getSenders().filter((sender) => sender.track?.kind === 'video').forEach((sender) => { void sender.replaceTrack(null); }));
      setCameraOn(false);
      send('voice_state', { channelId: channelRef.current, isCameraOn: false });
      peersRef.current.forEach((_peer, peerId) => void makeOffer(peerId));
      return;
    }
    try {
      const camera = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
      const [track] = camera.getVideoTracks();
      cameraTrackRef.current = track;
      if (!sharingScreen) {
        streamRef.current.addTrack(track);
        peersRef.current.forEach((peer) => {
          const sender = peer.getSenders().find((candidate) => candidate.track?.kind === 'video');
          if (sender) void sender.replaceTrack(track);
          else peer.addTrack(track, streamRef.current!);
        });
      }
      setCameraOn(true);
      send('voice_state', { channelId: channelRef.current, isCameraOn: true });
      peersRef.current.forEach((_peer, peerId) => void makeOffer(peerId));
    } catch {
      setError('Camera access was blocked or no camera is available.');
    }
  }, [cameraOn, makeOffer, send, sharingScreen]);

  const toggleScreen = useCallback(async () => {
    if (!streamRef.current || !channelRef.current) return;
    if (sharingScreen) {
      const screenTrack = screenTrackRef.current;
      if (screenTrack) streamRef.current.removeTrack(screenTrack);
      if (screenTrack) screenTrack.onended = null;
      screenTrack?.stop();
      for (const audioTrack of screenAudioTracksRef.current) {
        streamRef.current.removeTrack(audioTrack);
        peersRef.current.forEach((peer) => {
          const sender = peer.getSenders().find((candidate) => candidate.track?.id === audioTrack.id);
          if (sender) void sender.replaceTrack(null);
        });
        audioTrack.stop();
      }
      screenAudioTracksRef.current = [];
      screenTrackRef.current = null;
      const cameraTrack = cameraTrackRef.current;
      if (cameraTrack?.readyState === 'live') streamRef.current.addTrack(cameraTrack);
      peersRef.current.forEach((peer) => {
        const sender = peer.getSenders().find((candidate) => candidate.track?.kind === 'video');
        if (sender) void sender.replaceTrack(cameraTrack?.readyState === 'live' ? cameraTrack : null);
      });
      setSharingScreen(false);
      send('voice_state', { channelId: channelRef.current, isScreenSharing: false });
      return;
    }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const [track] = display.getVideoTracks();
      const displayAudioTracks = display.getAudioTracks();
      screenTrackRef.current = track;
      screenAudioTracksRef.current = displayAudioTracks;
      const currentVideo = streamRef.current.getVideoTracks()[0];
      if (currentVideo) streamRef.current.removeTrack(currentVideo);
      streamRef.current.addTrack(track);
      displayAudioTracks.forEach((audioTrack) => streamRef.current?.addTrack(audioTrack));
      const replace = [...peersRef.current.values()].map(async (peer) => {
        const sender = peer.getSenders().find((candidate) => candidate.track?.kind === 'video');
        if (sender) await sender.replaceTrack(track);
        else peer.addTrack(track, display);
        displayAudioTracks.forEach((audioTrack) => peer.addTrack(audioTrack, display));
      });
      await Promise.all(replace);
      track.onended = () => {
        screenTrackRef.current = null;
        streamRef.current?.removeTrack(track);
        for (const audioTrack of screenAudioTracksRef.current) {
          streamRef.current?.removeTrack(audioTrack);
          peersRef.current.forEach((peer) => {
            const sender = peer.getSenders().find((candidate) => candidate.track?.id === audioTrack.id);
            if (sender) void sender.replaceTrack(null);
          });
          audioTrack.stop();
        }
        screenAudioTracksRef.current = [];
        const cameraTrack = cameraTrackRef.current;
        if (cameraTrack?.readyState === 'live') streamRef.current?.addTrack(cameraTrack);
        peersRef.current.forEach((peer) => {
          const sender = peer.getSenders().find((candidate) => candidate.track?.kind === 'video');
          if (sender) void sender.replaceTrack(cameraTrack?.readyState === 'live' ? cameraTrack : null);
        });
        setSharingScreen(false);
        send('voice_state', { channelId: channelRef.current, isScreenSharing: false });
      };
      setSharingScreen(true);
      send('voice_state', { channelId: channelRef.current, isScreenSharing: true });
      peersRef.current.forEach((_peer, peerId) => void makeOffer(peerId));
    } catch {
      setError('Screen sharing was cancelled or unavailable.');
    }
  }, [makeOffer, send, sharingScreen]);

  return {
    channelId, participants, localStream, remoteStreams, muted, deafened, cameraOn, sharingScreen, localSpeaking, error,
    join, leave, toggleMute, toggleDeafen, toggleCamera, toggleScreen,
  };
}
