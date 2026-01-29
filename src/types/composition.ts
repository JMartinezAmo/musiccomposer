// ============================================
// TYPES.BASIS - Modelo de Datos Persistido
// Music Composer - Composition Types v1.1
// ============================================

/**
 * Main composition interface - the canonical format for persistent storage
 * Note: undo/snapshots are NOT stored here, they live in the store in memory
 */
export interface Composition {
  id: string; // UUID v4
  version: '1.1';
  metadata: CompositionMetadata;
  global: GlobalSettings;
  structure: ArrangementBlock[];
  tracks: Track[];
  annotations: CreativeAnnotation[];
}

export interface CompositionMetadata {
  title: string;
  author: string;
  createdAt: string; // ISO 8601
  modifiedAt: string;
  tags: string[];
  bpmHistory?: number[]; // For future analytics
}

export interface GlobalSettings {
  tempo: number; // BPM (20-300)
  timeSignature: TimeSignature;
  key: MusicalKey;
  swing?: number; // 0-1, for grooves
}

export interface TimeSignature {
  numerator: number; // 1-16
  denominator: 2 | 4 | 8 | 16;
}

export interface MusicalKey {
  root: NoteName;
  mode: MusicalMode;
}

export type NoteName =
  | 'C'
  | 'C#'
  | 'Db'
  | 'D'
  | 'D#'
  | 'Eb'
  | 'E'
  | 'F'
  | 'F#'
  | 'Gb'
  | 'G'
  | 'G#'
  | 'Ab'
  | 'A'
  | 'A#'
  | 'Bb'
  | 'B';

export type MusicalMode =
  | 'major'
  | 'minor'
  | 'dorian'
  | 'mixolydian'
  | 'phrygian'
  | 'lydian'
  | 'locrian';

export interface ArrangementBlock {
  id: string;
  type: BlockType;
  name: string;
  startBeat: number; // in quarter notes from start
  durationBeats: number;
  repeat?: number; // 1 = no repeat, 2+ = repetitions
  localKey?: MusicalKey; // null = inherit global
  localTempo?: number; // null = inherit global
}

export type BlockType =
  | 'intro'
  | 'verse'
  | 'pre-chorus'
  | 'chorus'
  | 'bridge'
  | 'breakdown'
  | 'outro'
  | 'custom';

export interface Track {
  id: string;
  name: string;
  type: TrackType;
  channel: number; // 0-15 MIDI channel (9 reserved for drums)
  instrument: InstrumentConfig;
  isMuted: boolean;
  isSolo: boolean;
  volume: number; // 0-1 (linear, convert to dB in engine)
  pan: number; // -1 (L) to 1 (R)
  notes: Note[];
  chordTrack?: ChordEvent[]; // Only for "chords" type tracks
}

export type TrackType =
  | 'melody'
  | 'chords'
  | 'bass'
  | 'drums'
  | 'pad'
  | 'arpeggio'
  | 'custom';

export interface InstrumentConfig {
  soundfontId: string; // Identifier of loaded SF2/SF3
  program: number; // General MIDI program (0-127)
  bank: number; // 0 by default, 128 for drums
}

export interface Note {
  id: string;
  pitch: number; // MIDI note number (0-127)
  velocity: number; // 1-127 (0 = note off)
  startBeat: number; // Position in beats (float, precision 0.001)
  durationBeats: number; // Duration in beats (float, min 0.01)
  probability?: number; // 0.01-1.0 for humanization (default 1.0)
}

export interface ChordEvent {
  id: string;
  startBeat: number;
  durationBeats: number;
  symbol: string; // Tonal notation: "Gm7", "Bbmaj7", "D7/F#"
  voicing?: number[]; // Specific MIDI pitches (optional, for inversions)
  function?: ChordFunction;
}

export type ChordFunction =
  | 'tonic'
  | 'subdominant'
  | 'dominant'
  | 'secondary-dominant'
  | 'borrowed'
  | 'passing'
  | 'pedal';

export interface CreativeAnnotation {
  id: string;
  targetId: string;
  targetType: 'track' | 'block' | 'note' | 'chord' | 'composition';
  author: 'user' | 'ai';
  timestamp: string; // ISO 8601
  content: string; // Max 500 characters
  tags: AnnotationTag[];
}

export type AnnotationTag =
  | 'harmony'
  | 'melody'
  | 'rhythm'
  | 'tension'
  | 'resolution'
  | 'modulation'
  | 'texture'
  | 'dynamics'
  | 'custom';
