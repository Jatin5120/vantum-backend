# Technical Debt Tracking

**Version**: 1.0.0
**Last Updated**: 2024-12-27
**Status**: Active

## Overview

This document tracks all technical debt, TODOs, and future improvements in the Vantum backend codebase. All items are categorized by priority and include clear descriptions, locations, and effort estimates.

---

## Current Technical Debt

### P1 - Important (Layer 2 Dependencies)

#### 1. Store Transcript for LLM Processing
- **Location**: `src/modules/socket/handlers/audio.handler.ts:316`
- **Description**: Final transcripts from STT need to be stored and forwarded to the LLM service for conversation processing
- **Impact**: Required for Layer 2 LLM integration. Currently transcripts are logged but not persisted or forwarded
- **Effort**: 2-3 hours (depends on LLM service design)
- **Dependencies**: LLM service implementation
- **Status**: Open
- **Created**: 2024-12-27

#### 2. Replace Audio Echo with TTS Output
- **Location**: `src/modules/socket/handlers/audio.handler.ts:324`
- **Description**: Currently audio is echoed back for testing playback pipeline. In Layer 2, this should be replaced with synthesized TTS audio from the conversation AI
- **Impact**: Required for Layer 2 TTS integration. Echo functionality is temporary for testing only
- **Effort**: 1-2 hours (depends on TTS service design)
- **Dependencies**: TTS service implementation (Cartesia)
- **Status**: Open
- **Created**: 2024-12-27

#### 3. Remove Audio Echo Streaming Function
- **Location**: `src/modules/socket/handlers/audio.handler.ts:363` (function `streamEchoedAudio`)
- **Description**: The `streamEchoedAudio()` function is temporary for testing the audio playback pipeline. Remove when real STT/LLM/TTS pipeline is implemented
- **Impact**: Code cleanup. Function serves its purpose for Layer 1 testing but should be removed in Layer 2
- **Effort**: 30 minutes (simple deletion + cleanup)
- **Dependencies**: Full Layer 2 pipeline (STT → LLM → TTS)
- **Status**: Open
- **Created**: 2024-12-27

#### 4. Remove Audio Buffer Service
- **Location**: `src/modules/socket/services/audio-buffer.service.ts:4` (entire service)
- **Description**: The entire AudioBufferService is temporary for echo/loopback testing. Remove when real STT/LLM/TTS pipeline is implemented
- **Impact**: Code cleanup. Service serves its purpose for Layer 1 testing but should be removed in Layer 2
- **Effort**: 1 hour (remove service + update imports + verify no dependencies)
- **Dependencies**: Full Layer 2 pipeline (STT → LLM → TTS)
- **Status**: Open
- **Created**: 2024-12-27
- **Notes**: Service was already removed from public exports in `services/index.ts` as part of P1 cleanup (2024-12-27)

---

## Resolved Technical Debt

### 2024-12-27

#### AudioBufferService Over-Exposure
- **Issue**: AudioBufferService was exported in public API despite being internal-only for echo testing
- **Resolution**: Removed from `src/modules/socket/services/index.ts` exports
- **Impact**: Improved encapsulation, reduced public API surface
- **Resolved By**: backend-dev

#### Premature Layer 2 Handler Exports
- **Issue**: `handleLLMError` and `handleTTSError` were exported before Layer 2 implementation
- **Resolution**: Commented out exports in `src/modules/socket/handlers/index.ts` with note to uncomment when Layer 2 services are implemented
- **Impact**: Public API only exposes implemented functionality
- **Resolved By**: backend-dev

---

## Future Enhancements (Layer 2+)

### Layer 2: AI Pipeline (In Progress)
- **LLM Integration**: OpenAI GPT-4 conversation service with streaming
- **TTS Integration**: Cartesia Text-to-Speech with audio streaming
- **Conversation Orchestration**: State machine for conversation flow (idle → speaking → thinking → responding)
- **Audio Buffer Management**: Concurrent stream handling for STT input + TTS output

### Layer 3: Production Features
- Authentication & Authorization (JWT, OAuth)
- Call Recording & Persistence
- Rate Limiting & Security
- Telephony Gateway (Twilio integration for phone calls)

### Layer 4: Analytics & Monitoring
- Analytics Dashboard
- Call Quality Metrics
- Performance Monitoring
- Usage Analytics

---

## Contributing

### When Adding New TODOs to Code:
1. Add a TODO comment in the code with clear context
2. Document it in this file under "Current Technical Debt"
3. Include location, description, priority, and effort estimate
4. Link to relevant issues/PRs if applicable

### When Resolving Technical Debt:
1. Complete the work and verify tests pass
2. Remove the TODO comment from code
3. Move the item to "Resolved Technical Debt" section
4. Include resolution date, method, and author

### Priority Definitions:
- **P0 (Critical)**: Blocking issues, security vulnerabilities, memory leaks
- **P1 (Important)**: Required for next major feature, significant technical debt
- **P2 (Nice to have)**: Code cleanup, refactoring, documentation improvements
- **P3 (Future)**: Long-term enhancements, optimizations

---

## Document Maintenance

This document should be reviewed and updated:
- When adding new TODO comments to code
- When completing technical debt items
- During sprint planning
- Before major releases
- Quarterly for long-term planning

**Document Owner**: @backend-dev
**Reviewers**: @architect, @reviewer
**Last Review**: 2024-12-27

---

## See Also

- [Architecture Overview](../architecture/architecture.md) - System design and Layer 1/2 details
- [Implementation Plan](./implementation-plan.md) - Layer 2 roadmap and phase tracking
- [WebSocket Protocol](../protocol/websocket-protocol.md) - Protocol specification
- [Folder Structure](../code/folder-structure.md) - Code organization patterns
- [Architectural Decisions](../architecture/decisions.md) - Technical decision rationale
