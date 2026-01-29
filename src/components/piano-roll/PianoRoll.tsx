// ============================================
// PianoRoll - Enhanced Note Editor Grid
// Music Composer v1.1
// ============================================

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useComposerStore, selectSelectedTrack } from '../../store/useComposerStore';
import { audioEngine } from '../../engine/AudioEngine';
import { HarmonyService } from '../../services/HarmonyService';
import type { Note } from '../../types/composition';
import './PianoRoll.css';

// Configuration
const NOTE_HEIGHT = 16;
const BEAT_WIDTH = 40;
const PIANO_KEY_WIDTH = 60;
const MIN_PITCH = 24; // C1
const MAX_PITCH = 96; // C7
const TOTAL_NOTES = MAX_PITCH - MIN_PITCH + 1;
const RESIZE_HANDLE_WIDTH = 8; // Pixels for resize handle detection

const SNAP_VALUES = [0.25, 0.5, 1, 2, 4];
const SNAP_LABELS = ['1/16', '1/8', '1/4', '1/2', '1'];

// Interaction modes
type InteractionMode = 'none' | 'selecting' | 'moving' | 'resizing' | 'creating';

// Clipboard for copy/paste
interface NoteClipboard {
  notes: Array<{ pitch: number; velocity: number; startBeat: number; durationBeats: number }>;
  baseStartBeat: number;
}

let clipboard: NoteClipboard | null = null;

