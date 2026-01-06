/**
 * Transcript Handler
 * Routes final transcripts to TTS for synthesis
 *
 * MVP BEHAVIOR: Called manually on audio.input.end (user clicks "Stop recording")
 * FUTURE: Will be called automatically on transcript.final (Phase 1+ enhancement)
 *
 * CRITICAL: This is where STT/Audio Handler connects to TTS!
 * Future LLM insertion only changes this handler - TTS remains unchanged
 */

import { logger } from '@/shared/utils';
import { ttsController } from '../controllers';

/**
 * Handle final transcript from STT
 * Triggered when user clicks "Stop recording" (manual trigger in MVP)
 * Routes transcript to TTS for synthesis
 *
 * @param transcript - Final transcript text from STT
 * @param sessionId - Session ID
 */
export async function handleFinalTranscript(
  transcript: string,
  sessionId: string
): Promise<void> {
  try {
    logger.info('Final transcript received for TTS', {
      sessionId,
      transcript: transcript.substring(0, 50) + '...',
      length: transcript.length,
    });

    // Validate transcript
    if (!transcript || transcript.trim().length === 0) {
      logger.warn('Empty transcript, skipping TTS', { sessionId });
      return;
    }

    // Validate session exists
    if (!ttsController.hasSession(sessionId)) {
      logger.warn('TTS session not found, skipping synthesis', { sessionId });
      return;
    }

    // Send to TTS for synthesis (echo mode)
    await ttsController.synthesize(sessionId, transcript);

    logger.info('Transcript sent to TTS for synthesis', {
      sessionId,
      textLength: transcript.length,
    });
  } catch (error) {
    logger.error('Error handling final transcript for TTS', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
    // Don't rethrow - graceful degradation (conversation continues even if TTS fails)
  }
}

/**
 * Future LLM Integration (NOT IMPLEMENTED YET)
 *
 * When LLM is integrated, this handler will change to:
 *
 * export async function handleFinalTranscript(
 *   transcript: string,
 *   sessionId: string
 * ): Promise<void> {
 *   // Step 1: Send transcript to LLM
 *   const llmResponse = await llmController.generateResponse(sessionId, transcript);
 *
 *   // Step 2: Send LLM response to TTS (SAME API as echo mode)
 *   await ttsController.synthesize(sessionId, llmResponse.text);
 * }
 *
 * ZERO TTS REFACTORING REQUIRED!
 */
