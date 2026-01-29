// ============================================
// VersionsPanel - Snapshots & Version History
// Music Composer v1.1
// ============================================

import { useState } from 'react';
import { useComposerStore } from '../../store/useComposerStore';
import './VersionsPanel.css';

export function VersionsPanel() {
  const snapshots = useComposerStore((state) => state.snapshots);
  const createSnapshot = useComposerStore((state) => state.createSnapshot);
  const restoreSnapshot = useComposerStore((state) => state.restoreSnapshot);
  const deleteSnapshot = useComposerStore((state) => state.deleteSnapshot);

  const [isCreating, setIsCreating] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleCreateSnapshot = async () => {
    if (!snapshotName.trim()) return;

    await createSnapshot(snapshotName.trim());
    setSnapshotName('');
    setIsCreating(false);
  };

  const handleRestore = async (snapshotId: string) => {
    if (confirm('¿Restaurar esta versión? Se perderán los cambios no guardados.')) {
      await restoreSnapshot(snapshotId);
    }
  };

  const handleDelete = async (snapshotId: string) => {
    if (confirm('¿Eliminar esta versión guardada?')) {
      await deleteSnapshot(snapshotId);
    }
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString('es-ES', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="versions-panel">
      <div className="panel-header">
        <h3>Versiones</h3>
      </div>

      <div className="versions-list">
        {/* Current */}
        <div className="version-item current">
          <div className="version-icon">●</div>
          <div className="version-info">
            <span className="version-name">Actual</span>
            <span className="version-date">Sin guardar</span>
          </div>
        </div>

        {/* Snapshots */}
        {snapshots
          .slice()
          .reverse()
          .map((snapshot) => (
            <div
              key={snapshot.id}
              className={`version-item ${expandedId === snapshot.id ? 'expanded' : ''}`}
              onClick={() => setExpandedId(expandedId === snapshot.id ? null : snapshot.id)}
            >
              <div className="version-icon">○</div>
              <div className="version-info">
                <span className="version-name">{snapshot.name}</span>
                <span className="version-date">{formatDate(snapshot.createdAt)}</span>
              </div>

              {expandedId === snapshot.id && (
                <div className="version-actions">
                  <button
                    className="btn btn-small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRestore(snapshot.id);
                    }}
                  >
                    Restaurar
                  </button>
                  <button
                    className="btn btn-small danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(snapshot.id);
                    }}
                  >
                    Eliminar
                  </button>
                </div>
              )}
            </div>
          ))}

        {snapshots.length === 0 && (
          <p className="empty-message">No hay versiones guardadas</p>
        )}
      </div>

      {/* Create Snapshot */}
      {isCreating ? (
        <div className="create-snapshot-form">
          <input
            type="text"
            placeholder="Nombre de la versión..."
            value={snapshotName}
            onChange={(e) => setSnapshotName(e.target.value)}
            autoFocus
          />
          <div className="create-snapshot-actions">
            <button className="btn btn-small" onClick={handleCreateSnapshot}>
              Guardar
            </button>
            <button
              className="btn btn-small"
              onClick={() => {
                setIsCreating(false);
                setSnapshotName('');
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button className="create-snapshot-btn" onClick={() => setIsCreating(true)}>
          + Guardar versión
        </button>
      )}
    </div>
  );
}
