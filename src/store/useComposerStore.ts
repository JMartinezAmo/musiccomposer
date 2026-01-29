// ============================================
// Zustand Store - Music Composer State Management
// Music Composer v1.1
// ============================================

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { v4 as uuidv4 } from 'uuid';
import type {
  Composition,
  Track,
  Note,
  ArrangementBlock,
  MusicalKey,
  TimeSignature,
  CreativeAnnotation,
} from '../types/composition';
import type {
  ComposerStore,
  ComposerState,
  HistoryAction,
  Snapshot,
  AISuggestion,
  CompositionContext,
} from '../types/store';
import { audioEngine } from '../engine/AudioEngine';
import { aiOrchestrator } from '../ai/AIOrchestrator';
import {
  saveComposition,
  getComposition,
  getSnapshotsForComposition,
  saveSnapshot,
  deleteSnapshot as deleteSnapshotFromDB,
  type StoredSnapshot,
} from '../persistence/db';

// ============================================
// Constants
// ============================================

const MAX_UNDO_STACK = 100;
const MAX_SNAPSHOTS_PER_COMPOSITION = 20;
const AUTOSAVE_DEBOUNCE_MS = 2000;

// ============================================
// Initial State
// ============================================

const initialState: ComposerState = {
  composition: null,
  isModified: false,
  undoStack: [],
  redoStack: [],
  snapshots: [],
  isPlaying: false,
  currentBeat: 0,
  loopStart: null,
  loopEnd: null,
  selectedTrackId: null,
  selectedNoteIds: new Set(),
  viewportStart: 0,
  viewportEnd: 32, // 8 bars default view
  zoomLevel: 1,
  aiStatus: 'idle',
  aiModelLoaded: false,
  aiLoadProgress: 0,
  pendingSuggestions: [],
};

// ============================================
// Autosave Timer
// ============================================

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAutosave(store: ComposerStore) {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
  }
  autosaveTimer = setTimeout(() => {
    if (store.isModified && store.composition) {
      store.saveComposition();
    }
  }, AUTOSAVE_DEBOUNCE_MS);
}

// ============================================
// Store Implementation
// ============================================

