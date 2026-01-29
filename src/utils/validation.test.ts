// ============================================
// Validation - Unit Tests
// Music Composer v1.1
// ============================================

import { describe, it, expect } from 'vitest';
import {
  validateNote,
  validateTrack,
  validateComposition,
  canAddTrack,
  canAddNote,
  canAddSnapshot,
  RESOURCE_LIMITS,
  NoteSchema,
  TrackSchema,
} from './validation';

describe('Validation Schemas', () => {
  // ============================================
  // Note Validation
  // ============================================

  describe('NoteSchema', () => {
    it('should validate a correct note', () => {
      const note = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        pitch: 60,
        velocity: 80,
        startBeat: 0,
        durationBeats: 1,
      };

      const result = NoteSchema.safeParse(note);
      expect(result.success).toBe(true);
    });

    it('should reject pitch out of range', () => {
      const note = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        pitch: 128, // Invalid: > 127
        velocity: 80,
        startBeat: 0,
        durationBeats: 1,
      };

      const result = NoteSchema.safeParse(note);
      expect(result.success).toBe(false);
    });

    it('should reject negative pitch', () => {
      const note = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        pitch: -1,
        velocity: 80,
        startBeat: 0,
        durationBeats: 1,
      };

      const result = NoteSchema.safeParse(note);
      expect(result.success).toBe(false);
    });

    it('should reject velocity of 0', () => {
      const note = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        pitch: 60,
        velocity: 0, // Invalid: must be 1-127
        startBeat: 0,
        durationBeats: 1,
      };

      const result = NoteSchema.safeParse(note);
      expect(result.success).toBe(false);
    });

    it('should reject velocity > 127', () => {
      const note = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        pitch: 60,
        velocity: 128,
        startBeat: 0,
        durationBeats: 1,
      };

      const result = NoteSchema.safeParse(note);
      expect(result.success).toBe(false);
    });

    it('should reject negative startBeat', () => {
      const note = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        pitch: 60,
        velocity: 80,
        startBeat: -1,
        durationBeats: 1,
      };

      const result = NoteSchema.safeParse(note);
      expect(result.success).toBe(false);
    });

    it('should reject duration too small', () => {
      const note = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        pitch: 60,
        velocity: 80,
        startBeat: 0,
        durationBeats: 0.001, // Too small, min is 0.01
      };

      const result = NoteSchema.safeParse(note);
      expect(result.success).toBe(false);
    });

    it('should accept optional probability', () => {
      const note = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        pitch: 60,
        velocity: 80,
        startBeat: 0,
        durationBeats: 1,
        probability: 0.8,
      };

      const result = NoteSchema.safeParse(note);
      expect(result.success).toBe(true);
    });

    it('should reject probability out of range', () => {
      const note = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        pitch: 60,
        velocity: 80,
        startBeat: 0,
        durationBeats: 1,
        probability: 1.5, // Invalid: > 1.0
      };

      const result = NoteSchema.safeParse(note);
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // validateNote function
  // ============================================

  describe('validateNote', () => {
    it('should return success for valid note', () => {
      const note = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        pitch: 60,
        velocity: 80,
        startBeat: 4.5,
        durationBeats: 0.5,
      };

      const result = validateNote(note);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should return errors for invalid note', () => {
      const note = {
        id: 'not-a-uuid',
        pitch: 200,
        velocity: 0,
        startBeat: -1,
        durationBeats: 0,
      };

      const result = validateNote(note);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // Track Validation
  // ============================================

  describe('TrackSchema', () => {
    const validTrack = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Melody 1',
      type: 'melody',
      channel: 0,
      instrument: {
        soundfontId: 'default',
        program: 0,
        bank: 0,
      },
      isMuted: false,
      isSolo: false,
      volume: 0.8,
      pan: 0,
      notes: [],
    };

    it('should validate a correct track', () => {
      const result = TrackSchema.safeParse(validTrack);
      expect(result.success).toBe(true);
    });

    it('should reject invalid track type', () => {
      const track = { ...validTrack, type: 'invalid-type' };
      const result = TrackSchema.safeParse(track);
      expect(result.success).toBe(false);
    });

    it('should reject channel > 15', () => {
      const track = { ...validTrack, channel: 16 };
      const result = TrackSchema.safeParse(track);
      expect(result.success).toBe(false);
    });

    it('should reject volume > 1', () => {
      const track = { ...validTrack, volume: 1.5 };
      const result = TrackSchema.safeParse(track);
      expect(result.success).toBe(false);
    });

    it('should reject pan out of range', () => {
      const track = { ...validTrack, pan: 2 };
      const result = TrackSchema.safeParse(track);
      expect(result.success).toBe(false);
    });

    it('should accept track with valid notes', () => {
      const track = {
        ...validTrack,
        notes: [
          {
            id: '550e8400-e29b-41d4-a716-446655440001',
            pitch: 60,
            velocity: 80,
            startBeat: 0,
            durationBeats: 1,
          },
        ],
      };
      const result = TrackSchema.safeParse(track);
      expect(result.success).toBe(true);
    });
  });

  // ============================================
  // Resource Limits
  // ============================================

  describe('Resource Limits', () => {
    it('should have correct MAX_TRACKS limit', () => {
      expect(RESOURCE_LIMITS.MAX_TRACKS).toBe(16);
    });

    it('should have correct MAX_NOTES_PER_TRACK limit', () => {
      expect(RESOURCE_LIMITS.MAX_NOTES_PER_TRACK).toBe(10000);
    });

    it('should have correct tempo limits', () => {
      expect(RESOURCE_LIMITS.MIN_TEMPO).toBe(20);
      expect(RESOURCE_LIMITS.MAX_TEMPO).toBe(300);
    });
  });

  describe('canAddTrack', () => {
    it('should return true when under limit', () => {
      expect(canAddTrack(0)).toBe(true);
      expect(canAddTrack(15)).toBe(true);
    });

    it('should return false when at limit', () => {
      expect(canAddTrack(16)).toBe(false);
      expect(canAddTrack(20)).toBe(false);
    });
  });

  describe('canAddNote', () => {
    it('should return true when under limit', () => {
      expect(canAddNote(0)).toBe(true);
      expect(canAddNote(9999)).toBe(true);
    });

    it('should return false when at limit', () => {
      expect(canAddNote(10000)).toBe(false);
      expect(canAddNote(20000)).toBe(false);
    });
  });

  describe('canAddSnapshot', () => {
    it('should return true when under limit', () => {
      expect(canAddSnapshot(0)).toBe(true);
      expect(canAddSnapshot(19)).toBe(true);
    });

    it('should return false when at limit', () => {
      expect(canAddSnapshot(20)).toBe(false);
    });
  });
});
