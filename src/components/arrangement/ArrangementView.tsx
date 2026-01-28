// ============================================
// ArrangementView - Song Structure Blocks
// Music Composer v1.1
// ============================================

import { useState } from 'react';
import { useComposerStore } from '../../store/useComposerStore';
import type { BlockType, ArrangementBlock } from '../../types/composition';
import './ArrangementView.css';

const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  intro: 'Intro',
  verse: 'Verso',
  'pre-chorus': 'Pre-Estribillo',
  chorus: 'Estribillo',
  bridge: 'Puente',
  breakdown: 'Breakdown',
  outro: 'Outro',
  custom: 'Personalizado',
};

const BLOCK_TYPE_COLORS: Record<BlockType, string> = {
  intro: '#9C27B0',
  verse: '#2196F3',
  'pre-chorus': '#00BCD4',
  chorus: '#4CAF50',
  bridge: '#FF9800',
  breakdown: '#F44336',
  outro: '#607D8B',
  custom: '#795548',
};

export function ArrangementView() {
  const composition = useComposerStore((state) => state.composition);
  const addBlock = useComposerStore((state) => state.addBlock);
  const updateBlock = useComposerStore((state) => state.updateBlock);
  const deleteBlock = useComposerStore((state) => state.deleteBlock);
  const currentBeat = useComposerStore((state) => state.currentBeat);

  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [isAddingBlock, setIsAddingBlock] = useState(false);
  const [newBlockType, setNewBlockType] = useState<BlockType>('verse');

  if (!composition) return null;

  const blocks = composition.structure;
  const totalBeats = blocks.length > 0
    ? Math.max(...blocks.map((b) => b.startBeat + b.durationBeats))
    : 32;

  const beatToPercent = (beat: number) => (beat / Math.max(totalBeats, 32)) * 100;

  const handleAddBlock = () => {
    // Find the end of the last block
    const lastEnd = blocks.reduce(
      (max, b) => Math.max(max, b.startBeat + b.durationBeats),
      0
    );

    addBlock({
      type: newBlockType,
      name: BLOCK_TYPE_LABELS[newBlockType],
      startBeat: lastEnd,
      durationBeats: 16, // 4 bars default
      repeat: 1,
    });

    setIsAddingBlock(false);
  };

  const handleBlockClick = (block: ArrangementBlock) => {
    setSelectedBlockId(selectedBlockId === block.id ? null : block.id);
  };

  const handleDeleteBlock = (blockId: string) => {
    if (confirm('¿Eliminar esta sección?')) {
      deleteBlock(blockId);
      setSelectedBlockId(null);
    }
  };

  return (
    <div className="arrangement-view">
      <div className="arrangement-header">
        <h3>Estructura</h3>
        {!isAddingBlock ? (
          <button className="add-block-btn" onClick={() => setIsAddingBlock(true)}>
            + Sección
          </button>
        ) : (
          <div className="add-block-form">
            <select
              value={newBlockType}
              onChange={(e) => setNewBlockType(e.target.value as BlockType)}
            >
              {Object.entries(BLOCK_TYPE_LABELS).map(([type, label]) => (
                <option key={type} value={type}>
                  {label}
                </option>
              ))}
            </select>
            <button onClick={handleAddBlock}>Añadir</button>
            <button onClick={() => setIsAddingBlock(false)}>×</button>
          </div>
        )}
      </div>

      <div className="arrangement-timeline">
        {/* Beat markers */}
        <div className="beat-markers">
          {Array.from({ length: Math.ceil(totalBeats / 4) + 1 }, (_, i) => i * 4).map(
            (beat) => (
              <div
                key={beat}
                className="beat-marker"
                style={{ left: `${beatToPercent(beat)}%` }}
              >
                {Math.floor(beat / 4) + 1}
              </div>
            )
          )}
        </div>

        {/* Blocks */}
        <div className="blocks-container">
          {blocks.map((block) => (
            <div
              key={block.id}
              className={`arrangement-block ${selectedBlockId === block.id ? 'selected' : ''}`}
              style={{
                left: `${beatToPercent(block.startBeat)}%`,
                width: `${beatToPercent(block.durationBeats)}%`,
                backgroundColor: BLOCK_TYPE_COLORS[block.type],
              }}
              onClick={() => handleBlockClick(block)}
            >
              <span className="block-name">{block.name}</span>
              {block.repeat && block.repeat > 1 && (
                <span className="block-repeat">×{block.repeat}</span>
              )}

              {selectedBlockId === block.id && (
                <button
                  className="block-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteBlock(block.id);
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}

          {blocks.length === 0 && (
            <div className="empty-arrangement">
              Click "+ Sección" para añadir la estructura de tu canción
            </div>
          )}
        </div>

        {/* Playhead */}
        <div
          className="arrangement-playhead"
          style={{ left: `${beatToPercent(currentBeat)}%` }}
        />
      </div>

      {/* Selected block details */}
      {selectedBlockId && (
        <div className="block-details">
          {(() => {
            const block = blocks.find((b) => b.id === selectedBlockId);
            if (!block) return null;

            return (
              <>
                <label>
                  Nombre:
                  <input
                    type="text"
                    value={block.name}
                    onChange={(e) => updateBlock(block.id, { name: e.target.value })}
                  />
                </label>
                <label>
                  Duración (beats):
                  <input
                    type="number"
                    min={4}
                    step={4}
                    value={block.durationBeats}
                    onChange={(e) =>
                      updateBlock(block.id, { durationBeats: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Repeticiones:
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={block.repeat || 1}
                    onChange={(e) =>
                      updateBlock(block.id, { repeat: Number(e.target.value) })
                    }
                  />
                </label>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
