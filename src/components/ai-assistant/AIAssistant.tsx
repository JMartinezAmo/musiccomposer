// ============================================
// AIAssistant - AI Music Generation Panel
// Music Composer v1.1
// ============================================

import { useState } from 'react';
import { useComposerStore, selectPendingSuggestions } from '../../store/useComposerStore';
import type { AISuggestion } from '../../types/store';
import './AIAssistant.css';

interface AIAssistantProps {
  webGPUSupported: boolean;
}

export function AIAssistant({ webGPUSupported }: AIAssistantProps) {
  const aiStatus = useComposerStore((state) => state.aiStatus);
  const aiModelLoaded = useComposerStore((state) => state.aiModelLoaded);
  const pendingSuggestions = useComposerStore(selectPendingSuggestions);

  const initializeAI = useComposerStore((state) => state.initializeAI);
  const generateSuggestions = useComposerStore((state) => state.generateSuggestions);
  const applySuggestion = useComposerStore((state) => state.applySuggestion);
  const rejectSuggestion = useComposerStore((state) => state.rejectSuggestion);

  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setError(null);

    try {
      await generateSuggestions(prompt.trim());
      setPrompt('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error generando sugerencias');
    }
  };

  const handleLoadModel = async () => {
    setError(null);
    try {
      await initializeAI();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando modelo');
    }
  };

  // WebGPU not supported
  if (!webGPUSupported) {
    return (
      <div className="ai-assistant">
        <div className="panel-header">
          <h3>Asistente IA</h3>
        </div>
        <div className="ai-not-available">
          <p>El asistente IA requiere WebGPU.</p>
          <p className="ai-hint">
            Usa Chrome 113+ o Edge 113+ con WebGPU habilitado.
          </p>
        </div>
      </div>
    );
  }

  // Model not loaded
  if (!aiModelLoaded && aiStatus !== 'loading-model') {
    return (
      <div className="ai-assistant">
        <div className="panel-header">
          <h3>Asistente IA</h3>
        </div>
        <div className="ai-load-prompt">
          <p>El modelo de IA no está cargado.</p>
          <button className="btn btn-primary" onClick={handleLoadModel}>
            Cargar Modelo IA
          </button>
          <p className="ai-hint">
            Primera carga: ~2GB. Se guarda en caché para futuras sesiones.
          </p>
          {error && <p className="ai-error">{error}</p>}
        </div>
      </div>
    );
  }

  const pendingSuggestion = pendingSuggestions.find((s) => s.status === 'pending');

  return (
    <div className="ai-assistant">
      <div className="panel-header">
        <h3>Asistente IA</h3>
        <span className={`ai-status ${aiStatus}`}>
          {aiStatus === 'idle' && '●'}
          {aiStatus === 'generating' && '◐'}
          {aiStatus === 'error' && '○'}
        </span>
      </div>

      {/* Prompt Input */}
      <div className="ai-prompt-section">
        <textarea
          className="ai-prompt-input"
          placeholder="Describe qué quieres crear...

Ejemplos:
• 'Añade una melodía alegre en el estribillo'
• 'Haz la progresión de acordes más melancólica'
• 'Añade un bajo que siga la armonía'"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={aiStatus === 'generating'}
        />
        <button
          className="btn btn-primary ai-generate-btn"
          onClick={handleGenerate}
          disabled={aiStatus === 'generating' || !prompt.trim()}
        >
          {aiStatus === 'generating' ? 'Generando...' : 'Generar ✨'}
        </button>
      </div>

      {error && <p className="ai-error">{error}</p>}

      {/* Suggestions */}
      {pendingSuggestion && (
        <SuggestionCard
          suggestion={pendingSuggestion}
          onApply={(optionId) => applySuggestion(pendingSuggestion.id, optionId)}
          onReject={() => rejectSuggestion(pendingSuggestion.id)}
        />
      )}

      {/* History */}
      {pendingSuggestions.filter((s) => s.status !== 'pending').length > 0 && (
        <div className="ai-history">
          <h4>Historial</h4>
          {pendingSuggestions
            .filter((s) => s.status !== 'pending')
            .slice(-3)
            .reverse()
            .map((s) => (
              <div key={s.id} className={`history-item ${s.status}`}>
                <span className="history-prompt">{s.prompt.slice(0, 40)}...</span>
                <span className="history-status">
                  {s.status === 'applied' ? '✓' : '×'}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

interface SuggestionCardProps {
  suggestion: AISuggestion;
  onApply: (optionId: string) => void;
  onReject: () => void;
}

function SuggestionCard({ suggestion, onApply, onReject }: SuggestionCardProps) {
  const [selectedOption, setSelectedOption] = useState<number>(0);

  const options = suggestion.options;
  const currentOption = options[selectedOption];

  if (!currentOption) {
    return (
      <div className="suggestion-card error">
        <p>No se generaron opciones válidas.</p>
        <button className="btn" onClick={onReject}>
          Cerrar
        </button>
      </div>
    );
  }

  const temperatureLabels = ['Conservador', 'Balanceado', 'Creativo'];

  return (
    <div className="suggestion-card">
      <div className="suggestion-header">
        <span className="suggestion-prompt">"{suggestion.prompt}"</span>
      </div>

      {/* Option tabs */}
      <div className="option-tabs">
        {options.map((option, i) => (
          <button
            key={option.id}
            className={`option-tab ${selectedOption === i ? 'active' : ''}`}
            onClick={() => setSelectedOption(i)}
          >
            {temperatureLabels[i] || `Opción ${i + 1}`}
          </button>
        ))}
      </div>

      {/* Current option details */}
      <div className="option-details">
        <p className="option-annotation">{currentOption.annotation}</p>

        <div className="option-stats">
          <span>
            {currentOption.tracks.length} track{currentOption.tracks.length !== 1 ? 's' : ''}
          </span>
          <span>
            {currentOption.tracks.reduce((sum, t) => sum + t.notes.length, 0)} notas
          </span>
          <span className="confidence">
            Confianza: {Math.round(currentOption.confidence * 100)}%
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="suggestion-actions">
        <button className="btn btn-primary" onClick={() => onApply(currentOption.id)}>
          Aplicar
        </button>
        <button className="btn" onClick={onReject}>
          Rechazar
        </button>
      </div>
    </div>
  );
}
