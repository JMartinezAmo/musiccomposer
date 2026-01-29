// ============================================
// Data Validation Schemas (Zod)
// Music Composer v1.1
// ============================================

import { z } from 'zod';

// ============================================
// Resource Limits
// ============================================

export const RESOURCE_LIMITS = {
  MAX_TRACKS: 16,
  MAX_NOTES_PER_TRACK: 10000,
  MAX_COMPOSITION_DURATION_BEATS: 10000, // ~40 min at 120 BPM
  MAX_SNAPSHOTS: 20,
  MAX_UNDO_STACK: 100,
  MAX_ANNOTATION_LENGTH: 500,
  MAX_TAGS: 20,
  MAX_TAG_LENGTH: 50,
  MIN_TEMPO: 20,
  MAX_TEMPO: 300,
} as const;

// ============================================
// Base Schemas
// ============================================

export const NoteNameSchema = z.enum([
  'C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F',
  'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B',
]);

export const MusicalModeSchema = z.enum([
  'major', 'minor', 'dorian', 'mixolydian',
  'phrygian', 'lydian', 'locrian',
]);

export const TrackTypeSchema = z.enum([
  'melody', 'chords', 'bass', 'drums', 'pad', 'arpeggio', 'custom',
]);

export const BlockTypeSchema = z.enum([
  'intro', 'verse', 'pre-chorus', 'chorus',
  'bridge', 'breakdown', 'outro', 'custom',
]);

export const ChordFunctionSchema = z.enum([
  'tonic', 'subdominant', 'dominant',
  'secondary-dominant', 'borrowed', 'passing', 'pedal',
]);

export const AnnotationTagSchema = z.enum([
  'harmony', 'melody', 'rhythm', 'tension',
  'resolution', 'modulation', 'texture', 'dynamics', 'custom',
]);

// ============================================
// Note Schema
// ============================================

export const NoteSchema = z.object({
  id: z.string().uuid(),
  pitch: z.number().int().min(0).max(127),
  velocity: z.number().int().min(1).max(127),
  startBeat: z.number().min(0),
  durationBeats: z.number().min(0.01),
  probability: z.number().min(0.01).max(1.0).optional(),
});

export type ValidatedNote = z.infer<typeof NoteSchema>;

// ============================================
// Chord Event Schema
// ============================================

export const ChordEventSchema = z.object({
  id: z.string().uuid(),
  startBeat: z.number().min(0),
  durationBeats: z.number().min(0.01),
  symbol: z.string().min(1).max(20),
  voicing: z.array(z.number().int().min(0).max(127)).optional(),
  function: ChordFunctionSchema.optional(),
});

// ============================================
// Instrument Config Schema
// ============================================

export const InstrumentConfigSchema = z.object({
  soundfontId: z.string().min(1),
  program: z.number().int().min(0).max(127),
  bank: z.number().int().min(0),
});

// ============================================
// Track Schema
// ============================================

export const TrackSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  type: TrackTypeSchema,
  channel: z.number().int().min(0).max(15),
  instrument: InstrumentConfigSchema,
  isMuted: z.boolean(),
  isSolo: z.boolean(),
  volume: z.number().min(0).max(1),
  pan: z.number().min(-1).max(1),
  notes: z.array(NoteSchema).max(RESOURCE_LIMITS.MAX_NOTES_PER_TRACK),
  chordTrack: z.array(ChordEventSchema).optional(),
});

export type ValidatedTrack = z.infer<typeof TrackSchema>;

// ============================================
// Musical Key Schema
// ============================================

export const MusicalKeySchema = z.object({
  root: NoteNameSchema,
  mode: MusicalModeSchema,
});

// ============================================
// Time Signature Schema
// ============================================

export const TimeSignatureSchema = z.object({
  numerator: z.number().int().min(1).max(16),
  denominator: z.union([z.literal(2), z.literal(4), z.literal(8), z.literal(16)]),
});

// ============================================
// Global Settings Schema
// ============================================

export const GlobalSettingsSchema = z.object({
  tempo: z.number().min(RESOURCE_LIMITS.MIN_TEMPO).max(RESOURCE_LIMITS.MAX_TEMPO),
  timeSignature: TimeSignatureSchema,
  key: MusicalKeySchema,
  swing: z.number().min(0).max(1).optional(),
});

// ============================================
// Arrangement Block Schema
// ============================================

export const ArrangementBlockSchema = z.object({
  id: z.string().uuid(),
  type: BlockTypeSchema,
  name: z.string().min(1).max(100),
  startBeat: z.number().min(0).max(RESOURCE_LIMITS.MAX_COMPOSITION_DURATION_BEATS),
  durationBeats: z.number().min(0.01),
  repeat: z.number().int().min(1).optional(),
  localKey: MusicalKeySchema.optional(),
  localTempo: z.number().min(RESOURCE_LIMITS.MIN_TEMPO).max(RESOURCE_LIMITS.MAX_TEMPO).optional(),
});

// ============================================
// Creative Annotation Schema
// ============================================

export const CreativeAnnotationSchema = z.object({
  id: z.string().uuid(),
  targetId: z.string(),
  targetType: z.enum(['track', 'block', 'note', 'chord', 'composition']),
  author: z.enum(['user', 'ai']),
  timestamp: z.string().datetime(),
  content: z.string().max(RESOURCE_LIMITS.MAX_ANNOTATION_LENGTH),
  tags: z.array(AnnotationTagSchema),
});

// ============================================
// Composition Metadata Schema
// ============================================

export const CompositionMetadataSchema = z.object({
  title: z.string().min(1).max(200),
  author: z.string().max(100),
  createdAt: z.string().datetime(),
  modifiedAt: z.string().datetime(),
  tags: z.array(z.string().max(RESOURCE_LIMITS.MAX_TAG_LENGTH)).max(RESOURCE_LIMITS.MAX_TAGS),
  bpmHistory: z.array(z.number()).optional(),
});

// ============================================
// Full Composition Schema
// ============================================

export const CompositionSchema = z.object({
  id: z.string().uuid(),
  version: z.literal('1.1'),
  metadata: CompositionMetadataSchema,
  global: GlobalSettingsSchema,
  structure: z.array(ArrangementBlockSchema),
  tracks: z.array(TrackSchema).max(RESOURCE_LIMITS.MAX_TRACKS),
  annotations: z.array(CreativeAnnotationSchema),
});

export type ValidatedComposition = z.infer<typeof CompositionSchema>;

// ============================================
// Validation Functions
// ============================================

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
}

export function validateNote(note: unknown): ValidationResult<ValidatedNote> {
  const result = NoteSchema.safeParse(note);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
  };
}

export function validateTrack(track: unknown): ValidationResult<ValidatedTrack> {
  const result = TrackSchema.safeParse(track);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
  };
}

export function validateComposition(composition: unknown): ValidationResult<ValidatedComposition> {
  const result = CompositionSchema.safeParse(composition);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
  };
}

// ============================================
// Resource Limit Checks
// ============================================

export function canAddTrack(currentTrackCount: number): boolean {
  return currentTrackCount < RESOURCE_LIMITS.MAX_TRACKS;
}

export function canAddNote(currentNoteCount: number): boolean {
  return currentNoteCount < RESOURCE_LIMITS.MAX_NOTES_PER_TRACK;
}

export function canAddSnapshot(currentSnapshotCount: number): boolean {
  return currentSnapshotCount < RESOURCE_LIMITS.MAX_SNAPSHOTS;
}
