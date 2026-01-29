// ============================================
// Error Handling Utilities
// Music Composer v1.1
// ============================================

/**
 * Application error types as const object (compatible with erasableSyntaxOnly)
 */
export const ErrorType = {
  AUDIO_CONTEXT_BLOCKED: 'AUDIO_CONTEXT_BLOCKED',
  AI_MODEL_LOAD_FAILED: 'AI_MODEL_LOAD_FAILED',
  AI_GENERATION_FAILED: 'AI_GENERATION_FAILED',
  STORAGE_QUOTA_EXCEEDED: 'STORAGE_QUOTA_EXCEEDED',
  SOUNDFONT_LOAD_FAILED: 'SOUNDFONT_LOAD_FAILED',
  MIDI_PARSE_ERROR: 'MIDI_PARSE_ERROR',
  COMPOSITION_LOAD_FAILED: 'COMPOSITION_LOAD_FAILED',
  COMPOSITION_SAVE_FAILED: 'COMPOSITION_SAVE_FAILED',
  WEBGPU_NOT_SUPPORTED: 'WEBGPU_NOT_SUPPORTED',
  BROWSER_NOT_SUPPORTED: 'BROWSER_NOT_SUPPORTED',
} as const;

export type ErrorType = (typeof ErrorType)[keyof typeof ErrorType];

/**
 * Error message configuration
 */
export interface ErrorConfig {
  title: string;
  message: string;
  action: string;
  recoverable: boolean;
}

/**
 * Error messages and recovery actions
 */
export const errorMessages: Record<ErrorType, ErrorConfig> = {
  [ErrorType.AUDIO_CONTEXT_BLOCKED]: {
    title: 'Audio bloqueado',
    message: 'El navegador ha bloqueado la reproducción de audio.',
    action: 'Haz click en cualquier lugar para activar el audio',
    recoverable: true,
  },
  [ErrorType.AI_MODEL_LOAD_FAILED]: {
    title: 'Error cargando modelo IA',
    message: 'No se pudo cargar el modelo de inteligencia artificial.',
    action: 'Verifica tu conexión y que WebGPU esté habilitado. Recarga la página para reintentar.',
    recoverable: true,
  },
  [ErrorType.AI_GENERATION_FAILED]: {
    title: 'Error generando sugerencia',
    message: 'El asistente IA no pudo generar una sugerencia válida.',
    action: 'Intenta reformular tu prompt o genera de nuevo',
    recoverable: true,
  },
  [ErrorType.STORAGE_QUOTA_EXCEEDED]: {
    title: 'Almacenamiento lleno',
    message: 'No hay suficiente espacio para guardar.',
    action: 'Elimina composiciones antiguas para liberar espacio',
    recoverable: true,
  },
  [ErrorType.SOUNDFONT_LOAD_FAILED]: {
    title: 'Error cargando instrumento',
    message: 'No se pudo cargar el banco de sonidos.',
    action: 'Usando sintetizador básico como fallback',
    recoverable: true,
  },
  [ErrorType.MIDI_PARSE_ERROR]: {
    title: 'Error leyendo archivo MIDI',
    message: 'No se pudo procesar el archivo MIDI.',
    action: 'El archivo puede estar corrupto o en formato no soportado',
    recoverable: false,
  },
  [ErrorType.COMPOSITION_LOAD_FAILED]: {
    title: 'Error cargando composición',
    message: 'No se pudo cargar la composición.',
    action: 'La composición puede estar corrupta. Intenta cargar otra.',
    recoverable: true,
  },
  [ErrorType.COMPOSITION_SAVE_FAILED]: {
    title: 'Error guardando',
    message: 'No se pudo guardar la composición.',
    action: 'Verifica el espacio disponible e intenta de nuevo',
    recoverable: true,
  },
  [ErrorType.WEBGPU_NOT_SUPPORTED]: {
    title: 'WebGPU no disponible',
    message: 'Tu navegador no soporta WebGPU, necesario para la IA local.',
    action: 'Usa Chrome 113+ o Edge 113+ con WebGPU habilitado',
    recoverable: false,
  },
  [ErrorType.BROWSER_NOT_SUPPORTED]: {
    title: 'Navegador no soportado',
    message: 'Tu navegador no es compatible con esta aplicación.',
    action: 'Usa Chrome 113+, Safari 17+, o Firefox 115+',
    recoverable: false,
  },
};

/**
 * Application-specific error class
 */
export class ComposerError extends Error {
  type: ErrorType;
  config: ErrorConfig;
  originalError?: Error;

  constructor(type: ErrorType, originalError?: Error) {
    const config = errorMessages[type];
    super(config.message);
    this.name = 'ComposerError';
    this.type = type;
    this.config = config;
    this.originalError = originalError;
  }
}

/**
 * Check browser compatibility
 */
export function checkBrowserCompatibility(): ErrorType | null {
  // Check for required APIs
  if (!window.indexedDB) {
    return ErrorType.BROWSER_NOT_SUPPORTED;
  }

  if (!window.AudioContext && !(window as unknown as { webkitAudioContext?: AudioContext }).webkitAudioContext) {
    return ErrorType.BROWSER_NOT_SUPPORTED;
  }

  // Check for WebGPU (needed for AI)
  if (!('gpu' in navigator)) {
    return ErrorType.WEBGPU_NOT_SUPPORTED;
  }

  return null;
}

/**
 * Check if WebGPU is available and working
 */
export async function checkWebGPUSupport(): Promise<boolean> {
  if (!('gpu' in navigator)) {
    return false;
  }

  try {
    const gpu = navigator.gpu as GPU;
    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      return false;
    }

    const device = await adapter.requestDevice();
    device.destroy();
    return true;
  } catch {
    return false;
  }
}

/**
 * Format error for display
 */
export function formatError(error: unknown): { title: string; message: string; action: string } {
  if (error instanceof ComposerError) {
    return {
      title: error.config.title,
      message: error.config.message,
      action: error.config.action,
    };
  }

  if (error instanceof Error) {
    return {
      title: 'Error',
      message: error.message,
      action: 'Intenta de nuevo o recarga la página',
    };
  }

  return {
    title: 'Error desconocido',
    message: String(error),
    action: 'Intenta de nuevo o recarga la página',
  };
}

/**
 * Log error to console with context
 */
export function logError(context: string, error: unknown): void {
  console.error(`[${context}]`, error);

  if (error instanceof ComposerError && error.originalError) {
    console.error('Original error:', error.originalError);
  }
}

/**
 * Wrap async function with error handling
 */
export function withErrorHandling<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  errorType: ErrorType
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      throw new ComposerError(errorType, error instanceof Error ? error : undefined);
    }
  }) as T;
}
