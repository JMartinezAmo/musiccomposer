// ============================================
// AudioEngine - Tone.js + smplr Integration
// Music Composer v1.1
// ============================================

import * as Tone from 'tone';
import { Soundfont } from 'smplr';
import type { Track, TrackType } from '../types/composition';

/**
 * General MIDI Program to Instrument Name mapping
 */
const GM_INSTRUMENT_MAP: Record<number, string> = {
  0: 'acoustic_grand_piano',
  1: 'bright_acoustic_piano',
  2: 'electric_grand_piano',
  3: 'honky_tonk_piano',
  4: 'electric_piano_1',
  5: 'electric_piano_2',
  6: 'harpsichord',
  7: 'clavinet',
  24: 'acoustic_guitar_nylon',
  25: 'acoustic_guitar_steel',
  26: 'electric_guitar_jazz',
  27: 'electric_guitar_clean',
  28: 'electric_guitar_muted',
  29: 'overdriven_guitar',
  30: 'distortion_guitar',
  32: 'acoustic_bass',
  33: 'electric_bass_finger',
  34: 'electric_bass_pick',
  35: 'fretless_bass',
  36: 'slap_bass_1',
  40: 'violin',
  41: 'viola',
  42: 'cello',
  43: 'contrabass',
  48: 'string_ensemble_1',
  49: 'string_ensemble_2',
  52: 'choir_aahs',
  56: 'trumpet',
  57: 'trombone',
  60: 'french_horn',
  65: 'alto_sax',
  66: 'tenor_sax',
  73: 'flute',
  80: 'synth_lead_1_square',
  81: 'synth_lead_2_sawtooth',
  88: 'synth_pad_1_new_age',
  89: 'synth_pad_2_warm',
};

/**
 * Default channel assignments by track type
 */
const TRACK_TYPE_CHANNEL_MAP: Record<TrackType, number> = {
  melody: 0,
  chords: 1,
  bass: 2,
  drums: 9, // Standard GM drum channel
  pad: 3,
  arpeggio: 4,
  custom: 5,
};

/**
 * Default program assignments by track type
 */
const TRACK_TYPE_PROGRAM_MAP: Record<TrackType, number> = {
  melody: 0,   // Piano
  chords: 0,   // Piano
  bass: 33,    // Electric Bass Finger
  drums: 0,    // N/A (bank 128)
  pad: 48,     // String Ensemble
  arpeggio: 0, // Piano
  custom: 0,   // Piano
};

/**
 * AudioEngine - Singleton that encapsulates Tone.js and Web Audio
 *
 * CRITICAL: Handle audio latency
 * - Tone.js uses 0.1s lookahead by default
 * - Scheduling must be "ahead of time", not real-time
 */
class AudioEngine {
  private static instance: AudioEngine;
  private context: Tone.BaseContext | null = null;
  private instruments: Map<string, Soundfont> = new Map();
  private scheduledEvents: Map<string, number[]> = new Map(); // trackId -> eventIds
  private isInitialized = false;

  // Position tracking
  private positionCallback: ((beat: number) => void) | null = null;
  private animationFrameId: number | null = null;

  private constructor() {
    // Private constructor for singleton
  }

  static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  /**
   * Initialize audio context (requires user interaction)
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Start Tone.js context
      await Tone.start();
      this.context = Tone.getContext();

      // Configure transport
      Tone.getTransport().bpm.value = 120;
      Tone.getTransport().timeSignature = [4, 4];

      this.isInitialized = true;
      console.log('AudioEngine initialized successfully');
    } catch (error) {
      console.error('Failed to initialize AudioEngine:', error);
      throw error;
    }
  }

  /**
   * Check if engine is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.context?.state === 'running';
  }

  /**
   * Get the raw audio context for smplr
   */
  getRawContext(): AudioContext | null {
    if (!this.context) return null;
    return this.context.rawContext as AudioContext;
  }

