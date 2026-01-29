// ============================================
// AIOrchestrator - WebLLM Music Generation
// Music Composer v1.1
// ============================================

import * as webllm from '@mlc-ai/web-llm';
import { v4 as uuidv4 } from 'uuid';
import type {
  Track,
  TrackType,
  Note,
  InstrumentConfig,
} from '../types/composition';
import type { AISuggestionOption, CompositionContext } from '../types/store';
import { AudioEngine } from '../engine/AudioEngine';

/**
 * Raw track from AI response
 */
interface RawTrack {
  type?: string;
  notes?: Array<{
    pitch?: number;
    velocity?: number;
    startBeat?: number;
    durationBeats?: number;
  }>;
  chordTrack?: Array<{
    symbol?: string;
    startBeat?: number;
    durationBeats?: number;
  }>;
}

/**
 * Raw AI response structure before validation
 */
interface RawAIResponse {
  tracks?: RawTrack[];
  annotation?: string;
  confidence?: number;
}

/**
 * AIOrchestrator - Manages WebLLM and music generation
 *
 * CRITICAL:
 * - WebLLM does NOT have guaranteed JSON mode
 * - Implement robust parsing with retry
 * - Cache model in Cache API (~2GB)
 */
class AIOrchestrator {
  private engine: webllm.MLCEngine | null = null;
  private isInitializing = false;
  private initializationPromise: Promise<void> | null = null;

  // Recommended model for speed/quality balance
  // Note: Model availability may change, fallback to alternatives
  private readonly MODEL_IDS = [
    'Llama-3.2-3B-Instruct-q4f32_1-MLC',
    'Llama-3.1-8B-Instruct-q4f32_1-MLC',
    'Mistral-7B-Instruct-v0.3-q4f32_1-MLC',
  ];

  // Retry limits for JSON parsing
  private readonly MAX_PARSE_RETRIES = 2;

  // Temperature presets
  private readonly TEMPERATURES = {
    conservative: 0.6,
    balanced: 0.8,
    creative: 1.0,
  };

  /**
   * Initialize model with caching
   */
  async initialize(onProgress?: (progress: number) => void): Promise<void> {
    if (this.engine) return;

    // Prevent multiple concurrent initializations
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.isInitializing = true;

    this.initializationPromise = (async () => {
      let lastError: Error | null = null;

      // Try each model in order until one works
      for (const modelId of this.MODEL_IDS) {
        try {
          console.log(`Attempting to load model: ${modelId}`);

          this.engine = await webllm.CreateMLCEngine(modelId, {
            initProgressCallback: (report) => {
              onProgress?.(report.progress);
              console.log(`Model loading: ${(report.progress * 100).toFixed(1)}%`);
            },
          });

          console.log(`Successfully loaded model: ${modelId}`);
          return;
        } catch (error) {
          lastError = error as Error;
          console.warn(`Failed to load ${modelId}:`, error);
        }
      }

      throw lastError || new Error('Failed to load any AI model');
    })();

    try {
      await this.initializationPromise;
    } finally {
      this.isInitializing = false;
      this.initializationPromise = null;
    }
  }

  /**
   * Check if model is ready
   */
  isReady(): boolean {
    return this.engine !== null;
  }

  /**
   * Check if model is currently loading
   */
  isLoading(): boolean {
    return this.isInitializing;
  }

  /**
   * Generate multiple options with different temperatures
   */
  async generateOptions(
    userPrompt: string,
    context: CompositionContext,
    numOptions: number = 3
  ): Promise<AISuggestionOption[]> {
    if (!this.engine) {
      throw new Error('AI not initialized. Call initialize() first.');
    }

    const options: AISuggestionOption[] = [];
    const temperatures = [
      this.TEMPERATURES.conservative,
      this.TEMPERATURES.balanced,
      this.TEMPERATURES.creative,
    ];

    for (let i = 0; i < numOptions; i++) {
      const temp = temperatures[i] || this.TEMPERATURES.balanced;

      try {
        const response = await this.generateWithRetry(userPrompt, context, temp);
        options.push({
          id: uuidv4(),
          ...response,
          temperatureUsed: temp,
        });
      } catch (error) {
        console.error(`Failed to generate option ${i + 1}:`, error);
        // Continue with other options
      }
    }

    if (options.length === 0) {
      throw new Error('Failed to generate any valid options');
    }

    return options;
  }

