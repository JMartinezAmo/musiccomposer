# Music Composer v1.1

DAW web local para composición pop/rock asistida por IA (Llama 3.2 local), que combina prompts NLP ("hazlo más melancólico") con edición tipo Piano Roll, funcionando 100% offline en MacBook Air M3.

## Requisitos del Sistema

- **Navegador**: Chrome 113+, Safari 17+, Firefox 115+
- **WebGPU**: Requerido para IA local
- **RAM**: 8GB mínimo (16GB recomendado para modelo IA)
- **Almacenamiento**: ~2GB para modelo IA + ~70MB para SoundFonts

## Instalación

```bash
npm install
npm run dev
```

## Stack Tecnológico

| Capa | Librería | Versión/Notas |
|------|----------|---------------|
| Framework | React + Vite | React 19, TypeScript 5.9 estricto |
| Estado | Zustand 5 + Immer | Undo/Redo con patrón Command |
| Audio | Tone.js 14 | Transport para timing, scheduling sample-accurate |
| Sampler | smplr | SoundFonts GM, carga lazy por instrumento |
| IA Local | WebLLM | Llama 3.2 3B Q4 (1.8GB). JSON mode nativo |
| Análisis Musical | Tonal.js 6 | Detección automática de acordes |
| Persistencia | Dexie.js 4 (IndexedDB) | Esquema versionado. Snapshots + Undo Stack |
| MIDI I/O | @tonejs/midi | Únicamente para import/export |
| Estilos | Tailwind CSS 4 | Dark theme por defecto |

---

## Principios Arquitectónicos (NO NEGOCIABLES)

1. **Source of Truth = JSON Semántico propio**, nunca MIDI crudo internamente. MIDI solo es formato de exportación.

2. **Local-First**: Todo en cliente. No hay backend, no hay APIs externas (salvo descarga inicial del modelo).

3. **Dualidad de Control**: Toda acción de IA debe ser editable nota por nota inmediatamente. No hay "bloques mágicos" opacos.

4. **Justificación Creativa**: La IA debe explicar por qué hace lo que hace (modo arreglador cercano).

5. **Desacoplamiento**: La capa de IA debe ser intercambiable (interfaz `AIMusicProvider`) para futura migración a OpenAI sin tocar lógica de negocio.

---

## Modelo de Datos Core (Canonical)

```typescript
// Estructura mínima que debe respetar TODO el código
interface Composition {
  id: string; // UUID
  version: "1.1";
  metadata: { title, author, createdAt, modifiedAt, tags };
  global: {
    tempo: number,           // BPM (20-300), mutable en tiempo real
    timeSignature: { numerator, denominator },
    key: { root, mode }      // Notación Tonal.js
  };
  structure: ArrangementBlock[]; // Intro, Estribillo, etc.
  tracks: Track[];          // Máx 16 pistas
  annotations: CreativeAnnotation[];
}

interface Track {
  id: string;
  name: string;
  type: "melody" | "chords" | "bass" | "drums" | "pad" | "arpeggio" | "custom";
  channel: 0-15;           // MIDI channel (9 reserved for drums)
  instrument: {
    soundfontId: string,
    program: 0-127,        // GM MIDI program
    bank: number
  };
  notes: Note[];           // Tiempo en beats (float), no ticks
  isMuted: boolean;
  isSolo: boolean;
  volume: 0-1;
  pan: -1 to 1;
}

interface Note {
  id: string;
  pitch: 0-127;           // MIDI number
  velocity: 1-127;
  startBeat: number;      // Beats absolutos desde inicio (0.0)
  durationBeats: number;  // En beats (1.0 = negra)
  probability?: number;   // 0.01-1.0 para humanización
}

interface ArrangementBlock {
  id: string;
  type: "intro" | "verse" | "pre-chorus" | "chorus" | "bridge" | "breakdown" | "outro" | "custom";
  name: string;
  startBeat: number;
  durationBeats: number;
  repeat?: number;        // Repeticiones
  localKey?: Key;         // Override de tonalidad
  localTempo?: number;    // Override de tempo
}

interface Snapshot {
  id: string;
  name: string;           // "Antes de cambio a Jazz"
  createdAt: string;
  compositionJSON: string; // Deep copy serializada
}
```

---

## Estructura del Proyecto

```
src/
├── components/          # Componentes React
│   ├── Header.tsx       # Transporte, tempo, tonalidad
│   ├── TracksPanel.tsx  # Lista de tracks, mute/solo/volume
│   ├── PianoRoll.tsx    # Editor de notas (canvas-based)
│   ├── ArrangementView.tsx  # Timeline de estructura
│   ├── AIAssistant.tsx  # Interface con IA
│   └── VersionsPanel.tsx    # Snapshots
├── store/
│   └── useComposerStore.ts  # Estado global Zustand
├── engine/
│   └── AudioEngine.ts   # Tone.js + smplr
├── ai/
│   └── AIOrchestrator.ts    # WebLLM integration
├── services/
│   └── HarmonyService.ts    # Tonal.js wrapper
├── persistence/
│   └── db.ts            # Dexie.js (IndexedDB)
├── export/
│   └── midiExporter.ts  # MIDI import/export
├── types/
│   └── composition.ts   # Tipos TypeScript
└── utils/
    └── errorHandling.ts # Manejo de errores
```

---

## Características Principales

- **Piano Roll**: Editor visual de notas con grid, snap-to-grid, zoom
- **Arrangement View**: Organización por bloques (intro, verso, estribillo)
- **AI Assistant**: Generación de música con prompts en lenguaje natural
- **Tracks**: Hasta 16 pistas con instrumentos GM
- **Undo/Redo**: Historial de acciones con patrón Command
- **Snapshots**: Versionado manual de composiciones
- **MIDI Export/Import**: Compatibilidad con otros DAWs
- **Persistencia Local**: Todo guardado en IndexedDB

---

## Licencia

MIT
