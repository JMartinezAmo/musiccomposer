// ============================================
// MIDI Exporter - Export compositions to SMF
// Music Composer v1.1
// ============================================

import { Midi } from '@tonejs/midi';
import type { Composition, Track, Note } from '../types/composition';

/**
 * Convert beats to seconds based on BPM
 */
function beatsToSeconds(beats: number, bpm: number): number {
  return (beats / bpm) * 60;
}

/**
 * Convert composition key mode to MIDI scale string
 */
function modeToScale(mode: string): 'major' | 'minor' {
  return mode === 'major' || mode === 'lydian' || mode === 'mixolydian' ? 'major' : 'minor';
}

/**
 * Export a composition to MIDI format
 */
export function exportToMidi(composition: Composition): Blob {
  const midi = new Midi();

  // Set meta information
  midi.header.setTempo(composition.global.tempo);
  midi.header.timeSignatures.push({
    ticks: 0,
    timeSignature: [
      composition.global.timeSignature.numerator,
      composition.global.timeSignature.denominator,
    ],
    measures: 0,
  });

  // Add key signature
  midi.header.keySignatures.push({
    ticks: 0,
    key: composition.global.key.root,
    scale: modeToScale(composition.global.key.mode),
  });

  // Set name
  midi.header.name = composition.metadata.title;

  // Add tracks
  composition.tracks.forEach((track) => {
    if (track.notes.length === 0) return;

    const midiTrack = midi.addTrack();
    midiTrack.name = track.name;
    midiTrack.channel = track.channel;

    // Set instrument (program change)
    if (track.instrument.bank !== 128) {
      // Not drums
      midiTrack.instrument.number = track.instrument.program;
      midiTrack.instrument.name = getInstrumentName(track.instrument.program);
    }

    // Convert and add notes
    track.notes.forEach((note) => {
      const startSeconds = beatsToSeconds(note.startBeat, composition.global.tempo);
      const durationSeconds = beatsToSeconds(note.durationBeats, composition.global.tempo);

      // Convert seconds to ticks
      const startTicks = midi.header.secondsToTicks(startSeconds);
      const durationTicks = midi.header.secondsToTicks(durationSeconds);

      midiTrack.addNote({
        midi: note.pitch,
        velocity: note.velocity / 127, // @tonejs/midi uses 0-1
        ticks: startTicks,
        durationTicks,
      });
    });

    // Sort notes by time (required by MIDI spec)
    midiTrack.notes.sort((a, b) => a.ticks - b.ticks);
  });

  // Convert to binary
  const midiArray = midi.toArray();
  // Create a new ArrayBuffer copy to ensure it's not a SharedArrayBuffer
  const buffer = new ArrayBuffer(midiArray.byteLength);
  new Uint8Array(buffer).set(midiArray);
  return new Blob([buffer], { type: 'audio/midi' });
}

/**
 * Import MIDI file to composition format
 */
export async function importFromMidi(file: File): Promise<Partial<Composition>> {
  const arrayBuffer = await file.arrayBuffer();
  const midi = new Midi(arrayBuffer);

  // Extract global settings
  const tempo = midi.header.tempos[0]?.bpm ?? 120;
  const timeSignature = midi.header.timeSignatures[0]?.timeSignature ?? [4, 4];
  const keySignature = midi.header.keySignatures[0];

  // Determine key from MIDI
  const key = keySignature
    ? {
        root: keySignature.key as any,
        mode: keySignature.scale === 'major' ? 'major' : 'minor' as any,
      }
    : { root: 'C' as any, mode: 'major' as any };

  // Convert tracks
  const tracks: Track[] = midi.tracks
    .filter((midiTrack) => midiTrack.notes.length > 0)
    .map((midiTrack, index) => {
      // Determine track type based on channel or content
      const type = determineTrackType(midiTrack);

      const notes: Note[] = midiTrack.notes.map((midiNote) => {
        const startSeconds = midi.header.ticksToSeconds(midiNote.ticks);
        const durationSeconds = midiNote.duration;
        const startBeat = (startSeconds / 60) * tempo;
        const durationBeats = (durationSeconds / 60) * tempo;

        return {
          id: crypto.randomUUID(),
          pitch: midiNote.midi,
          velocity: Math.round(midiNote.velocity * 127),
          startBeat: Math.round(startBeat * 1000) / 1000, // 3 decimal precision
          durationBeats: Math.max(0.01, Math.round(durationBeats * 1000) / 1000),
          probability: 1.0,
        };
      });

      return {
        id: crypto.randomUUID(),
        name: midiTrack.name || `Track ${index + 1}`,
        type,
        channel: midiTrack.channel,
        instrument: {
          soundfontId: 'default',
          program: midiTrack.instrument.number,
          bank: midiTrack.channel === 9 ? 128 : 0,
        },
        isMuted: false,
        isSolo: false,
        volume: 0.8,
        pan: 0,
        notes,
      };
    });

  return {
    version: '1.1',
    metadata: {
      title: midi.header.name || file.name.replace(/\.mid[i]?$/i, ''),
      author: '',
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      tags: ['imported'],
    },
    global: {
      tempo,
      timeSignature: {
        numerator: timeSignature[0],
        denominator: timeSignature[1] as 2 | 4 | 8 | 16,
      },
      key,
    },
    structure: [],
    tracks,
    annotations: [],
  };
}

