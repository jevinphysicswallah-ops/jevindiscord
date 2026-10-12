import { useEffect, useRef } from 'react';
import type { MusicRoom, Track } from '../types';

const FALLBACK_CHORDS = [
  [220, 261.63, 329.63, 493.88],
  [174.61, 261.63, 329.63, 392],
  [196, 246.94, 293.66, 440],
];

export function useLoungeSynth(room: MusicRoom | null, track: Track | undefined, enabled: boolean, ducking: boolean) {
  const gainRef = useRef<GainNode | null>(null);
  const duckingRef = useRef(ducking);
  duckingRef.current = ducking;

  useEffect(() => {
    const gain = gainRef.current;
    if (!gain) return;
    gain.gain.setTargetAtTime(ducking ? 0.014 : 0.055, gain.context.currentTime, 0.08);
  }, [ducking]);

  useEffect(() => {
    if (!enabled || !room || !track || !room.isPlaying || track.spotifyUrl) return;
    const context = new AudioContext();
    const master = context.createGain();
    const warmth = context.createBiquadFilter();
    const compressor = context.createDynamicsCompressor();
    warmth.type = 'lowpass';
    warmth.frequency.value = 2_800;
    master.gain.value = duckingRef.current ? 0.014 : 0.055;
    master.connect(warmth).connect(compressor).connect(context.destination);
    gainRef.current = master;
    void context.resume();

    const chords = track.chords?.length ? track.chords : FALLBACK_CHORDS;
    const chordMs = Math.max(1_700, Math.min(3_200, 240_000 / (track.bpm || 82)));
    const roomElapsedMs = () => Math.max(0, Date.now() - room.startedAt);

    const playChord = () => {
      const chordIndex = Math.floor(roomElapsedMs() / chordMs) % chords.length;
      const now = context.currentTime;
      for (const [index, frequency] of chords[chordIndex].entries()) {
        const oscillator = context.createOscillator();
        const voice = context.createGain();
        oscillator.type = index % 2 ? 'triangle' : 'sine';
        oscillator.frequency.value = frequency / (index === chords[chordIndex].length - 1 ? 2 : 1);
        oscillator.detune.value = index * 2 - 3;
        voice.gain.setValueAtTime(0, now);
        voice.gain.linearRampToValueAtTime(0.24 / chords[chordIndex].length, now + 0.18);
        voice.gain.setValueAtTime(0.2 / chords[chordIndex].length, now + chordMs / 1000 - 0.35);
        voice.gain.linearRampToValueAtTime(0, now + chordMs / 1000);
        oscillator.connect(voice).connect(master);
        oscillator.start(now);
        oscillator.stop(now + chordMs / 1000 + 0.05);
      }
    };

    playChord();
    const timer = window.setInterval(playChord, chordMs);
    return () => {
      window.clearInterval(timer);
      gainRef.current = null;
      void context.close();
    };
  }, [enabled, room, track]);
}
