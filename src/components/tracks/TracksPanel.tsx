// ============================================
// TracksPanel - Track List & Controls
// Music Composer v1.1
// ============================================

import { useState } from 'react';
import { useComposerStore, selectTracks, selectSelectedTrack } from '../../store/useComposerStore';
import { AudioEngine } from '../../engine/AudioEngine';
import type { Track, TrackType } from '../../types/composition';
import './TracksPanel.css';

const TRACK_TYPE_LABELS: Record<TrackType, string> = {
  melody: 'Melodía',
  chords: 'Acordes',
  bass: 'Bajo',
  drums: 'Batería',
  pad: 'Pad',
  arpeggio: 'Arpegio',
  custom: 'Otro',
};

const TRACK_TYPE_COLORS: Record<TrackType, string> = {
  melody: '#4CAF50',
  chords: '#2196F3',
  bass: '#FF5722',
  drums: '#9C27B0',
  pad: '#00BCD4',
  arpeggio: '#FF9800',
  custom: '#607D8B',
};

export function TracksPanel() {
  const tracks = useComposerStore(selectTracks);
  const selectedTrack = useComposerStore(selectSelectedTrack);
  const selectTrack = useComposerStore((state) => state.selectTrack);
  const updateTrack = useComposerStore((state) => state.updateTrack);
  const deleteTrack = useComposerStore((state) => state.deleteTrack);
  const addTrack = useComposerStore((state) => state.addTrack);

  const [isAddingTrack, setIsAddingTrack] = useState(false);
  const [newTrackType, setNewTrackType] = useState<TrackType>('melody');

  const handleAddTrack = () => {
    const newTrack: Omit<Track, 'id'> = {
      name: `${TRACK_TYPE_LABELS[newTrackType]} ${tracks.filter((t) => t.type === newTrackType).length + 1}`,
      type: newTrackType,
      channel: AudioEngine.getDefaultChannel(newTrackType),
      instrument: {
        soundfontId: 'default',
        program: AudioEngine.getDefaultProgram(newTrackType),
        bank: newTrackType === 'drums' ? 128 : 0,
      },
      isMuted: false,
      isSolo: false,
      volume: 0.8,
      pan: 0,
      notes: [],
    };

    addTrack(newTrack);
    setIsAddingTrack(false);
  };

  const handleVolumeChange = (trackId: string, volume: number) => {
    updateTrack(trackId, { volume });
  };

  const handleToggleMute = (trackId: string, currentMuted: boolean) => {
    updateTrack(trackId, { isMuted: !currentMuted });
  };

  const handleToggleSolo = (trackId: string, currentSolo: boolean) => {
    updateTrack(trackId, { isSolo: !currentSolo });
  };

  return (
    <div className="tracks-panel">
      <div className="panel-header">
        <h3>Tracks</h3>
      </div>

      <div className="tracks-list">
        {tracks.map((track) => (
          <div
            key={track.id}
            className={`track-item ${selectedTrack?.id === track.id ? 'selected' : ''}`}
            onClick={() => selectTrack(track.id)}
          >
            <div
              className="track-color"
              style={{ backgroundColor: TRACK_TYPE_COLORS[track.type] }}
            />

            <div className="track-info">
              <span className="track-name">{track.name}</span>
              <span className="track-type">{TRACK_TYPE_LABELS[track.type]}</span>
            </div>

            <div className="track-controls">
              <button
                className={`track-btn ${track.isMuted ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleMute(track.id, track.isMuted);
                }}
                title="Mute"
              >
                M
              </button>
              <button
                className={`track-btn ${track.isSolo ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleSolo(track.id, track.isSolo);
                }}
                title="Solo"
              >
                S
              </button>
            </div>

            <div className="track-volume">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={track.volume}
                onChange={(e) => handleVolumeChange(track.id, Number(e.target.value))}
                onClick={(e) => e.stopPropagation()}
                className="volume-slider"
              />
            </div>

            <button
              className="track-delete"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm('¿Eliminar este track?')) {
                  deleteTrack(track.id);
                }
              }}
              title="Eliminar track"
            >
              ×
            </button>
          </div>
        ))}

        {tracks.length === 0 && (
          <p className="empty-message">No hay tracks. Añade uno para empezar.</p>
        )}
      </div>

      {/* Add Track Section */}
      {isAddingTrack ? (
        <div className="add-track-form">
          <select
            value={newTrackType}
            onChange={(e) => setNewTrackType(e.target.value as TrackType)}
            className="track-type-select"
          >
            {Object.entries(TRACK_TYPE_LABELS).map(([type, label]) => (
              <option key={type} value={type}>
                {label}
              </option>
            ))}
          </select>
          <div className="add-track-buttons">
            <button className="btn btn-primary" onClick={handleAddTrack}>
              Añadir
            </button>
            <button className="btn" onClick={() => setIsAddingTrack(false)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button className="add-track-btn" onClick={() => setIsAddingTrack(true)}>
          + Añadir Track
        </button>
      )}
    </div>
  );
}
