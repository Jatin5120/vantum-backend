/**
 * Deepgram Configuration
 * Central configuration for Deepgram API integration
 */

import { OUTPUT_SAMPLE_RATE } from '@/modules/audio/constants/audio.constants';

export const DEEPGRAM_CONFIG = {
  // Model Selection
  model: 'nova-2' as const,
  language: 'en-US' as const,

  // Features
  smart_format: true,
  interim_results: true,
  endpointing: 300,  // Enable voice activity detection (300ms silence = end of speech)
  utterances: false,
  vad_events: true,  // Enable Voice Activity Detection events for debugging

  // Audio Format
  // Backend resamples all audio to 16kHz before sending to Deepgram
  encoding: 'linear16' as const,
  sample_rate: OUTPUT_SAMPLE_RATE,  // 16kHz - resampled in backend
  channels: 1,

  // Performance
  punctuate: true,
  diarize: false,
  alternatives: 1,
} as const;

export interface DeepgramConfig {
  model: string;
  language: string;
  smart_format: boolean;
  interim_results: boolean;
  endpointing: number | false;
  utterances: boolean;
  encoding: string;
  sample_rate: number;
  channels: number;
  punctuate: boolean;
  diarize: boolean;
  alternatives: number;
  vad_events?: boolean;
}
