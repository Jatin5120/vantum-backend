/**
 * Transcript Handler
 * Routes final transcripts to LLM then TTS for synthesis
 *
 * MVP BEHAVIOR: Called manually on audio.input.end (user clicks "Stop recording")
 * FUTURE: Will be called automatically on transcript.final (Phase 1+ enhancement)
 *
 * CRITICAL: This is where STT → LLM → TTS pipeline connects!
 */

import { logger } from '@/shared/utils';
import { ttsController } from '../controllers';
import { llmController } from '@/modules/llm';

/**
 * Handle final transcript from STT
 * Triggered when user clicks "Stop recording" (manual trigger in MVP)
 * Sends transcript to LLM for AI response, then routes response to TTS for synthesis
 *
 * @param transcript - Final transcript text from STT
 * @param sessionId - Session ID
 */
export async function handleFinalTranscript(transcript: string, sessionId: string): Promise<void> {
  try {
    // Validate transcript
    if (!transcript || transcript.trim().length === 0) {
      logger.warn('Empty transcript, skipping LLM', { sessionId });
      return;
    }

    // Validate TTS session exists
    if (!ttsController.hasSession(sessionId)) {
      logger.warn('TTS session not found, skipping synthesis', { sessionId });
      return;
    }

    logger.info('Final transcript received, sending to LLM', {
      sessionId,
      transcript: transcript.substring(0, 50) + '...',
      length: transcript.length,
    });

    // Step 1: Send transcript to LLM for AI response
    const llmResponse = await llmController.generateResponse(sessionId, transcript);

    logger.info('LLM response received and streamed to TTS', {
      sessionId,
      responseLength: llmResponse.text.length,
      isFallback: llmResponse.isFallback,
      preview: llmResponse.text.substring(0, 50) + '...',
    });

    // NOTE: TTS synthesis is handled by LLM semantic streaming service
    // The streaming service progressively sends chunks to TTS during LLM generation
    // No need to send complete response here - would cause duplicate audio
  } catch (error) {
    logger.error('Error handling final transcript for LLM', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
    // Fallback already handled by LLMController
    // Don't rethrow - graceful degradation
  }
}
