// ============================================
// HarmonyService - Harmonic Analysis with Tonal.js
// Music Composer v1.1
// ============================================

import { Chord, Note, Scale, Key, Interval, Pcset } from 'tonal';
import type { MusicalKey, ChordFunction, MusicalMode } from '../types/composition';

/**
 * Scale name mapping from our mode names to Tonal.js scale names
 */
const MODE_TO_SCALE_MAP: Record<MusicalMode, string> = {
  major: 'major',
  minor: 'natural minor',
  dorian: 'dorian',
  mixolydian: 'mixolydian',
  phrygian: 'phrygian',
  lydian: 'lydian',
  locrian: 'locrian',
};

/**
 * Roman numeral analysis for major keys
 */
const MAJOR_KEY_FUNCTIONS: Record<number, ChordFunction> = {
  1: 'tonic',
  2: 'subdominant', // Predominant
  3: 'tonic',       // Tonic substitute
  4: 'subdominant',
  5: 'dominant',
  6: 'tonic',       // Tonic substitute / relative minor
  7: 'dominant',    // Leading tone / dominant function
};

/**
 * Roman numeral analysis for minor keys
 */
const MINOR_KEY_FUNCTIONS: Record<number, ChordFunction> = {
  1: 'tonic',
  2: 'subdominant',
  3: 'tonic',       // Relative major
  4: 'subdominant',
  5: 'dominant',
  6: 'subdominant',
  7: 'dominant',    // Subtonic or leading tone
};

/**
 * HarmonyService - Harmonic analysis using Tonal.js
 */
export class HarmonyService {
  /**
   * Detect chord from a group of MIDI notes
   */
  static detectChord(midiNotes: number[]): string | null {
    if (midiNotes.length < 2) return null;

    // Convert MIDI to note names (without octave for detection)
    const noteNames = midiNotes
      .map((n) => Note.fromMidi(n))
      .filter(Boolean)
      .map((n) => Note.pitchClass(n as string))
      .filter(Boolean) as string[];

    // Remove duplicates
    const uniqueNotes = [...new Set(noteNames)];

    if (uniqueNotes.length < 2) return null;

    // Tonal.Chord.detect returns array of possible chords
    const detected = Chord.detect(uniqueNotes);

    // Return the most probable (first) or null
    return detected[0] || null;
  }

  /**
   * Detect chord from a group of note names
   */
  static detectChordFromNames(noteNames: string[]): string | null {
    if (noteNames.length < 2) return null;

    const pitchClasses = noteNames
      .map((n) => Note.pitchClass(n))
      .filter(Boolean) as string[];

    const uniqueNotes = [...new Set(pitchClasses)];

    if (uniqueNotes.length < 2) return null;

    const detected = Chord.detect(uniqueNotes);
    return detected[0] || null;
  }

  /**
   * Get notes of a scale for validation/melody suggestion
   */
  static getScaleNotes(key: MusicalKey): string[] {
    const scaleName = MODE_TO_SCALE_MAP[key.mode];
    const scale = Scale.get(`${key.root} ${scaleName}`);
    return scale.notes;
  }

  /**
   * Get scale notes as MIDI numbers in a specific octave range
   */
  static getScaleMidiNotes(key: MusicalKey, startOctave: number = 3, endOctave: number = 5): number[] {
    const scaleNotes = this.getScaleNotes(key);
    const midiNotes: number[] = [];

    for (let octave = startOctave; octave <= endOctave; octave++) {
      for (const note of scaleNotes) {
        const midi = Note.midi(`${note}${octave}`);
        if (midi !== null) {
          midiNotes.push(midi);
        }
      }
    }

    return midiNotes.sort((a, b) => a - b);
  }

  /**
   * Validate if a MIDI note belongs to the current scale
   */
  static isNoteInScale(midiNote: number, key: MusicalKey): boolean {
    const noteName = Note.pitchClass(Note.fromMidi(midiNote) || '');
    if (!noteName) return false;

    const scaleNotes = this.getScaleNotes(key);
    return scaleNotes.includes(noteName);
  }

  /**
   * Get all notes that are NOT in the current scale (chromatic notes)
   */
  static getChromaticNotes(key: MusicalKey): string[] {
    const allNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const scaleNotes = this.getScaleNotes(key);

    // Normalize to sharps for comparison
    const normalizedScale = scaleNotes.map((n) => {
      const enharmonic = Note.enharmonic(n);
      return enharmonic && enharmonic.length <= 2 ? enharmonic : n;
    });

    return allNotes.filter((n) => !normalizedScale.includes(n) && !normalizedScale.includes(Note.enharmonic(n) || ''));
  }

