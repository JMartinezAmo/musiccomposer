# Music Composer - AI-Assisted Music Composition

A web-based music composition application with AI assistance, designed for intermediate pop/rock producers. Built with a local-first architecture using WebLLM for on-device AI processing.

## Features

- **AI-Assisted Composition**: Generate musical ideas using local LLM (Llama 3.2 via WebLLM)
- **Piano Roll Editor**: Full-featured note editing with snap-to-grid
- **Multi-Track Support**: Up to 16 tracks with different instruments
- **Harmony Analysis**: Real-time chord detection and scale highlighting
- **MIDI Import/Export**: Standard MIDI file support
- **Version History**: Automatic snapshots before AI changes
- **Local-First**: All processing happens in your browser

## Tech Stack

- **Framework**: React 18+ with TypeScript
- **Build Tool**: Vite
- **State Management**: Zustand with Immer
- **Audio Engine**: Tone.js v14 + smplr (SoundFont playback)
- **AI**: WebLLM (Llama 3.2 3B)
- **Music Theory**: Tonal.js
- **Persistence**: IndexedDB via Dexie.js
- **MIDI**: @tonejs/midi

## System Requirements

- **Browser**: Chrome 113+ / Edge 113+ (WebGPU required for AI)
- **RAM**: 8GB minimum
- **Storage**: ~3GB for AI model + SoundFonts

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Project Structure

```
src/
├── ai/                 # AI Orchestrator (WebLLM integration)
├── components/         # React UI components
│   ├── ai-assistant/   # AI prompt interface
│   ├── arrangement/    # Song structure view
│   ├── common/         # Shared components
│   ├── layout/         # App header/layout
│   ├── piano-roll/     # Note editor
│   └── tracks/         # Track list panel
├── engine/             # Audio engine (Tone.js)
├── export/             # MIDI import/export
├── persistence/        # IndexedDB (Dexie.js)
├── services/           # Music theory (Tonal.js)
├── store/              # Zustand state management
├── types/              # TypeScript definitions
└── utils/              # Error handling utilities
```

## Architecture Highlights

- **Dual Control**: Use natural language prompts or direct piano roll editing
- **Creative Justification**: AI explains its musical decisions
- **Command Pattern**: Full undo/redo support
- **Modular Design**: Prepared for future cloud AI integration

## License

Private - All rights reserved
