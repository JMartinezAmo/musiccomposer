// ============================================
// Header - Transport Controls & Global Settings
// Music Composer v1.1
// ============================================

import { useComposerStore } from '../../store/useComposerStore';
import type { NoteName, MusicalMode } from '../../types/composition';
import './Header.css';

const NOTE_NAMES: NoteName[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MODES: MusicalMode[] = ['major', 'minor', 'dorian', 'mixolydian', 'phrygian', 'lydian', 'locrian'];
const TIME_SIGNATURES = [
  { numerator: 4, denominator: 4 },
  { numerator: 3, denominator: 4 },
  { numerator: 6, denominator: 8 },
  { numerator: 2, denominator: 4 },
  { numerator: 5, denominator: 4 },
  { numerator: 7, denominator: 8 },
] as const;

export function Header() {
  const composition = useComposerStore((state) => state.composition);
  const isPlaying = useComposerStore((state) => state.isPlaying);
  const currentBeat = useComposerStore((state) => state.currentBeat);
  const undoStack = useComposerStore((state) => state.undoStack);
  const redoStack = useComposerStore((state) => state.redoStack);

  const play = useComposerStore((state) => state.play);
  const pause = useComposerStore((state) => state.pause);
  const stop = useComposerStore((state) => state.stop);
  const setTempo = useComposerStore((state) => state.setTempo);
  const setKey = useComposerStore((state) => state.setKey);
  const setTimeSignature = useComposerStore((state) => state.setTimeSignature);
  const undo = useComposerStore((state) => state.undo);
  const redo = useComposerStore((state) => state.redo);
  const saveComposition = useComposerStore((state) => state.saveComposition);

  if (!composition) return null;

  const { tempo, key, timeSignature } = composition.global;

  // Format current position as bars:beats
  const formatPosition = (beat: number) => {
    const bars = Math.floor(beat / timeSignature.numerator) + 1;
    const beats = Math.floor(beat % timeSignature.numerator) + 1;
    return `${bars}:${beats}`;
  };

  return (
    <header className="header">
      {/* Transport Controls */}
      <div className="header-section transport">
        <button
          className={`transport-btn ${isPlaying ? 'active' : ''}`}
          onClick={() => (isPlaying ? pause() : play())}
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button className="transport-btn" onClick={stop} title="Stop">
          ⏹
        </button>
        <span className="position-display" title="Position (Bar:Beat)">
          {formatPosition(currentBeat)}
        </span>
      </div>

      {/* Tempo */}
      <div className="header-section">
        <label className="header-label">
          Tempo
          <input
            type="number"
            className="header-input tempo-input"
            value={tempo}
            min={20}
            max={300}
            onChange={(e) => setTempo(Number(e.target.value))}
          />
          <span className="header-unit">BPM</span>
        </label>
      </div>

      {/* Key */}
      <div className="header-section">
        <label className="header-label">
          Tonalidad
          <select
            className="header-select"
            value={key.root}
            onChange={(e) => setKey({ ...key, root: e.target.value as NoteName })}
          >
            {NOTE_NAMES.map((note) => (
              <option key={note} value={note}>
                {note}
              </option>
            ))}
          </select>
          <select
            className="header-select"
            value={key.mode}
            onChange={(e) => setKey({ ...key, mode: e.target.value as MusicalMode })}
          >
            {MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Time Signature */}
      <div className="header-section">
        <label className="header-label">
          Compás
          <select
            className="header-select"
            value={`${timeSignature.numerator}/${timeSignature.denominator}`}
            onChange={(e) => {
              const [num, den] = e.target.value.split('/').map(Number);
              setTimeSignature({ numerator: num, denominator: den as 2 | 4 | 8 | 16 });
            }}
          >
            {TIME_SIGNATURES.map((ts) => (
              <option key={`${ts.numerator}/${ts.denominator}`} value={`${ts.numerator}/${ts.denominator}`}>
                {ts.numerator}/{ts.denominator}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Spacer */}
      <div className="header-spacer" />

      {/* Undo/Redo */}
      <div className="header-section">
        <button
          className="header-btn"
          onClick={undo}
          disabled={undoStack.length === 0}
          title="Undo (Cmd+Z)"
        >
          ↩ Deshacer
        </button>
        <button
          className="header-btn"
          onClick={redo}
          disabled={redoStack.length === 0}
          title="Redo (Cmd+Shift+Z)"
        >
          ↪ Rehacer
        </button>
      </div>

      {/* Save */}
      <div className="header-section">
        <button className="header-btn primary" onClick={saveComposition} title="Save (Cmd+S)">
          💾 Guardar
        </button>
      </div>
    </header>
  );
}
