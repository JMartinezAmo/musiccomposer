// ============================================
// App - Main Application Component
// Music Composer v1.1
// ============================================

import { useEffect, useState, useCallback } from 'react';
import { useComposerStore } from './store/useComposerStore';
import { Header } from './components/layout/Header';
import { TracksPanel } from './components/tracks/TracksPanel';
import { PianoRoll } from './components/piano-roll/PianoRoll';
import { ArrangementView } from './components/arrangement/ArrangementView';
import { AIAssistant } from './components/ai-assistant/AIAssistant';
import { VersionsPanel } from './components/common/VersionsPanel';
import { LoadingScreen } from './components/common/LoadingScreen';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { checkBrowserCompatibility, checkWebGPUSupport, ErrorType, errorMessages } from './utils/errorHandling';
import './App.css';

function App() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [webGPUSupported, setWebGPUSupported] = useState<boolean | null>(null);

  const initializeAudio = useComposerStore((state) => state.initializeAudio);
  const initializeAI = useComposerStore((state) => state.initializeAI);
  const createComposition = useComposerStore((state) => state.createComposition);
  const composition = useComposerStore((state) => state.composition);
  const aiLoadProgress = useComposerStore((state) => state.aiLoadProgress);
  const aiStatus = useComposerStore((state) => state.aiStatus);

  // Initialize application
  useEffect(() => {
    const init = async () => {
      try {
        // Check browser compatibility
        const compatError = checkBrowserCompatibility();
        if (compatError && compatError !== ErrorType.WEBGPU_NOT_SUPPORTED) {
          const config = errorMessages[compatError];
          setInitError(`${config.title}: ${config.message}`);
          return;
        }

        // Check WebGPU support
        const gpuSupported = await checkWebGPUSupport();
        setWebGPUSupported(gpuSupported);

        // Initialize audio (requires user interaction, but we try anyway)
        try {
          await initializeAudio();
        } catch (e) {
          console.warn('Audio init deferred until user interaction');
        }

        // Create initial composition if none exists
        if (!composition) {
          createComposition('Nueva Composición');
        }

        setIsInitializing(false);

        // Initialize AI in background if WebGPU is available
        if (gpuSupported) {
          initializeAI().catch((e) => {
            console.warn('AI initialization failed:', e);
          });
        }
      } catch (error) {
        console.error('Initialization failed:', error);
        setInitError(error instanceof Error ? error.message : 'Error de inicialización');
      }
    };

    init();
  }, []);

  // Handle first user interaction for audio context
  const handleFirstInteraction = useCallback(async () => {
    try {
      await initializeAudio();
    } catch (e) {
      console.error('Failed to initialize audio:', e);
    }
  }, [initializeAudio]);

  // Show loading screen
  if (isInitializing) {
    return <LoadingScreen message="Iniciando aplicación..." />;
  }

  // Show error screen
  if (initError) {
    return (
      <div className="error-screen">
        <h1>Error de inicialización</h1>
        <p>{initError}</p>
        <button onClick={() => window.location.reload()}>Reintentar</button>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="app" onClick={handleFirstInteraction}>
        <Header />

        <div className="app-body">
          {/* Left Sidebar: Tracks + AI */}
          <aside className="sidebar sidebar-left">
            <TracksPanel />
            <div className="sidebar-divider" />
            <AIAssistant webGPUSupported={webGPUSupported ?? false} />
            <div className="sidebar-divider" />
            <VersionsPanel />
          </aside>

          {/* Main Content: Arrangement + Piano Roll */}
          <main className="main-content">
            <ArrangementView />
            <PianoRoll />
          </main>
        </div>

        {/* AI Loading Overlay */}
        {aiStatus === 'loading-model' && (
          <div className="ai-loading-overlay">
            <div className="ai-loading-content">
              <h3>Cargando modelo IA...</h3>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${aiLoadProgress * 100}%` }}
                />
              </div>
              <p>{Math.round(aiLoadProgress * 100)}%</p>
              <p className="ai-loading-note">
                Primera carga: ~2GB. Se cachea para próximas sesiones.
              </p>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

export default App;
