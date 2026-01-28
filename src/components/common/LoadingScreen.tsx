// ============================================
// LoadingScreen - Initial Loading State
// Music Composer v1.1
// ============================================

import './LoadingScreen.css';

interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message = 'Cargando...' }: LoadingScreenProps) {
  return (
    <div className="loading-screen">
      <div className="loading-content">
        <div className="loading-spinner" />
        <h1 className="loading-title">Music Composer</h1>
        <p className="loading-message">{message}</p>
      </div>
    </div>
  );
}
