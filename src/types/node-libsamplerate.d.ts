/**
 * Type declarations for node-libsamplerate
 * Native audio resampling library
 */

declare module 'node-libsamplerate' {
  export interface ResamplerOptions {
    type: 'sinc_best' | 'sinc_medium' | 'sinc_fastest' | 'zero_order_hold' | 'linear';
    channels: number;
    fromRate: number;
    toRate: number;
  }

  export class Resampler {
    constructor(options: ResamplerOptions);
    process(input: Float32Array): Float32Array;
    destroy(): void;
  }
}
