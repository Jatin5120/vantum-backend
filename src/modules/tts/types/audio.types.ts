/**
 * TTS Audio Types
 */

export interface AudioFormat {
  sampleRate: number;
  bitDepth: number;
  channels: number;
  encoding: 'pcm' | 'opus';
}

export interface AudioChunk {
  data: Buffer;
  sampleRate: number;
  timestamp: number;
}

export interface CartesiaAudioChunk {
  audio: Uint8Array;
  chunkId: string;
  utteranceId: string;
  isDone: boolean;
}
