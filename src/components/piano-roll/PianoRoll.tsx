// ============================================
// PianoRoll - Note Editor Grid
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

const SNAP_VALUES = [0.25, 0.5, 1, 2, 4];
const SNAP_LABELS = ['1/16', '1/8', '1/4', '1/2', '1'];

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
  const clearSelection = useComposerStore((state) => state.clearSelection);
  const setViewport = useComposerStore((state) => state.setViewport);
  const setZoomLevel = useComposerStore((state) => state.setZoomLevel);

  const [snapValue, setSnapValue] = useState(0.5); // 1/8 note
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [hoveredNote, setHoveredNote] = useState<Note | null>(null);

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
        beat: Math.max(0, snapValue > 0 ? Math.round(beat / snapValue) * snapValue : beat),
        pitch: Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch)),
      };
    },
    [scaledBeatWidth, viewportStart, snapValue]
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

        // Note background
        ctx.fillStyle = isSelected ? '#4CAF50' : isHovered ? '#66BB6A' : '#388E3C';
        ctx.fillRect(x + 1, y + 1, noteWidth - 2, NOTE_HEIGHT - 2);

        // Note border
        ctx.strokeStyle = isSelected ? '#81C784' : '#2E7D32';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 1, y + 1, noteWidth - 2, NOTE_HEIGHT - 2);

        // Velocity indicator (brightness)
        const velocityAlpha = note.velocity / 127;
        ctx.fillStyle = `rgba(255, 255, 255, ${velocityAlpha * 0.3})`;
        ctx.fillRect(x + 2, y + 2, noteWidth - 4, 4);
      }
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

    // Draw selection box if dragging
    if (isDragging && dragStart) {
      // Selection box code would go here
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
    isDragging,
    dragStart,
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

  // Handle mouse events
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
      const existingNote = findNoteAt(beat, pitch);

      if (e.shiftKey) {
        // Multi-select
        if (existingNote) {
          selectNote(existingNote.id, true);
        }
      } else if (existingNote) {
        // Select existing note
        selectNote(existingNote.id);
      } else {
        // Add new note
        clearSelection();
        addNote(selectedTrack.id, {
          pitch,
          velocity: 80,
          startBeat: beat,
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

      setDragStart({ x, y });
    },
    [selectedTrack, screenToGrid, findNoteAt, selectNote, clearSelection, addNote, snapValue]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (x < PIANO_KEY_WIDTH) {
        setHoveredNote(null);
        return;
      }

      const { beat, pitch } = screenToGrid(x, y);
      const note = findNoteAt(beat, pitch);
      setHoveredNote(note);
    },
    [screenToGrid, findNoteAt]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragStart(null);
  }, []);

  // Handle keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedTrack) return;

      // Delete selected notes
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNoteIds.size > 0) {
        selectedNoteIds.forEach((id) => {
          deleteNote(selectedTrack.id, id);
        });
        clearSelection();
      }

      // Escape to clear selection
      if (e.key === 'Escape') {
        clearSelection();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTrack, selectedNoteIds, deleteNote, clearSelection]);

  // Handle scroll
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
        <label>
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

        <span className="note-count">
          {selectedTrack.notes.length} notas
        </span>

        {selectedNoteIds.size > 0 && (
          <span className="selection-info">
            {selectedNoteIds.size} seleccionadas
          </span>
        )}
      </div>

      <div className="piano-roll-container" ref={containerRef}>
        <canvas
          ref={canvasRef}
          className="piano-roll-canvas"
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