export const useComposerStore = create<ComposerStore>()(
  immer((set, get) => ({
    // Spread initial state
    ...initialState,

    // ========================================
    // Initialization
    // ========================================

    async initializeAudio() {
      try {
        await audioEngine.initialize();
      } catch (error) {
        console.error('Failed to initialize audio:', error);
        throw error;
      }
    },

    async initializeAI(onProgress) {
      set({ aiStatus: 'loading-model', aiLoadProgress: 0 });

      try {
        await aiOrchestrator.initialize((progress) => {
          set({ aiLoadProgress: progress });
          onProgress?.(progress);
        });
        set({ aiStatus: 'idle', aiModelLoaded: true, aiLoadProgress: 1 });
      } catch (error) {
        set({ aiStatus: 'error' });
        console.error('Failed to initialize AI:', error);
        throw error;
      }
    },

    // ========================================
    // Composition CRUD
    // ========================================

    async loadComposition(id: string) {
      const comp = await getComposition(id);
      if (!comp) {
        throw new Error(`Composition ${id} not found`);
      }

      const snapshots = await getSnapshotsForComposition(id);

      set({
        composition: comp,
        snapshots: snapshots.map(s => ({
          id: s.id,
          name: s.name,
          createdAt: s.createdAt,
          compositionJSON: s.compositionJSON,
        })),
        isModified: false,
        undoStack: [],
        redoStack: [],
        selectedTrackId: null,
        selectedNoteIds: new Set(),
      });

      // Schedule all tracks for playback
      for (const track of comp.tracks) {
        try {
          await audioEngine.loadInstrument(
            track.instrument.soundfontId,
            track.instrument.program
          );
          audioEngine.scheduleTrack(track);
        } catch (error) {
          console.warn(`Failed to load instrument for track ${track.id}:`, error);
        }
      }

      // Set transport settings
      audioEngine.setTempo(comp.global.tempo);
      audioEngine.setTimeSignature(
        comp.global.timeSignature.numerator,
        comp.global.timeSignature.denominator
      );
    },

    createComposition(title: string) {
      const newComp: Composition = {
        id: uuidv4(),
        version: '1.1',
        metadata: {
          title,
          author: '',
          createdAt: new Date().toISOString(),
          modifiedAt: new Date().toISOString(),
          tags: [],
        },
        global: {
          tempo: 120,
          timeSignature: { numerator: 4, denominator: 4 },
          key: { root: 'C', mode: 'major' },
        },
        structure: [],
        tracks: [],
        annotations: [],
      };

      set({
        composition: newComp,
        isModified: true,
        snapshots: [],
        undoStack: [],
        redoStack: [],
        selectedTrackId: null,
        selectedNoteIds: new Set(),
      });

      // Set transport settings
      audioEngine.setTempo(newComp.global.tempo);
      audioEngine.setTimeSignature(4, 4);

      scheduleAutosave(get());
    },

    async saveComposition() {
      const { composition } = get();
      if (!composition) return;

      const updated: Composition = {
        ...composition,
        metadata: {
          ...composition.metadata,
          modifiedAt: new Date().toISOString(),
        },
      };

      await saveComposition(updated);
      set({ composition: updated, isModified: false });
    },

    // ========================================
    // Note Operations (Undoable)
    // ========================================

    addNote(trackId: string, noteData: Omit<Note, 'id'>) {
      const note: Note = { ...noteData, id: uuidv4() };

      // Create undoable action
      const action: HistoryAction = {
        type: 'ADD_NOTE',
        timestamp: Date.now(),
        description: `Add note at beat ${note.startBeat}`,
        forward: () => {
          set((draft) => {
            const track = draft.composition?.tracks.find((t) => t.id === trackId);
            if (track) {
              track.notes.push(note);
              draft.isModified = true;
            }
          });
          // Reschedule track
          const track = get().composition?.tracks.find((t) => t.id === trackId);
          if (track) {
            audioEngine.scheduleTrack(track);
          }
        },
        backward: () => {
          set((draft) => {
            const track = draft.composition?.tracks.find((t) => t.id === trackId);
            if (track) {
              track.notes = track.notes.filter((n) => n.id !== note.id);
              draft.isModified = true;
            }
          });
          const track = get().composition?.tracks.find((t) => t.id === trackId);
          if (track) {
            audioEngine.scheduleTrack(track);
          }
        },
      };

      action.forward();

      set((draft) => {
        draft.undoStack.push(action);
        draft.redoStack = [];
        // Limit undo stack
        if (draft.undoStack.length > MAX_UNDO_STACK) {
          draft.undoStack.shift();
        }
      });

      scheduleAutosave(get());
    },

    updateNote(trackId: string, noteId: string, updates: Partial<Note>) {
      const state = get();
      const track = state.composition?.tracks.find((t) => t.id === trackId);
      const note = track?.notes.find((n) => n.id === noteId);
      if (!note) return;

      const previousState = { ...note };

      const action: HistoryAction = {
        type: 'UPDATE_NOTE',
        timestamp: Date.now(),
        description: 'Update note',
        forward: () => {
          set((draft) => {
            const t = draft.composition?.tracks.find((t) => t.id === trackId);
            const n = t?.notes.find((n) => n.id === noteId);
            if (n) {
              Object.assign(n, updates);
              draft.isModified = true;
            }
          });
          const track = get().composition?.tracks.find((t) => t.id === trackId);
          if (track) {
            audioEngine.scheduleTrack(track);
          }
        },
        backward: () => {
          set((draft) => {
            const t = draft.composition?.tracks.find((t) => t.id === trackId);
            const n = t?.notes.find((n) => n.id === noteId);
            if (n) {
              Object.assign(n, previousState);
              draft.isModified = true;
            }
          });
          const track = get().composition?.tracks.find((t) => t.id === trackId);
          if (track) {
            audioEngine.scheduleTrack(track);
          }
        },
      };

      action.forward();

      set((draft) => {
        draft.undoStack.push(action);
        draft.redoStack = [];
      });

      scheduleAutosave(get());
    },

    deleteNote(trackId: string, noteId: string) {
      const state = get();
      const track = state.composition?.tracks.find((t) => t.id === trackId);
      const note = track?.notes.find((n) => n.id === noteId);
      if (!note) return;

      const deletedNote = { ...note };

      const action: HistoryAction = {
        type: 'DELETE_NOTE',
        timestamp: Date.now(),
        description: 'Delete note',
        forward: () => {
          set((draft) => {
            const t = draft.composition?.tracks.find((t) => t.id === trackId);
            if (t) {
              t.notes = t.notes.filter((n) => n.id !== noteId);
              draft.isModified = true;
            }
            draft.selectedNoteIds.delete(noteId);
          });
          const track = get().composition?.tracks.find((t) => t.id === trackId);
          if (track) {
            audioEngine.scheduleTrack(track);
          }
        },
        backward: () => {
          set((draft) => {
            const t = draft.composition?.tracks.find((t) => t.id === trackId);
            if (t) {
              t.notes.push(deletedNote);
              draft.isModified = true;
            }
          });
          const track = get().composition?.tracks.find((t) => t.id === trackId);
          if (track) {
            audioEngine.scheduleTrack(track);
          }
        },
      };

      action.forward();

      set((draft) => {
        draft.undoStack.push(action);
        draft.redoStack = [];
      });

      scheduleAutosave(get());
    },

    deleteSelectedNotes() {
      const { selectedNoteIds, selectedTrackId, composition } = get();
      if (!selectedTrackId || selectedNoteIds.size === 0 || !composition) return;

      const track = composition.tracks.find((t) => t.id === selectedTrackId);
      if (!track) return;

      const deletedNotes = track.notes.filter((n) => selectedNoteIds.has(n.id));
      const noteIds = [...selectedNoteIds];

      const action: HistoryAction = {
        type: 'DELETE_SELECTED_NOTES',
        timestamp: Date.now(),
        description: `Delete ${noteIds.length} notes`,
        forward: () => {
          set((draft) => {
            const t = draft.composition?.tracks.find((t) => t.id === selectedTrackId);
            if (t) {
              t.notes = t.notes.filter((n) => !noteIds.includes(n.id));
              draft.isModified = true;
            }
            draft.selectedNoteIds = new Set();
          });
          const track = get().composition?.tracks.find((t) => t.id === selectedTrackId);
          if (track) {
            audioEngine.scheduleTrack(track);
          }
        },
        backward: () => {
          set((draft) => {
            const t = draft.composition?.tracks.find((t) => t.id === selectedTrackId);
            if (t) {
              t.notes.push(...deletedNotes);
              draft.isModified = true;
            }
          });
          const track = get().composition?.tracks.find((t) => t.id === selectedTrackId);
          if (track) {
            audioEngine.scheduleTrack(track);
          }
        },
      };

      action.forward();

      set((draft) => {
        draft.undoStack.push(action);
        draft.redoStack = [];
      });

      scheduleAutosave(get());
    },

    moveNotes(trackId: string, noteIds: string[], deltaBeat: number, deltaPitch: number) {
      const state = get();
      const track = state.composition?.tracks.find((t) => t.id === trackId);
      if (!track) return;

      const notesToMove = track.notes.filter((n) => noteIds.includes(n.id));
      const previousStates = notesToMove.map((n) => ({ id: n.id, startBeat: n.startBeat, pitch: n.pitch }));

      const action: HistoryAction = {
        type: 'MOVE_NOTES',
        timestamp: Date.now(),
        description: `Move ${noteIds.length} notes`,
        forward: () => {
          set((draft) => {
            const t = draft.composition?.tracks.find((t) => t.id === trackId);
            if (t) {
              t.notes.forEach((n) => {
                if (noteIds.includes(n.id)) {
                  n.startBeat = Math.max(0, n.startBeat + deltaBeat);
                  n.pitch = Math.max(0, Math.min(127, n.pitch + deltaPitch));
                }
              });
              draft.isModified = true;
            }
          });
          const track = get().composition?.tracks.find((t) => t.id === trackId);
          if (track) {
            audioEngine.scheduleTrack(track);
          }
        },
        backward: () => {
          set((draft) => {
            const t = draft.composition?.tracks.find((t) => t.id === trackId);
            if (t) {
              previousStates.forEach((prev) => {
                const note = t.notes.find((n) => n.id === prev.id);
                if (note) {
                  note.startBeat = prev.startBeat;
                  note.pitch = prev.pitch;
                }
              });
              draft.isModified = true;
            }
          });
          const track = get().composition?.tracks.find((t) => t.id === trackId);
          if (track) {
            audioEngine.scheduleTrack(track);
          }
        },
      };

      action.forward();

      set((draft) => {
        draft.undoStack.push(action);
        draft.redoStack = [];
      });

      scheduleAutosave(get());
    },

    resizeNote(trackId: string, noteId: string, newDuration: number) {
      const state = get();
      const track = state.composition?.tracks.find((t) => t.id === trackId);
      const note = track?.notes.find((n) => n.id === noteId);
      if (!note) return;

      const previousDuration = note.durationBeats;

      const action: HistoryAction = {
        type: 'RESIZE_NOTE',
        timestamp: Date.now(),
        description: 'Resize note',
        forward: () => {
          set((draft) => {
            const t = draft.composition?.tracks.find((t) => t.id === trackId);
            const n = t?.notes.find((n) => n.id === noteId);
            if (n) {
              n.durationBeats = Math.max(0.0625, newDuration); // Min 1/16 note
              draft.isModified = true;
            }
          });
          const track = get().composition?.tracks.find((t) => t.id === trackId);
          if (track) {
            audioEngine.scheduleTrack(track);
          }
        },
        backward: () => {
          set((draft) => {
            const t = draft.composition?.tracks.find((t) => t.id === trackId);
            const n = t?.notes.find((n) => n.id === noteId);
            if (n) {
              n.durationBeats = previousDuration;
              draft.isModified = true;
            }
          });
          const track = get().composition?.tracks.find((t) => t.id === trackId);
          if (track) {
            audioEngine.scheduleTrack(track);
          }
        },
      };

      action.forward();

      set((draft) => {
        draft.undoStack.push(action);
        draft.redoStack = [];
      });

      scheduleAutosave(get());
    },

    duplicateNotes(trackId: string, noteIds: string[]) {
      const state = get();
      const track = state.composition?.tracks.find((t) => t.id === trackId);
      if (!track) return;

      const notesToDuplicate = track.notes.filter((n) => noteIds.includes(n.id));
      const newNotes: Note[] = notesToDuplicate.map((n) => ({
        ...n,
        id: uuidv4(),
        startBeat: n.startBeat + n.durationBeats, // Place after original
      }));
      const newNoteIds = newNotes.map((n) => n.id);

      const action: HistoryAction = {
        type: 'DUPLICATE_NOTES',
        timestamp: Date.now(),
        description: `Duplicate ${noteIds.length} notes`,
        forward: () => {
          set((draft) => {
            const t = draft.composition?.tracks.find((t) => t.id === trackId);
            if (t) {
              t.notes.push(...newNotes);
              draft.isModified = true;
            }
            draft.selectedNoteIds = new Set(newNoteIds);
          });
          const track = get().composition?.tracks.find((t) => t.id === trackId);
          if (track) {
            audioEngine.scheduleTrack(track);
          }
        },
        backward: () => {
          set((draft) => {
            const t = draft.composition?.tracks.find((t) => t.id === trackId);
            if (t) {
              t.notes = t.notes.filter((n) => !newNoteIds.includes(n.id));
              draft.isModified = true;
            }
            draft.selectedNoteIds = new Set(noteIds);
          });
          const track = get().composition?.tracks.find((t) => t.id === trackId);
          if (track) {
            audioEngine.scheduleTrack(track);
          }
        },
      };

      action.forward();

      set((draft) => {
        draft.undoStack.push(action);
        draft.redoStack = [];
      });

      scheduleAutosave(get());
    },

    // ========================================
    // Track Operations
    // ========================================

    addTrack(trackData: Omit<Track, 'id'>) {
      const track: Track = { ...trackData, id: uuidv4() };

      set((draft) => {
        draft.composition?.tracks.push(track);
        draft.isModified = true;
        draft.selectedTrackId = track.id;
      });

      // Load instrument for new track
      audioEngine
        .loadInstrument(track.instrument.soundfontId, track.instrument.program)
        .catch((err) => console.warn('Failed to load instrument:', err));

      scheduleAutosave(get());
    },

    updateTrack(trackId: string, updates: Partial<Track>) {
      set((draft) => {
        const track = draft.composition?.tracks.find((t) => t.id === trackId);
        if (track) {
          Object.assign(track, updates);
          draft.isModified = true;
        }
      });

      // Reschedule if mute/solo changed
      if ('isMuted' in updates || 'isSolo' in updates || 'volume' in updates) {
        const track = get().composition?.tracks.find((t) => t.id === trackId);
        if (track) {
          audioEngine.scheduleTrack(track);
        }
      }

      scheduleAutosave(get());
    },

    deleteTrack(trackId: string) {
      audioEngine.unscheduleTrack(trackId);

      set((draft) => {
        if (draft.composition) {
          draft.composition.tracks = draft.composition.tracks.filter(
            (t) => t.id !== trackId
          );
          draft.isModified = true;
        }
        if (draft.selectedTrackId === trackId) {
          draft.selectedTrackId = null;
          draft.selectedNoteIds = new Set();
        }
      });

      scheduleAutosave(get());
    },

    // ========================================
    // Block Operations
    // ========================================

    addBlock(blockData: Omit<ArrangementBlock, 'id'>) {
      const block: ArrangementBlock = { ...blockData, id: uuidv4() };

      set((draft) => {
        draft.composition?.structure.push(block);
        draft.isModified = true;
      });

      scheduleAutosave(get());
    },

    updateBlock(blockId: string, updates: Partial<ArrangementBlock>) {
      set((draft) => {
        const block = draft.composition?.structure.find((b) => b.id === blockId);
        if (block) {
          Object.assign(block, updates);
          draft.isModified = true;
        }
      });

      scheduleAutosave(get());
    },

    deleteBlock(blockId: string) {
      set((draft) => {
        if (draft.composition) {
          draft.composition.structure = draft.composition.structure.filter(
            (b) => b.id !== blockId
          );
          draft.isModified = true;
        }
      });

      scheduleAutosave(get());
    },

    // ========================================
    // Playback
    // ========================================

    play() {
      audioEngine.play();
      set({ isPlaying: true });

      // Start position tracking
      audioEngine.onPositionUpdate((beat) => {
        set({ currentBeat: beat });
      });
    },

    pause() {
      audioEngine.pause();
      set({ isPlaying: false });
    },

    stop() {
      audioEngine.stop();
      set({ isPlaying: false, currentBeat: 0 });
    },

    seek(beat: number) {
      audioEngine.seekTo(beat);
      set({ currentBeat: beat });
    },

    setTempo(bpm: number) {
      const clampedBpm = Math.max(20, Math.min(300, bpm));
      audioEngine.setTempo(clampedBpm);

      set((draft) => {
        if (draft.composition) {
          draft.composition.global.tempo = clampedBpm;
          draft.isModified = true;
        }
      });

      scheduleAutosave(get());
    },

    setLoop(start: number | null, end: number | null) {
      const enabled = start !== null && end !== null;
      audioEngine.setLoop(enabled, start ?? undefined, end ?? undefined);
      set({ loopStart: start, loopEnd: end });
    },

    // ========================================
    // AI
    // ========================================

    async generateSuggestions(prompt: string) {
      const { composition, aiModelLoaded } = get();
      if (!composition || !aiModelLoaded) return;

      set({ aiStatus: 'generating' });

      try {
        // Create snapshot before AI generation
        await get().createSnapshot(`Pre-AI: ${prompt.slice(0, 30)}...`);

        const context: CompositionContext = {
          key: composition.global.key,
          tempo: composition.global.tempo,
          timeSignature: composition.global.timeSignature,
          existingTracks: composition.tracks,
        };

        const options = await aiOrchestrator.generateOptions(prompt, context);

        const suggestion: AISuggestion = {
          id: uuidv4(),
          prompt,
          generatedAt: new Date().toISOString(),
          options,
          status: 'pending',
        };

        set((draft) => {
          draft.pendingSuggestions.push(suggestion);
          draft.aiStatus = 'idle';
        });
      } catch (error) {
        console.error('AI generation failed:', error);
        set({ aiStatus: 'error' });
        throw error;
      }
    },

    applySuggestion(suggestionId: string, optionId: string) {
      const state = get();
      const suggestion = state.pendingSuggestions.find((s) => s.id === suggestionId);
      const option = suggestion?.options.find((o) => o.id === optionId);

      if (!option || !state.composition) return;

      set((draft) => {
        // Add generated tracks
        option.tracks.forEach((track) => {
          draft.composition?.tracks.push(track);
        });

        // Add annotation
        const annotation: CreativeAnnotation = {
          id: uuidv4(),
          targetId: draft.composition!.id,
          targetType: 'composition',
          author: 'ai',
          timestamp: new Date().toISOString(),
          content: option.annotation,
          tags: ['harmony'], // Default tag
        };
        draft.composition?.annotations.push(annotation);

        // Mark suggestion as applied
        const s = draft.pendingSuggestions.find((s) => s.id === suggestionId);
        if (s) s.status = 'applied';

        draft.isModified = true;
      });

      // Schedule new tracks
      option.tracks.forEach((track) => {
        audioEngine
          .loadInstrument(track.instrument.soundfontId, track.instrument.program)
          .then(() => audioEngine.scheduleTrack(track))
          .catch((err) => console.warn('Failed to schedule track:', err));
      });

      scheduleAutosave(get());
    },

    rejectSuggestion(suggestionId: string) {
      set((draft) => {
        const s = draft.pendingSuggestions.find((s) => s.id === suggestionId);
        if (s) s.status = 'rejected';
      });
    },

    clearPendingSuggestions() {
      set((draft) => {
        draft.pendingSuggestions = draft.pendingSuggestions.filter(
          (s) => s.status === 'pending'
        );
      });
    },

    // ========================================
    // Versioning
    // ========================================

    undo() {
      const { undoStack } = get();
      if (undoStack.length === 0) return;

      const action = undoStack[undoStack.length - 1];
      action.backward();

      set((draft) => {
        const popped = draft.undoStack.pop();
        if (popped) {
          draft.redoStack.push(popped);
        }
      });
    },

    redo() {
      const { redoStack } = get();
      if (redoStack.length === 0) return;

      const action = redoStack[redoStack.length - 1];
      action.forward();

      set((draft) => {
        const popped = draft.redoStack.pop();
        if (popped) {
          draft.undoStack.push(popped);
        }
      });
    },

    async createSnapshot(name: string) {
      const { composition } = get();
      if (!composition) return;

      const snapshot: Snapshot = {
        id: uuidv4(),
        name,
        createdAt: new Date().toISOString(),
        compositionJSON: JSON.stringify(composition),
      };

      const storedSnapshot: StoredSnapshot = {
        ...snapshot,
        compositionId: composition.id,
      };

      await saveSnapshot(storedSnapshot);

      set((draft) => {
        draft.snapshots.push(snapshot);
        // Limit snapshots in memory
        if (draft.snapshots.length > MAX_SNAPSHOTS_PER_COMPOSITION) {
          draft.snapshots.shift();
        }
      });
    },

    async restoreSnapshot(snapshotId: string) {
      const snapshot = get().snapshots.find((s) => s.id === snapshotId);
      if (!snapshot) return;

      try {
        const restored = JSON.parse(snapshot.compositionJSON) as Composition;

        // Stop playback
        audioEngine.stop();

        set({
          composition: restored,
          isModified: true,
          undoStack: [],
          redoStack: [],
          isPlaying: false,
          currentBeat: 0,
        });

        // Reschedule all tracks
        for (const track of restored.tracks) {
          await audioEngine.loadInstrument(
            track.instrument.soundfontId,
            track.instrument.program
          );
          audioEngine.scheduleTrack(track);
        }

        // Update transport
        audioEngine.setTempo(restored.global.tempo);
        audioEngine.setTimeSignature(
          restored.global.timeSignature.numerator,
          restored.global.timeSignature.denominator
        );

        scheduleAutosave(get());
      } catch (error) {
        console.error('Failed to restore snapshot:', error);
        throw error;
      }
    },

    async deleteSnapshot(snapshotId: string) {
      await deleteSnapshotFromDB(snapshotId);

      set((draft) => {
        draft.snapshots = draft.snapshots.filter((s) => s.id !== snapshotId);
      });
    },

    // ========================================
    // Selection
    // ========================================

    selectTrack(trackId: string | null) {
      set({
        selectedTrackId: trackId,
        selectedNoteIds: new Set(),
      });
    },

    selectNote(noteId: string, addToSelection = false) {
      set((draft) => {
        if (addToSelection) {
          draft.selectedNoteIds.add(noteId);
        } else {
          draft.selectedNoteIds = new Set([noteId]);
        }
      });
    },

    selectNotesInRange(
      startBeat: number,
      endBeat: number,
      pitchRange?: [number, number]
    ) {
      const { selectedTrackId, composition } = get();
      if (!selectedTrackId || !composition) return;

      const track = composition.tracks.find((t) => t.id === selectedTrackId);
      if (!track) return;

      const selectedIds = track.notes
        .filter((note) => {
          const inBeatRange =
            note.startBeat >= startBeat &&
            note.startBeat + note.durationBeats <= endBeat;
          const inPitchRange =
            !pitchRange ||
            (note.pitch >= pitchRange[0] && note.pitch <= pitchRange[1]);
          return inBeatRange && inPitchRange;
        })
        .map((n) => n.id);

      set({ selectedNoteIds: new Set(selectedIds) });
    },

    clearSelection() {
      set({ selectedNoteIds: new Set() });
    },

    // ========================================
    // Viewport
    // ========================================

    setViewport(start: number, end: number) {
      set({ viewportStart: start, viewportEnd: end });
    },

    setZoomLevel(level: number) {
      const clampedLevel = Math.max(0.25, Math.min(4, level));
      set({ zoomLevel: clampedLevel });
    },

    // ========================================
    // Global Settings
    // ========================================

    setKey(key: MusicalKey) {
      set((draft) => {
        if (draft.composition) {
          draft.composition.global.key = key;
          draft.isModified = true;
        }
      });

      scheduleAutosave(get());
    },

    setTimeSignature(ts: TimeSignature) {
      audioEngine.setTimeSignature(ts.numerator, ts.denominator);

      set((draft) => {
        if (draft.composition) {
          draft.composition.global.timeSignature = ts;
          draft.isModified = true;
        }
      });

      scheduleAutosave(get());
    },
  }))
);

// ============================================
// Selectors (for optimized re-renders)
// ============================================

export const selectComposition = (state: ComposerStore) => state.composition;
export const selectTracks = (state: ComposerStore) => state.composition?.tracks ?? [];
export const selectSelectedTrack = (state: ComposerStore) => {
  if (!state.selectedTrackId || !state.composition) return null;
  return state.composition.tracks.find((t) => t.id === state.selectedTrackId) ?? null;
};
export const selectIsPlaying = (state: ComposerStore) => state.isPlaying;
export const selectCurrentBeat = (state: ComposerStore) => state.currentBeat;
export const selectAIStatus = (state: ComposerStore) => state.aiStatus;
export const selectPendingSuggestions = (state: ComposerStore) => state.pendingSuggestions;
export const selectCanUndo = (state: ComposerStore) => state.undoStack.length > 0;
export const selectCanRedo = (state: ComposerStore) => state.redoStack.length > 0;