/**
 * Determine track type based on MIDI content
 */
function determineTrackType(midiTrack: ReturnType<typeof Midi.prototype.addTrack>): Track['type'] {
  // Drums channel
  if (midiTrack.channel === 9) {
    return 'drums';
  }

  const notes = midiTrack.notes;
  if (notes.length === 0) return 'custom';

  // Analyze pitch range
  const pitches = notes.map((n) => n.midi);
  const minPitch = Math.min(...pitches);
  const maxPitch = Math.max(...pitches);
  const avgPitch = pitches.reduce((a, b) => a + b, 0) / pitches.length;
  const range = maxPitch - minPitch;

  // Bass: low pitch range
  if (avgPitch < 50 && maxPitch < 60) {
    return 'bass';
  }

  // Melody: single notes, wide range, higher register
  if (avgPitch > 55 && range > 12) {
    return 'melody';
  }

  // Chords: multiple simultaneous notes
  const simultaneousNotes = countSimultaneousNotes(notes);
  if (simultaneousNotes > 2) {
    return 'chords';
  }

  // Pad: sustained notes
  const avgDuration = notes.reduce((a, n) => a + n.duration, 0) / notes.length;
  if (avgDuration > 2) {
    return 'pad';
  }

  return 'melody';
}

/**
 * Count average simultaneous notes (rough chord detection)
 */
function countSimultaneousNotes(notes: Array<{ ticks: number; duration: number }>): number {
  if (notes.length < 2) return 1;

  // Group notes by approximate start time (within 10 ticks)
  const tolerance = 10;
  let groups = 1;
  let currentGroupCount = 1;
  let maxGroupCount = 1;

  for (let i = 1; i < notes.length; i++) {
    if (Math.abs(notes[i].ticks - notes[i - 1].ticks) <= tolerance) {
      currentGroupCount++;
      maxGroupCount = Math.max(maxGroupCount, currentGroupCount);
    } else {
      currentGroupCount = 1;
      groups++;
    }
  }

  return maxGroupCount;
}

/**
 * Get General MIDI instrument name
 */
function getInstrumentName(program: number): string {
  const instruments: Record<number, string> = {
    0: 'Acoustic Grand Piano',
    1: 'Bright Acoustic Piano',
    4: 'Electric Piano 1',
    5: 'Electric Piano 2',
    24: 'Acoustic Guitar (nylon)',
    25: 'Acoustic Guitar (steel)',
    26: 'Electric Guitar (jazz)',
    27: 'Electric Guitar (clean)',
    28: 'Electric Guitar (muted)',
    29: 'Overdriven Guitar',
    30: 'Distortion Guitar',
    32: 'Acoustic Bass',
    33: 'Electric Bass (finger)',
    34: 'Electric Bass (pick)',
    35: 'Fretless Bass',
    40: 'Violin',
    41: 'Viola',
    42: 'Cello',
    43: 'Contrabass',
    48: 'String Ensemble 1',
    49: 'String Ensemble 2',
    52: 'Choir Aahs',
    56: 'Trumpet',
    57: 'Trombone',
    60: 'French Horn',
    65: 'Alto Sax',
    66: 'Tenor Sax',
    73: 'Flute',
    80: 'Lead 1 (square)',
    81: 'Lead 2 (sawtooth)',
    88: 'Pad 1 (new age)',
    89: 'Pad 2 (warm)',
  };

  return instruments[program] || `Program ${program}`;
}

/**
 * Save exported MIDI file using File System Access API or fallback
 */
export async function saveExportedMidi(composition: Composition): Promise<void> {
  const blob = exportToMidi(composition);
  const fileName = `${composition.metadata.title || 'composition'}.mid`;

  // Try File System Access API (Chrome/Edge)
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: 'MIDI File',
            accept: { 'audio/midi': ['.mid', '.midi'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e) {
      // User cancelled or API not supported - fall through to fallback
      if ((e as Error).name === 'AbortError') {
        return; // User cancelled
      }
    }
  }

  // Fallback: download via anchor element
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Open MIDI file using File System Access API or fallback
 */
export async function openMidiFile(): Promise<Partial<Composition> | null> {
  // Try File System Access API
  if ('showOpenFilePicker' in window) {
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        types: [
          {
            description: 'MIDI File',
            accept: { 'audio/midi': ['.mid', '.midi'] },
          },
        ],
      });
      const file = await handle.getFile();
      return importFromMidi(file);
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        return null; // User cancelled
      }
    }
  }

  // Fallback: file input element
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.mid,.midi,audio/midi';

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        resolve(importFromMidi(file));
      } else {
        resolve(null);
      }
    };

    input.click();
  });
}