  /**
   * Suggest tension notes valid over a chord
   */
  static getTensionNotes(chordSymbol: string, key: MusicalKey): number[] {
    const chord = Chord.get(chordSymbol);
    const scaleNotes = this.getScaleNotes(key);

    if (!chord.notes || chord.notes.length === 0) {
      return [];
    }

    // Scale notes not in the chord = available tensions
    const chordPitchClasses = chord.notes.map((n) => Note.pitchClass(n));
    const tensions = scaleNotes.filter(
      (n) => !chordPitchClasses.includes(n) && !chordPitchClasses.includes(Note.enharmonic(n) || '')
    );

    // Return as MIDI notes in octave 4
    return tensions
      .map((n) => Note.midi(`${n}4`))
      .filter((n): n is number => n !== null);
  }

  /**
   * Get chord tones as MIDI notes
   */
  static getChordTones(chordSymbol: string, octave: number = 4): number[] {
    const chord = Chord.get(chordSymbol);

    if (!chord.notes || chord.notes.length === 0) {
      return [];
    }

    return chord.notes
      .map((n) => Note.midi(`${n}${octave}`))
      .filter((n): n is number => n !== null);
  }

  /**
   * Get a specific voicing for a chord
   */
  static getChordVoicing(
    chordSymbol: string,
    options: {
      rootOctave?: number;
      inversion?: number;
      spread?: boolean;
    } = {}
  ): number[] {
    const { rootOctave = 3, inversion = 0, spread = false } = options;
    const chord = Chord.get(chordSymbol);

    if (!chord.notes || chord.notes.length === 0) {
      return [];
    }

    let notes = [...chord.notes];

    // Apply inversion by rotating notes
    const effectiveInversion = inversion % notes.length;
    if (effectiveInversion > 0) {
      notes = [...notes.slice(effectiveInversion), ...notes.slice(0, effectiveInversion)];
    }

    // Convert to MIDI, adjusting octaves
    const midiNotes: number[] = [];
    let currentOctave = rootOctave;

    for (let i = 0; i < notes.length; i++) {
      const midi = Note.midi(`${notes[i]}${currentOctave}`);
      if (midi !== null) {
        // Ensure notes are ascending
        if (midiNotes.length > 0 && midi <= midiNotes[midiNotes.length - 1]) {
          currentOctave++;
          const adjustedMidi = Note.midi(`${notes[i]}${currentOctave}`);
          if (adjustedMidi !== null) {
            midiNotes.push(adjustedMidi);
          }
        } else {
          midiNotes.push(midi);
        }

        // Add spread (skip octave for open voicing)
        if (spread && i < notes.length - 1) {
          currentOctave++;
        }
      }
    }

    return midiNotes;
  }

  /**
   * Analyze harmonic function of a chord in context
   */
  static analyzeChordFunction(chordSymbol: string, key: MusicalKey): ChordFunction {
    const chord = Chord.get(chordSymbol);
    const root = chord.tonic;

    if (!root) return 'passing';

    // Get scale notes for the key
    const scaleNotes = this.getScaleNotes(key);

    // Find the degree of the chord root in the scale
    const rootPitchClass = Note.pitchClass(root);
    let degree = -1;

    for (let i = 0; i < scaleNotes.length; i++) {
      const scalePc = Note.pitchClass(scaleNotes[i]);
      if (scalePc === rootPitchClass || Note.enharmonic(scalePc || '') === rootPitchClass) {
        degree = i + 1;
        break;
      }
    }

    if (degree === -1) {
      // Check if it's a secondary dominant
      if (chord.type?.includes('7') || chord.type?.includes('dom')) {
        return 'secondary-dominant';
      }
      // Check if it's a borrowed chord
      return 'borrowed';
    }

    // Use function map based on mode
    const isMinor = key.mode === 'minor' || key.mode === 'dorian' || key.mode === 'phrygian';
    const functionMap = isMinor ? MINOR_KEY_FUNCTIONS : MAJOR_KEY_FUNCTIONS;

    return functionMap[degree] || 'passing';
  }

  /**
   * Get diatonic chords for a key
   */
  static getDiatonicChords(key: MusicalKey): string[] {
    const keyInfo = key.mode === 'major' || key.mode === 'lydian' || key.mode === 'mixolydian'
      ? Key.majorKey(key.root)
      : Key.minorKey(key.root);

    if ('chords' in keyInfo) {
      return [...keyInfo.chords];
    }

    // For minor key, return natural minor chords
    if ('natural' in keyInfo && keyInfo.natural) {
      return [...keyInfo.natural.chords];
    }

    return [];
  }

  /**
   * Suggest next chord based on harmonic function
   */
  static suggestNextChords(currentChord: string, key: MusicalKey): string[] {
    const currentFunction = this.analyzeChordFunction(currentChord, key);
    const diatonicChords = this.getDiatonicChords(key);
    const suggestions: string[] = [];

    // Common progressions based on function
    switch (currentFunction) {
      case 'tonic':
        // Can go anywhere, prefer subdominant or dominant
        diatonicChords.forEach((chord) => {
          const func = this.analyzeChordFunction(chord, key);
          if (func === 'subdominant' || func === 'dominant') {
            suggestions.push(chord);
          }
        });
        break;

      case 'subdominant':
        // Typically goes to dominant or tonic
        diatonicChords.forEach((chord) => {
          const func = this.analyzeChordFunction(chord, key);
          if (func === 'dominant' || func === 'tonic') {
            suggestions.push(chord);
          }
        });
        break;

      case 'dominant':
        // Strongly wants to resolve to tonic
        diatonicChords.forEach((chord) => {
          const func = this.analyzeChordFunction(chord, key);
          if (func === 'tonic') {
            suggestions.unshift(chord); // Priority
          } else if (func === 'subdominant') {
            suggestions.push(chord); // Deceptive
          }
        });
        break;

      default:
        // Return all diatonic chords
        suggestions.push(...diatonicChords);
    }

    return [...new Set(suggestions)];
  }