  /**
   * Load an instrument from SoundFont
   * Uses smplr instead of soundfont-player (abandoned)
   */
  async loadInstrument(instrumentId: string, program: number): Promise<void> {
    if (this.instruments.has(instrumentId)) return;

    const rawContext = this.getRawContext();
    if (!rawContext) {
      throw new Error('Audio context not initialized');
    }

    const instrumentName = this.programToInstrumentName(program);

    try {
      const soundfont = new Soundfont(rawContext, {
        instrument: instrumentName,
      });

      // Wait for the instrument to load
      await soundfont.load;

      this.instruments.set(instrumentId, soundfont);
      console.log(`Loaded instrument: ${instrumentName} (${instrumentId})`);
    } catch (error) {
      console.error(`Failed to load instrument ${instrumentName}:`, error);
      throw error;
    }
  }

  /**
   * Unload an instrument to free memory
   */
  unloadInstrument(instrumentId: string): void {
    const instrument = this.instruments.get(instrumentId);
    if (instrument) {
      instrument.stop();
      this.instruments.delete(instrumentId);
    }
  }

  /**
   * Schedule notes of a track for playback
   *
   * IMPORTANT: Use Transport.scheduleOnce for sample-accurate precision
   */
  scheduleTrack(track: Track): void {
    // Clear previous events for this track
    this.unscheduleTrack(track.id);

    if (track.isMuted || track.notes.length === 0) return;

    const instrument = this.instruments.get(track.instrument.soundfontId);
    if (!instrument) {
      console.warn(`No instrument loaded for track ${track.id}`);
      return;
    }

    const eventIds: number[] = [];
    const transport = Tone.getTransport();

    for (const note of track.notes) {
      // Skip notes with probability < random (for humanization)
      if (note.probability !== undefined && note.probability < Math.random()) {
        continue;
      }

      // Convert beats to Tone.js time format
      const startTime = `${Math.floor(note.startBeat / 4)}:${note.startBeat % 4}`;
      const durationSecs = (note.durationBeats / Tone.getTransport().bpm.value) * 60;

      // Schedule note-on
      const eventId = transport.schedule((time) => {
        // Apply track volume and pan
        const velocity = (note.velocity / 127) * track.volume;

        instrument.start({
          note: note.pitch,
          velocity,
          time,
          duration: durationSecs,
        });
      }, startTime);

      eventIds.push(eventId);
    }

    this.scheduledEvents.set(track.id, eventIds);
  }

  /**
   * Unschedule all events for a track
   */
  unscheduleTrack(trackId: string): void {
    const eventIds = this.scheduledEvents.get(trackId);
    if (eventIds) {
      const transport = Tone.getTransport();
      eventIds.forEach((id) => transport.clear(id));
      this.scheduledEvents.delete(trackId);
    }
  }

  /**
   * Schedule all tracks from a composition
   */
  scheduleAllTracks(tracks: Track[]): void {
    tracks.forEach((track) => this.scheduleTrack(track));
  }

  /**
   * Preview a single note immediately
   */
  playNotePreview(instrumentId: string, pitch: number, velocity: number = 100, duration: number = 0.5): void {
    const instrument = this.instruments.get(instrumentId);
    if (!instrument) return;

    instrument.start({
      note: pitch,
      velocity: velocity / 127,
      duration,
    });
  }

  /**
   * Stop all playing notes for an instrument
   */
  stopInstrument(instrumentId: string): void {
    const instrument = this.instruments.get(instrumentId);
    if (instrument) {
      instrument.stop();
    }
  }

  /**
   * Stop all instruments
   */
  stopAllInstruments(): void {
    this.instruments.forEach((instrument) => instrument.stop());
  }

  // === Transport Controls ===

  play(): void {
    if (!this.isInitialized) return;
    Tone.getTransport().start();
    this.startPositionTracking();
  }

  pause(): void {
    if (!this.isInitialized) return;
    Tone.getTransport().pause();
    this.stopPositionTracking();
  }

  stop(): void {
    if (!this.isInitialized) return;
    Tone.getTransport().stop();
    Tone.getTransport().position = 0;
    this.stopAllInstruments();
    this.stopPositionTracking();
  }

  seekTo(beat: number): void {
    if (!this.isInitialized) return;
    const bars = Math.floor(beat / 4);
    const beats = beat % 4;
    Tone.getTransport().position = `${bars}:${beats}:0`;
  }

  setTempo(bpm: number, rampTime: number = 0): void {
    if (!this.isInitialized) return;

    const clampedBpm = Math.max(20, Math.min(300, bpm));

    if (rampTime > 0) {
      Tone.getTransport().bpm.rampTo(clampedBpm, rampTime);
    } else {
      Tone.getTransport().bpm.value = clampedBpm;
    }
  }

