// ============================================
// KeyboardShortcutsModal - Keyboard Shortcuts Help
// Music Composer v1.1
// ============================================

import { useEffect, useRef } from 'react';
import './KeyboardShortcutsModal.css';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[]; description: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Transporte',
    shortcuts: [
      { keys: ['Space'], description: 'Reproducir / Pausar' },
      { keys: ['Enter'], description: 'Detener y volver al inicio' },
    ],
  },
  {
    title: 'Edición',
    shortcuts: [
      { keys: ['⌘', 'Z'], description: 'Deshacer' },
      { keys: ['⌘', '⇧', 'Z'], description: 'Rehacer' },
      { keys: ['⌘', 'S'], description: 'Guardar composición' },
      { keys: ['Delete'], description: 'Eliminar notas seleccionadas' },
      { keys: ['Esc'], description: 'Deseleccionar todo' },
    ],
  },
  {
    title: 'Piano Roll',
    shortcuts: [
      { keys: ['Click'], description: 'Crear nota / Seleccionar nota' },
      { keys: ['⇧', 'Click'], description: 'Añadir a selección' },
      { keys: ['⌘', 'Scroll'], description: 'Zoom horizontal' },
      { keys: ['Scroll'], description: 'Desplazar timeline' },
    ],
  },
  {
    title: 'Navegación',
    shortcuts: [
      { keys: ['?'], description: 'Mostrar esta ayuda' },
    ],
  },
];

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLButtonElement>(null);

  // Focus trap and close on Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    // Focus the close button when modal opens
    firstFocusableRef.current?.focus();

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="shortcuts-modal-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-modal-title"
    >
      <div className="shortcuts-modal" ref={modalRef}>
        <div className="shortcuts-modal-header">
          <h2 id="shortcuts-modal-title">Atajos de teclado</h2>
          <button
            ref={firstFocusableRef}
            className="shortcuts-modal-close"
            onClick={onClose}
            aria-label="Cerrar modal de atajos"
          >
            ×
          </button>
        </div>

        <div className="shortcuts-modal-content">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title} className="shortcuts-group">
              <h3 className="shortcuts-group-title">{group.title}</h3>
              <ul className="shortcuts-list">
                {group.shortcuts.map((shortcut, index) => (
                  <li key={index} className="shortcut-item">
                    <span className="shortcut-keys">
                      {shortcut.keys.map((key, keyIndex) => (
                        <span key={keyIndex}>
                          <kbd className="shortcut-key">{key}</kbd>
                          {keyIndex < shortcut.keys.length - 1 && (
                            <span className="shortcut-plus">+</span>
                          )}
                        </span>
                      ))}
                    </span>
                    <span className="shortcut-description">{shortcut.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="shortcuts-modal-footer">
          <p className="shortcuts-note">
            En Mac usa ⌘ (Command). En Windows/Linux usa Ctrl.
          </p>
        </div>
      </div>
    </div>
  );
}