  /**
   * Detect potential modulation by comparing two sections
   */
  static detectModulation(
    beforeNotes: number[],
    afterNotes: number[]
  ): { hasModulation: boolean; suggestedKey?: MusicalKey; confidence: number } {
    // Simplified implementation using pitch class histogram
    // In production: use Krumhansl-Schmuckler key-finding algorithm

    const beforePitchClasses = new Set(beforeNotes.map((n) => n % 12));
    const afterPitchClasses = new Set(afterNotes.map((n) => n % 12));

    // Find notes that are new in the after section
    const newNotes = [...afterPitchClasses].filter((pc) => !beforePitchClasses.has(pc));

    if (newNotes.length === 0) {
      return { hasModulation: false, confidence: 0.9 };
    }

    // If we have 2+ new chromatic notes, likely a modulation
    if (newNotes.length >= 2) {
      // Try to detect the new key (simplified)
      const afterNoteNames = afterNotes
        .map((n) => Note.pitchClass(Note.fromMidi(n) || ''))
        .filter(Boolean) as string[];

      // Use Tonal's pitch class set detection
      const detected = Pcset.modes(afterNoteNames);

      if (detected.length > 0) {
        // Find first major or minor scale match
        for (const mode of detected) {
          if (mode.includes('major')) {
            const root = mode.replace(' major', '');
            return {
              hasModulation: true,
              suggestedKey: { root: root as any, mode: 'major' },
              confidence: 0.7,
            };
          }
          if (mode.includes('minor')) {
            const root = mode.replace(' minor', '');
            return {
              hasModulation: true,
              suggestedKey: { root: root as any, mode: 'minor' },
              confidence: 0.7,
            };
          }
        }
      }

      return { hasModulation: true, confidence: 0.5 };
    }

    return { hasModulation: false, confidence: 0.7 };
  }

  /**
   * Get interval between two MIDI notes
   */
  static getInterval(midiNote1: number, midiNote2: number): string {
    const note1 = Note.fromMidi(midiNote1);
    const note2 = Note.fromMidi(midiNote2);

    if (!note1 || !note2) return '';

    return Interval.distance(note1, note2);
  }

  /**
   * Transpose a MIDI note by an interval
   */
  static transpose(midiNote: number, interval: string): number | null {
    const noteName = Note.fromMidi(midiNote);
    if (!noteName) return null;

    const transposed = Note.transpose(noteName, interval);
    return Note.midi(transposed);
  }

  /**
   * Quantize a MIDI note to the nearest scale tone
   */
  static quantizeToScale(midiNote: number, key: MusicalKey): number {
    const scaleMidiNotes = this.getScaleMidiNotes(key, 0, 10);

    // Find the nearest scale note
    let nearestNote = midiNote;
    let minDistance = Infinity;

    for (const scaleNote of scaleMidiNotes) {
      const distance = Math.abs(scaleNote - midiNote);
      if (distance < minDistance) {
        minDistance = distance;
        nearestNote = scaleNote;
      }
    }

    return nearestNote;
  }

  /**
   * Analyze melody contour
   */
  static analyzeMelodyContour(midiNotes: number[]): {
    direction: 'ascending' | 'descending' | 'static' | 'mixed';
    range: number;
    averagePitch: number;
  } {
    if (midiNotes.length === 0) {
      return { direction: 'static', range: 0, averagePitch: 60 };
    }

    const min = Math.min(...midiNotes);
    const max = Math.max(...midiNotes);
    const range = max - min;
    const averagePitch = midiNotes.reduce((a, b) => a + b, 0) / midiNotes.length;

    if (midiNotes.length < 2) {
      return { direction: 'static', range, averagePitch };
    }

    let ascending = 0;
    let descending = 0;

    for (let i = 1; i < midiNotes.length; i++) {
      if (midiNotes[i] > midiNotes[i - 1]) ascending++;
      else if (midiNotes[i] < midiNotes[i - 1]) descending++;
    }

    const total = ascending + descending;
    if (total === 0) {
      return { direction: 'static', range, averagePitch };
    }

    const ascendingRatio = ascending / total;

    if (ascendingRatio > 0.7) {
      return { direction: 'ascending', range, averagePitch };
    } else if (ascendingRatio < 0.3) {
      return { direction: 'descending', range, averagePitch };
    }

    return { direction: 'mixed', range, averagePitch };
  }
}