  getTempo(): number {
    return Tone.getTransport().bpm.value;
  }

  setTimeSignature(numerator: number, denominator: number): void {
    if (!this.isInitialized) return;
    Tone.getTransport().timeSignature = [numerator, denominator];
  }

  /**
   * Set loop region
   */
  setLoop(enabled: boolean, start?: number, end?: number): void {
    const transport = Tone.getTransport();
    transport.loop = enabled;

    if (enabled && start !== undefined && end !== undefined) {
      const startBars = Math.floor(start / 4);
      const startBeats = start % 4;
      const endBars = Math.floor(end / 4);
      const endBeats = end % 4;

      transport.loopStart = `${startBars}:${startBeats}:0`;
      transport.loopEnd = `${endBars}:${endBeats}:0`;
    }
  }

  /**
   * Get current position in beats
   */
  getCurrentBeat(): number {
    const position = Tone.getTransport().position;

    if (typeof position === 'string') {
      const parts = position.split(':').map(Number);
      const bars = parts[0] || 0;
      const beats = parts[1] || 0;
      const sixteenths = parts[2] || 0;
      const [numerator] = Tone.getTransport().timeSignature as number[];
      return bars * numerator + beats + sixteenths / 4;
    }

    return 0;
  }

  /**
   * Get transport state
   */
  getTransportState(): 'started' | 'stopped' | 'paused' {
    return Tone.getTransport().state;
  }

  /**
   * Register callback for position updates
   * Uses requestAnimationFrame for UI sync without blocking audio thread
   */
  onPositionUpdate(callback: (beat: number) => void): () => void {
    this.positionCallback = callback;

    if (Tone.getTransport().state === 'started') {
      this.startPositionTracking();
    }

    return () => {
      this.positionCallback = null;
      this.stopPositionTracking();
    };
  }

  private startPositionTracking(): void {
    if (this.animationFrameId !== null) return;

    const update = () => {
      if (this.positionCallback) {
        this.positionCallback(this.getCurrentBeat());
      }
      this.animationFrameId = requestAnimationFrame(update);
    };

    this.animationFrameId = requestAnimationFrame(update);
  }

  private stopPositionTracking(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  // === Helper Functions ===

  private programToInstrumentName(program: number): string {
    return GM_INSTRUMENT_MAP[program] || 'acoustic_grand_piano';
  }

  /**
   * Get default channel for track type
   */
  static getDefaultChannel(type: TrackType): number {
    return TRACK_TYPE_CHANNEL_MAP[type] || 0;
  }

  /**
   * Get default program for track type
   */
  static getDefaultProgram(type: TrackType): number {
    return TRACK_TYPE_PROGRAM_MAP[type] || 0;
  }

  /**
   * Convert MIDI note number to note name
   */
  static midiToNoteName(midi: number): string {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midi / 12) - 1;
    const note = noteNames[midi % 12];
    return `${note}${octave}`;
  }

  /**
   * Convert note name to MIDI note number
   */
  static noteNameToMidi(noteName: string): number {
    const noteMap: Record<string, number> = {
      'C': 0, 'C#': 1, 'Db': 1,
      'D': 2, 'D#': 3, 'Eb': 3,
      'E': 4, 'Fb': 4,
      'F': 5, 'E#': 5, 'F#': 6, 'Gb': 6,
      'G': 7, 'G#': 8, 'Ab': 8,
      'A': 9, 'A#': 10, 'Bb': 10,
      'B': 11, 'Cb': 11,
    };

    const match = noteName.match(/^([A-Ga-g][#b]?)(-?\d+)$/);
    if (!match) return 60; // Default to middle C

    const note = match[1].charAt(0).toUpperCase() + match[1].slice(1);
    const octave = parseInt(match[2], 10);

    return (octave + 1) * 12 + (noteMap[note] || 0);
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.stop();
    this.stopPositionTracking();

    // Unload all instruments
    this.instruments.forEach((instrument) => instrument.stop());
    this.instruments.clear();

    // Clear all scheduled events
    this.scheduledEvents.clear();

    // Reset state
    this.isInitialized = false;
  }
}

// Export singleton instance
export const audioEngine = AudioEngine.getInstance();

// Export class for testing
export { AudioEngine };