  /**
   * Generate a single suggestion
   */
  async generateSingle(
    userPrompt: string,
    context: CompositionContext,
    temperature: number = 0.8
  ): Promise<AISuggestionOption> {
    if (!this.engine) {
      throw new Error('AI not initialized. Call initialize() first.');
    }

    const response = await this.generateWithRetry(userPrompt, context, temperature);
    return {
      id: uuidv4(),
      ...response,
      temperatureUsed: temperature,
    };
  }

  /**
   * Generation with retry for handling invalid JSON
   */
  private async generateWithRetry(
    userPrompt: string,
    context: CompositionContext,
    temperature: number
  ): Promise<Omit<AISuggestionOption, 'id' | 'temperatureUsed'>> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.MAX_PARSE_RETRIES; attempt++) {
      const systemPrompt = this.buildSystemPrompt(attempt > 0);
      const userMessage = this.buildUserPrompt(userPrompt, context);

      try {
        const response = await this.engine!.chat.completions.create({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature,
          max_tokens: 2000,
          // NOTE: Do NOT use response_format: "json" - not reliable in WebLLM
        });

        const content = response.choices[0]?.message?.content || '';

        return this.parseResponse(content, context);
      } catch (error) {
        lastError = error as Error;
        console.warn(`Parse attempt ${attempt + 1} failed:`, error);
      }
    }

    throw lastError || new Error('Failed to parse AI response');
  }

  /**
   * Build system prompt
   */
  private buildSystemPrompt(isRetry: boolean): string {
    const retryClause = isRetry
      ? '\n\nTU RESPUESTA ANTERIOR TENÍA JSON INVÁLIDO. ASEGÚRATE DE QUE EL JSON ESTÉ COMPLETO Y BIEN FORMADO.'
      : '';

    return `Eres un arreglista musical profesional. Generas estructuras musicales en formato JSON.

REGLAS CRÍTICAS:
1. Responde SOLO con JSON válido. Sin texto antes ni después del JSON.
2. El JSON debe seguir exactamente el schema proporcionado.
3. Incluye siempre el campo "annotation" explicando tu decisión creativa en primera persona.
4. Respeta la tonalidad y tempo del contexto proporcionado.
5. Velocidades MIDI: 60-90 para pasajes suaves, 90-127 para intensos.
6. Duraciones en beats (números decimales permitidos, ej: 0.5, 1.5).
7. Los pitches son números MIDI: 60=C4, 62=D4, 64=E4, 65=F4, 67=G4, 69=A4, 71=B4.

SCHEMA REQUERIDO:
{
  "tracks": [{
    "type": "melody" | "chords" | "bass" | "drums" | "pad" | "arpeggio",
    "notes": [{"pitch": number, "velocity": number, "startBeat": number, "durationBeats": number}],
    "chordTrack": [{"symbol": string, "startBeat": number, "durationBeats": number}]
  }],
  "annotation": "string - explicación creativa de tus decisiones",
  "confidence": number
}

NOTAS:
- chordTrack es SOLO para tracks de tipo "chords"
- confidence debe ser entre 0 y 1 (ej: 0.8)
- Genera contenido musical interesante y musicalmente coherente${retryClause}`;
  }

  /**
   * Build user prompt with context
   */
  private buildUserPrompt(userPrompt: string, context: CompositionContext): string {
    const existingTrackInfo =
      context.existingTracks.length > 0
        ? `Tracks existentes: ${context.existingTracks.map((t) => `${t.type} (${t.notes.length} notas)`).join(', ')}`
        : 'No hay tracks existentes';

    const blockInfo = context.currentBlock
      ? `Sección actual: ${context.currentBlock.name} (${context.currentBlock.type})`
      : 'Sin sección definida';

    return `CONTEXTO DE LA COMPOSICIÓN:
- Tonalidad: ${context.key.root} ${context.key.mode}
- Tempo: ${context.tempo} BPM
- Compás: ${context.timeSignature.numerator}/${context.timeSignature.denominator}
- ${blockInfo}
- ${existingTrackInfo}

SOLICITUD DEL USUARIO:
"${userPrompt}"

Genera el JSON con tu sugerencia musical:`;
  }

  /**
   * Robust parser to extract and validate JSON from response
   */
  private parseResponse(
    content: string,
    _context: CompositionContext
  ): Omit<AISuggestionOption, 'id' | 'temperatureUsed'> {
    // Try to extract JSON from the response
    let jsonStr = content.trim();

    // If there's text before/after the JSON, try to extract it
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    let parsed: RawAIResponse;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      // Try to fix common JSON issues
      jsonStr = this.attemptJsonFix(jsonStr);
      parsed = JSON.parse(jsonStr);
    }

    // Basic schema validation
    if (!parsed.tracks || !Array.isArray(parsed.tracks)) {
      throw new Error('Missing or invalid "tracks" array');
    }

    // Ensure annotation exists
    const annotation =
      typeof parsed.annotation === 'string' && parsed.annotation.length > 0
        ? parsed.annotation
        : 'Sugerencia musical generada por IA.';

    // Convert to internal format with validation
    const tracks = parsed.tracks
      .map((t) => this.parseAndValidateTrack(t))
      .filter((t): t is Track => t !== null);

    if (tracks.length === 0) {
      throw new Error('No valid tracks in response');
    }

    return {
      tracks,
      annotation,
      confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.7,
    };
  }

  /**
   * Attempt to fix common JSON formatting issues
   */
  private attemptJsonFix(jsonStr: string): string {
    // Remove trailing commas before closing brackets
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');

    // Fix unquoted keys (simple cases)
    jsonStr = jsonStr.replace(/(\{|,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

    // Fix single quotes to double quotes
    jsonStr = jsonStr.replace(/'/g, '"');

    return jsonStr;
  }

  /**
   * Parse and validate a single track
   */
  private parseAndValidateTrack(raw: RawTrack): Track | null {
    if (!raw) return null;

    const type = this.validateTrackType(raw.type);
    const notes = this.parseNotes(raw.notes || []);

    // Skip empty tracks
    if (notes.length === 0 && (!raw.chordTrack || raw.chordTrack.length === 0)) {
      return null;
    }

    return {
      id: uuidv4(),
      name: `AI ${type.charAt(0).toUpperCase() + type.slice(1)}`,
      type,
      channel: AudioEngine.getDefaultChannel(type),
      instrument: this.getDefaultInstrument(type),
      isMuted: false,
      isSolo: false,
      volume: 0.8,
      pan: 0,
      notes,
      chordTrack:
        type === 'chords' && raw.chordTrack
          ? raw.chordTrack
              .filter((c: { symbol?: string; startBeat?: number; durationBeats?: number }) =>
                c.symbol && typeof c.startBeat === 'number' && typeof c.durationBeats === 'number')
              .map((c: { symbol?: string; startBeat?: number; durationBeats?: number }) => ({
                id: uuidv4(),
                symbol: c.symbol!,
                startBeat: c.startBeat!,
                durationBeats: c.durationBeats!,
              }))
          : undefined,
    };
  }

  /**
   * Validate and normalize track type
   */
  private validateTrackType(type?: string): TrackType {
    const validTypes: TrackType[] = ['melody', 'chords', 'bass', 'drums', 'pad', 'arpeggio', 'custom'];
    if (type && validTypes.includes(type as TrackType)) {
      return type as TrackType;
    }
    return 'melody';
  }

  /**
   * Parse and validate notes array
   */
  private parseNotes(
    rawNotes: Array<{ pitch?: number; velocity?: number; startBeat?: number; durationBeats?: number }>
  ): Note[] {
    return rawNotes
      .filter((n) => {
        // Validate required fields
        return (
          typeof n.pitch === 'number' &&
          typeof n.startBeat === 'number' &&
          typeof n.durationBeats === 'number'
        );
      })
      .map((n) => ({
        id: uuidv4(),
        pitch: Math.max(0, Math.min(127, Math.round(n.pitch!))),
        velocity: Math.max(1, Math.min(127, Math.round(n.velocity ?? 80))),
        startBeat: Math.max(0, n.startBeat!),
        durationBeats: Math.max(0.01, n.durationBeats!),
        probability: 1.0,
      }));
  }

  /**
   * Get default instrument config for track type
   */
  private getDefaultInstrument(type: TrackType): InstrumentConfig {
    return {
      soundfontId: 'default',
      program: AudioEngine.getDefaultProgram(type),
      bank: type === 'drums' ? 128 : 0,
    };
  }

  /**
   * Dispose of the engine
   */
  async dispose(): Promise<void> {
    if (this.engine) {
      // WebLLM engines can be reset
      await this.engine.resetChat();
      this.engine = null;
    }
  }

  /**
   * Get chat completion for non-music prompts (explanations, etc.)
   */
  async chat(prompt: string): Promise<string> {
    if (!this.engine) {
      throw new Error('AI not initialized');
    }

    const response = await this.engine.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'Eres un asistente musical experto que ayuda con teoría musical y composición.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    return response.choices[0]?.message?.content || '';
  }
}

// Export singleton instance
export const aiOrchestrator = new AIOrchestrator();

// Export class for testing
export { AIOrchestrator };