export function PianoRoll() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedTrack = useComposerStore(selectSelectedTrack);
  const selectedNoteIds = useComposerStore((state) => state.selectedNoteIds);
  const currentBeat = useComposerStore((state) => state.currentBeat);
  const composition = useComposerStore((state) => state.composition);
  const viewportStart = useComposerStore((state) => state.viewportStart);
  const viewportEnd = useComposerStore((state) => state.viewportEnd);
  const zoomLevel = useComposerStore((state) => state.zoomLevel);

  const addNote = useComposerStore((state) => state.addNote);
  const deleteNote = useComposerStore((state) => state.deleteNote);
  const selectNote = useComposerStore((state) => state.selectNote);
  const selectNotesInRange = useComposerStore((state) => state.selectNotesInRange);
  const clearSelection = useComposerStore((state) => state.clearSelection);
  const setViewport = useComposerStore((state) => state.setViewport);
  const setZoomLevel = useComposerStore((state) => state.setZoomLevel);
  const moveNotes = useComposerStore((state) => state.moveNotes);
  const resizeNote = useComposerStore((state) => state.resizeNote);
  const duplicateNotes = useComposerStore((state) => state.duplicateNotes);
  const undo = useComposerStore((state) => state.undo);
  const redo = useComposerStore((state) => state.redo);

  const [snapValue, setSnapValue] = useState(0.5); // 1/8 note
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('none');
  const [dragStart, setDragStart] = useState<{ x: number; y: number; beat: number; pitch: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number; beat: number; pitch: number } | null>(null);
  const [hoveredNote, setHoveredNote] = useState<Note | null>(null);
  const [resizingNote, setResizingNote] = useState<Note | null>(null);
  const [cursorStyle, setCursorStyle] = useState<string>('default');

  const scaledBeatWidth = BEAT_WIDTH * zoomLevel;

  // Get scale notes for highlighting
  const scaleNotes = useMemo(() => {
    if (!composition) return new Set<number>();
    const key = composition.global.key;
    const notes = HarmonyService.getScaleMidiNotes(key, 0, 10);
    return new Set(notes.map((n) => n % 12));
  }, [composition?.global.key]);

  // Convert screen position to grid position
  const screenToGrid = useCallback(
    (x: number, y: number): { beat: number; pitch: number } => {
      const beat = (x - PIANO_KEY_WIDTH) / scaledBeatWidth + viewportStart;
      const pitch = MAX_PITCH - Math.floor(y / NOTE_HEIGHT);
      return {
        beat: Math.max(0, beat),
        pitch: Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch)),
      };
    },
    [scaledBeatWidth, viewportStart]
  );

  // Snap beat to grid
  const snapBeat = useCallback(
    (beat: number): number => {
      if (snapValue <= 0) return beat;
      return Math.round(beat / snapValue) * snapValue;
    },
    [snapValue]
  );

  // Find note at position
  const findNoteAt = useCallback(
    (beat: number, pitch: number): Note | null => {
      if (!selectedTrack) return null;
      return (
        selectedTrack.notes.find(
          (note) =>
            note.pitch === pitch &&
            beat >= note.startBeat &&
            beat < note.startBeat + note.durationBeats
        ) ?? null
      );
    },
    [selectedTrack]
  );

  // Check if position is on note's resize handle (right edge)
  const isOnResizeHandle = useCallback(
    (x: number, note: Note): boolean => {
      const noteEndX = PIANO_KEY_WIDTH + (note.startBeat + note.durationBeats - viewportStart) * scaledBeatWidth;
      return Math.abs(x - noteEndX) <= RESIZE_HANDLE_WIDTH;
    },
    [viewportStart, scaledBeatWidth]
  );

  // Draw piano roll
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    // Draw piano keys
    for (let i = 0; i < TOTAL_NOTES; i++) {
      const pitch = MAX_PITCH - i;
      const y = i * NOTE_HEIGHT;
      const noteName = pitch % 12;
      const isBlackKey = [1, 3, 6, 8, 10].includes(noteName);
      const isInScale = scaleNotes.has(noteName);

      // Piano key
      ctx.fillStyle = isBlackKey ? '#2d2d44' : '#3d3d5c';
      ctx.fillRect(0, y, PIANO_KEY_WIDTH - 2, NOTE_HEIGHT - 1);

      // Key label for C notes
      if (noteName === 0) {
        ctx.fillStyle = '#888';
        ctx.font = '10px monospace';
        const octave = Math.floor(pitch / 12) - 1;
        ctx.fillText(`C${octave}`, 4, y + NOTE_HEIGHT - 4);
      }

      // Grid row
      const rowColor = isInScale ? (isBlackKey ? '#252540' : '#2a2a48') : '#1e1e36';
      ctx.fillStyle = rowColor;
      ctx.fillRect(PIANO_KEY_WIDTH, y, width - PIANO_KEY_WIDTH, NOTE_HEIGHT - 1);
    }

    // Draw vertical beat lines
    for (let beat = Math.floor(viewportStart); beat <= viewportEnd + 1; beat++) {
      const x = PIANO_KEY_WIDTH + (beat - viewportStart) * scaledBeatWidth;
      if (x < PIANO_KEY_WIDTH || x > width) continue;

      // Bar lines (every 4 beats by default)
      const isBarLine = beat % 4 === 0;
      ctx.strokeStyle = isBarLine ? '#555' : '#333';
      ctx.lineWidth = isBarLine ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      // Beat number
      if (isBarLine) {
        ctx.fillStyle = '#666';
        ctx.font = '10px monospace';
        ctx.fillText(`${Math.floor(beat / 4) + 1}`, x + 2, 12);
      }
    }

    // Draw notes
    if (selectedTrack) {
      for (const note of selectedTrack.notes) {
        const x = PIANO_KEY_WIDTH + (note.startBeat - viewportStart) * scaledBeatWidth;
        const y = (MAX_PITCH - note.pitch) * NOTE_HEIGHT;
        const noteWidth = note.durationBeats * scaledBeatWidth;

        // Skip if not visible
        if (x + noteWidth < PIANO_KEY_WIDTH || x > width) continue;

        const isSelected = selectedNoteIds.has(note.id);
        const isHovered = hoveredNote?.id === note.id;
        const isResizing = resizingNote?.id === note.id;

        // Note background with rounded corners
        ctx.fillStyle = isSelected ? '#4CAF50' : isHovered ? '#66BB6A' : '#388E3C';
        ctx.beginPath();
        ctx.roundRect(x + 1, y + 1, noteWidth - 2, NOTE_HEIGHT - 2, 3);
        ctx.fill();

        // Note border
        ctx.strokeStyle = isSelected ? '#81C784' : '#2E7D32';
        ctx.lineWidth = isResizing ? 2 : 1;
        ctx.stroke();

        // Velocity indicator (brightness bar at top)
        const velocityAlpha = note.velocity / 127;
        ctx.fillStyle = `rgba(255, 255, 255, ${velocityAlpha * 0.3})`;
        ctx.fillRect(x + 2, y + 2, noteWidth - 4, 4);

        // Resize handle indicator (right edge highlight when hovered)
        if (isHovered || isSelected) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.fillRect(x + noteWidth - RESIZE_HANDLE_WIDTH, y + 1, RESIZE_HANDLE_WIDTH - 2, NOTE_HEIGHT - 2);
        }
      }
    }

    // Draw selection box if selecting
    if (interactionMode === 'selecting' && dragStart && dragCurrent) {
      const x1 = PIANO_KEY_WIDTH + (dragStart.beat - viewportStart) * scaledBeatWidth;
      const y1 = (MAX_PITCH - dragStart.pitch) * NOTE_HEIGHT;
      const x2 = PIANO_KEY_WIDTH + (dragCurrent.beat - viewportStart) * scaledBeatWidth;
      const y2 = (MAX_PITCH - dragCurrent.pitch) * NOTE_HEIGHT;

      const rectX = Math.min(x1, x2);
      const rectY = Math.min(y1, y2);
      const rectW = Math.abs(x2 - x1);
      const rectH = Math.abs(y2 - y1);

      ctx.fillStyle = 'rgba(76, 175, 80, 0.2)';
      ctx.fillRect(rectX, rectY, rectW, rectH);
      ctx.strokeStyle = '#4CAF50';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(rectX, rectY, rectW, rectH);
      ctx.setLineDash([]);
    }

    // Draw playhead
    const playheadX = PIANO_KEY_WIDTH + (currentBeat - viewportStart) * scaledBeatWidth;
    if (playheadX >= PIANO_KEY_WIDTH && playheadX <= width) {
      ctx.strokeStyle = '#FF5722';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();
    }
  }, [
    selectedTrack,
    selectedNoteIds,
    currentBeat,
    viewportStart,
    viewportEnd,
    zoomLevel,
    scaledBeatWidth,
    scaleNotes,
    hoveredNote,
    resizingNote,
    interactionMode,
    dragStart,
    dragCurrent,
  ]);

  // Handle canvas resize
  useEffect(() => {
    const resizeCanvas = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      canvas.width = container.clientWidth;
      canvas.height = TOTAL_NOTES * NOTE_HEIGHT;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  // Handle mouse down
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!selectedTrack) return;

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Ignore clicks on piano keys
      if (x < PIANO_KEY_WIDTH) return;

      const { beat, pitch } = screenToGrid(x, y);
      const snappedBeat = snapBeat(beat);
      const existingNote = findNoteAt(beat, pitch);

      if (existingNote) {
        // Check if clicking on resize handle
        if (isOnResizeHandle(x, existingNote)) {
          setInteractionMode('resizing');
          setResizingNote(existingNote);
          setDragStart({ x, y, beat: existingNote.startBeat + existingNote.durationBeats, pitch });
          selectNote(existingNote.id);
        } else if (e.shiftKey) {
          // Add to selection
          selectNote(existingNote.id, true);
        } else if (selectedNoteIds.has(existingNote.id)) {
          // Start moving selected notes
          setInteractionMode('moving');
          setDragStart({ x, y, beat: snappedBeat, pitch });
        } else {
          // Select and prepare to move
          selectNote(existingNote.id);
          setInteractionMode('moving');
          setDragStart({ x, y, beat: snappedBeat, pitch });
        }
      } else if (e.shiftKey || e.ctrlKey || e.metaKey) {
        // Start box selection
        setInteractionMode('selecting');
        setDragStart({ x, y, beat, pitch });
        setDragCurrent({ x, y, beat, pitch });
        if (!e.shiftKey) {
          clearSelection();
        }
      } else {
        // Create new note
        clearSelection();
        setInteractionMode('creating');
        setDragStart({ x, y, beat: snappedBeat, pitch });

        addNote(selectedTrack.id, {
          pitch,
          velocity: 80,
          startBeat: snappedBeat,
          durationBeats: snapValue || 0.5,
          probability: 1.0,
        });

        // Play preview
        audioEngine.playNotePreview(
          selectedTrack.instrument.soundfontId,
          pitch,
          80,
          0.3
        );
      }
    },
    [selectedTrack, screenToGrid, snapBeat, findNoteAt, isOnResizeHandle, selectNote, selectedNoteIds, clearSelection, addNote, snapValue]
  );

  // Handle mouse move
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (x < PIANO_KEY_WIDTH) {
        setHoveredNote(null);
        setCursorStyle('default');
        return;
      }

      const { beat, pitch } = screenToGrid(x, y);
      const note = findNoteAt(beat, pitch);

      // Update cursor based on position
      if (note && isOnResizeHandle(x, note)) {
        setCursorStyle('ew-resize');
      } else if (note) {
        setCursorStyle('move');
      } else {
        setCursorStyle('crosshair');
      }

      setHoveredNote(note);

      // Handle drag operations
      if (interactionMode === 'selecting' && dragStart) {
        setDragCurrent({ x, y, beat, pitch });
      } else if (interactionMode === 'moving' && dragStart && selectedTrack) {
        const snappedBeat = snapBeat(beat);
        setDragCurrent({ x, y, beat: snappedBeat, pitch });
      } else if (interactionMode === 'resizing' && dragStart && resizingNote && selectedTrack) {
        const snappedBeat = snapBeat(beat);
        const newDuration = Math.max(snapValue || 0.0625, snappedBeat - resizingNote.startBeat);
        // Visual feedback during resize (actual resize happens on mouse up)
        setDragCurrent({ x, y, beat: snappedBeat, pitch });
      }
    },
    [screenToGrid, findNoteAt, isOnResizeHandle, interactionMode, dragStart, selectedTrack, snapBeat, resizingNote, snapValue]
  );

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    if (!selectedTrack) {
      setInteractionMode('none');
      setDragStart(null);
      setDragCurrent(null);
      setResizingNote(null);
      return;
    }

    if (interactionMode === 'selecting' && dragStart && dragCurrent) {
      // Complete box selection
      const minBeat = Math.min(dragStart.beat, dragCurrent.beat);
      const maxBeat = Math.max(dragStart.beat, dragCurrent.beat);
      const minPitch = Math.min(dragStart.pitch, dragCurrent.pitch);
      const maxPitch = Math.max(dragStart.pitch, dragCurrent.pitch);

      selectNotesInRange(minBeat, maxBeat, [minPitch, maxPitch]);
    } else if (interactionMode === 'moving' && dragStart && dragCurrent && selectedNoteIds.size > 0) {
      // Complete move
      const deltaBeat = snapBeat(dragCurrent.beat - dragStart.beat);
      const deltaPitch = dragCurrent.pitch - dragStart.pitch;

      if (deltaBeat !== 0 || deltaPitch !== 0) {
        moveNotes(selectedTrack.id, [...selectedNoteIds], deltaBeat, deltaPitch);
      }
    } else if (interactionMode === 'resizing' && resizingNote && dragCurrent) {
      // Complete resize
      const newDuration = Math.max(snapValue || 0.0625, snapBeat(dragCurrent.beat) - resizingNote.startBeat);
      if (newDuration !== resizingNote.durationBeats) {
        resizeNote(selectedTrack.id, resizingNote.id, newDuration);
      }
    }

    setInteractionMode('none');
    setDragStart(null);
    setDragCurrent(null);
    setResizingNote(null);
  }, [selectedTrack, interactionMode, dragStart, dragCurrent, selectedNoteIds, selectNotesInRange, snapBeat, moveNotes, resizingNote, resizeNote, snapValue]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedTrack) return;

      // Don't handle if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Delete selected notes
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNoteIds.size > 0) {
        e.preventDefault();
        selectedNoteIds.forEach((id) => {
          deleteNote(selectedTrack.id, id);
        });
        clearSelection();
      }

      // Escape to clear selection
      if (e.key === 'Escape') {
        clearSelection();
      }

      // Undo/Redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }

      // Copy
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedNoteIds.size > 0) {
        e.preventDefault();
        const notesToCopy = selectedTrack.notes.filter((n) => selectedNoteIds.has(n.id));
        if (notesToCopy.length > 0) {
          const baseStartBeat = Math.min(...notesToCopy.map((n) => n.startBeat));
          clipboard = {
            notes: notesToCopy.map((n) => ({
              pitch: n.pitch,
              velocity: n.velocity,
              startBeat: n.startBeat - baseStartBeat, // Relative position
              durationBeats: n.durationBeats,
            })),
            baseStartBeat,
          };
        }
      }

      // Paste
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && clipboard) {
        e.preventDefault();
        // Paste at current beat or after last selected note
        const pasteAt = selectedNoteIds.size > 0
          ? Math.max(...selectedTrack.notes.filter((n) => selectedNoteIds.has(n.id)).map((n) => n.startBeat + n.durationBeats))
          : currentBeat;

        clearSelection();
        clipboard.notes.forEach((noteData) => {
          addNote(selectedTrack.id, {
            ...noteData,
            startBeat: pasteAt + noteData.startBeat,
            probability: 1.0,
          });
        });
      }

      // Duplicate (Ctrl+D)
      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && selectedNoteIds.size > 0) {
        e.preventDefault();
        duplicateNotes(selectedTrack.id, [...selectedNoteIds]);
      }

      // Select all (Ctrl+A)
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        const allNoteIds = selectedTrack.notes.map((n) => n.id);
        if (allNoteIds.length > 0) {
          selectNotesInRange(0, Infinity);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTrack, selectedNoteIds, deleteNote, clearSelection, undo, redo, addNote, duplicateNotes, selectNotesInRange, currentBeat]);

  // Handle scroll/zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        // Zoom
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        setZoomLevel(zoomLevel * delta);
      } else {
        // Scroll
        const scrollAmount = e.deltaX / scaledBeatWidth;
        const newStart = Math.max(0, viewportStart + scrollAmount);
        setViewport(newStart, newStart + (viewportEnd - viewportStart));
      }
    },
    [zoomLevel, viewportStart, viewportEnd, scaledBeatWidth, setZoomLevel, setViewport]
  );

  if (!selectedTrack) {
    return (
      <div className="piano-roll empty">
        <p>Selecciona un track para editar notas</p>
      </div>
    );
  }

  return (
    <div className="piano-roll">
      <div className="piano-roll-toolbar">
        <label title="Snap to grid resolution">
          Snap:
          <select
            value={snapValue}
            onChange={(e) => setSnapValue(Number(e.target.value))}
          >
            {SNAP_VALUES.map((val, i) => (
              <option key={val} value={val}>
                {SNAP_LABELS[i]}
              </option>
            ))}
          </select>
        </label>

        <span className="note-count" title="Total notes in track">
          {selectedTrack.notes.length} notas
        </span>

        {selectedNoteIds.size > 0 && (
          <span className="selection-info">
            {selectedNoteIds.size} seleccionadas
          </span>
        )}

        <div className="toolbar-shortcuts">
          <span title="Ctrl+C: Copy, Ctrl+V: Paste, Ctrl+D: Duplicate, Del: Delete">
            Atajos: C/V/D/Del
          </span>
        </div>
      </div>

      <div className="piano-roll-container" ref={containerRef}>
        <canvas
          ref={canvasRef}
          className="piano-roll-canvas"
          style={{ cursor: cursorStyle }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        />
      </div>
    </div>
  );
}
