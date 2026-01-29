// ============================================
// STORE.TYPES - Estado en Memoria (Zustand)
// Music Composer - Store Types v1.1
// ============================================

import type {
  Composition,
  Track,
  ArrangementBlock,
  MusicalKey,
  TimeSignature,
} from './composition';

/**
 * History action for undo/redo functionality
 * Uses Command pattern for reversible operations
 */
export interface HistoryAction {
  type: string;
  timestamp: number;
  forward: () => void; // Apply change
  backward: () => void; // Revert change
  description: string; // "Added note C4 at beat 4"
}

/**
 * Snapshot for major version saves (pre-AI, manual saves)
 * Stored in IndexedDB, limited to 20 per composition
 */
export interface Snapshot {
  id: string;
  compositionId?: string; // For IndexedDB relation
  name: string;
  createdAt: string;
  compositionJSON: string; // JSON.stringify(composition)
  thumbnail?: string; // Base64 mini-preview (future)
}

/**
 * AI suggestion with multiple options at different temperatures
 */
export interface AISuggestion {
  id: string;
  prompt: string;
  generatedAt: string;
  options: AISuggestionOption[];
  status: 'pending' | 'applied' | 'rejected';
}

/**
 * Single AI-generated option
 */
export interface AISuggestionOption {
  id: string;
  tracks: Track[]; // Generated tracks
  annotation: string; // Arranger explanation
  confidence: number; // 0-1, model self-assessment
  temperatureUsed: number;
}

/**
 * Context passed to AI for generation
 */
export interface CompositionContext {
  key: MusicalKey;
  tempo: number;
  timeSignature: TimeSignature;
  currentBlock?: ArrangementBlock;
  existingTracks: Track[];
}

/**
 * AI status states
 */
export type AIStatus = 'idle' | 'loading-model' | 'generating' | 'error';

/**
 * Main composer store state interface
 */
export interface ComposerState {
  // === Loaded Data ===
  composition: Composition | null;
  isModified: boolean; // "dirty flag" for autosave

  // === Versioning (in memory, not in Composition) ===
  undoStack: HistoryAction[];
  redoStack: HistoryAction[];
  snapshots: Snapshot[];

  // === Playback State ===
  isPlaying: boolean;
  currentBeat: number;
  loopStart: number | null;
  loopEnd: number | null;

  // === UI State ===
  selectedTrackId: string | null;
  selectedNoteIds: Set<string>;
  viewportStart: number; // beat visible from
  viewportEnd: number; // beat visible to
  zoomLevel: number; // 1 = default, 0.5 = zoom out, 2 = zoom in

  // === AI State ===
  aiStatus: AIStatus;
  aiModelLoaded: boolean;
  aiLoadProgress: number; // 0-1 for loading progress
  pendingSuggestions: AISuggestion[];
}

/**
 * Store actions interface
 */
export interface ComposerActions {
  // === Initialization ===
  initializeAudio: () => Promise<void>;
  initializeAI: (onProgress?: (p: number) => void) => Promise<void>;

  // === Composition CRUD ===
  loadComposition: (id: string) => Promise<void>;
  createComposition: (title: string) => void;
  saveComposition: () => Promise<void>;

  // === Note Operations (undoable) ===
  addNote: (trackId: string, note: Omit<import('./composition').Note, 'id'>) => void;
  updateNote: (
    trackId: string,
    noteId: string,
    updates: Partial<import('./composition').Note>
  ) => void;
  deleteNote: (trackId: string, noteId: string) => void;
  deleteSelectedNotes: () => void;

  // === Track Operations ===
  addTrack: (track: Omit<Track, 'id'>) => void;
  updateTrack: (trackId: string, updates: Partial<Track>) => void;
  deleteTrack: (trackId: string) => void;

  // === Block Operations ===
  addBlock: (block: Omit<ArrangementBlock, 'id'>) => void;
  updateBlock: (blockId: string, updates: Partial<ArrangementBlock>) => void;
  deleteBlock: (blockId: string) => void;

  // === Playback ===
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (beat: number) => void;
  setTempo: (bpm: number) => void;
  setLoop: (start: number | null, end: number | null) => void;

  // === AI ===
  generateSuggestions: (prompt: string) => Promise<void>;
  applySuggestion: (suggestionId: string, optionId: string) => void;
  rejectSuggestion: (suggestionId: string) => void;
  clearPendingSuggestions: () => void;

  // === Versioning ===
  undo: () => void;
  redo: () => void;
  createSnapshot: (name: string) => Promise<void>;
  restoreSnapshot: (snapshotId: string) => Promise<void>;
  deleteSnapshot: (snapshotId: string) => Promise<void>;

  // === Selection ===
  selectTrack: (trackId: string | null) => void;
  selectNote: (noteId: string, addToSelection?: boolean) => void;
  selectNotesInRange: (startBeat: number, endBeat: number, pitchRange?: [number, number]) => void;
  clearSelection: () => void;

  // === Viewport ===
  setViewport: (start: number, end: number) => void;
  setZoomLevel: (level: number) => void;

  // === Global Settings ===
  setKey: (key: MusicalKey) => void;
  setTimeSignature: (ts: TimeSignature) => void;
}

/**
 * Combined store type
 */
export type ComposerStore = ComposerState & ComposerActions;
