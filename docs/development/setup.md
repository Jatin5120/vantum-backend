# Setup Guide

**Version**: 2.0.0
**Last Updated**: 2024-12-27
**Status**: Active

This guide will help you set up the Vantum backend development environment.

## Prerequisites

- **Node.js**: v18.x or higher
- **pnpm**: v10.25.0 or higher (recommended)
- **Git**: For version control
- **API Keys**: Deepgram (required for STT), OpenAI (future), Cartesia (future)

## Installation Steps

### 1. Install Node.js

Download and install Node.js from [nodejs.org](https://nodejs.org/).

Verify installation:

```bash
node --version  # Should be v18+ or v20+
npm --version
```

### 2. Install pnpm

Install pnpm globally:

```bash
npm install -g pnpm
```

Verify installation:

```bash
pnpm --version  # Should be 10.25.0+
```

### 3. Clone and Navigate to Project

```bash
cd /Users/jatin/Documents/Projects/Vantum/vantum-backend
```

### 4. Install Dependencies

```bash
pnpm install
```

This will install all dependencies including:
- Express.js 5.2.1
- Native `ws` WebSocket library 8.18.0
- `msgpackr` for binary MessagePack serialization
- `@deepgram/sdk` for speech-to-text
- `wave-resampler` for audio resampling
- TypeScript 5.9.3 and development tools
- Vitest 4.0.16 for testing

### 5. Environment Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and add your API keys:

```bash
# Server Configuration
PORT=3001
NODE_ENV=development

# Deepgram API Key (REQUIRED for STT - Layer 1)
DEEPGRAM_API_KEY=your_deepgram_api_key_here

# OpenAI API Key (FUTURE - Layer 2)
OPENAI_API_KEY=your_openai_api_key_here

# Cartesia API Key (FUTURE - Layer 2)
CARTESIA_API_KEY=your_cartesia_api_key_here

# Twilio Configuration (FUTURE - Production)
TWILIO_ACCOUNT_SID=your_twilio_sid_here
TWILIO_AUTH_TOKEN=your_twilio_token_here
TWILIO_PHONE_NUMBER=+1234567890
```

**Note**: Currently only `DEEPGRAM_API_KEY` is required for development. Other keys are for future Layer 2 features.

### 6. Get API Keys

#### Deepgram API Key (REQUIRED)

1. Go to [Deepgram Console](https://console.deepgram.com/)
2. Sign up or log in
3. Navigate to API Keys section
4. Create a new API key
5. Copy and add to `.env` file

**Reference**: [Deepgram Getting Started](https://developers.deepgram.com/docs/getting-started)

**Free Tier**: $200 credit, 45,000 minutes of transcription

#### OpenAI API Key (FUTURE - Layer 2)

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Sign up or log in
3. Navigate to API Keys section
4. Create a new API key
5. Copy and add to `.env` file

**Reference**: [OpenAI API Keys](https://platform.openai.com/api-keys)

**Note**: Not required until Phase 5 (LLM Integration)

#### Cartesia API Key (FUTURE - Layer 2)

1. Go to [Cartesia](https://cartesia.ai/)
2. Sign up for an account
3. Navigate to API Keys in dashboard
4. Generate a new API key
5. Copy and add to `.env` file

**Reference**: [Cartesia API Documentation](https://cartesia.ai/docs)

**Note**: Not required until Phase 6 (TTS Integration). Cartesia is the chosen TTS provider (not ElevenLabs).

#### Twilio Configuration (FUTURE - Production)

1. Go to [Twilio Console](https://www.twilio.com/console)
2. Sign up or log in
3. Get Account SID and Auth Token from dashboard
4. Purchase a phone number for outbound calls
5. Copy credentials to `.env` file

**Reference**: [Twilio Voice Setup](https://www.twilio.com/docs/voice/quickstart)

**Note**: Not required until Phase 8 (Telephony Integration)

### 7. Run Development Server

```bash
pnpm dev
```

The server should start on `http://localhost:3001`

You should see:

```
[INFO] Vantum backend server starting...
[INFO] WebSocket server initialized at /ws
[INFO] Server running on http://localhost:3001
```

### 8. Verify Setup

Test the health endpoint:

```bash
curl http://localhost:3001/health
```

Expected response:

```json
{
  "status": "ok",
  "message": "Vantum API is running"
}
```

Test WebSocket connection:

```bash
# Using wscat (install with: npm install -g wscat)
wscat -c ws://localhost:3001/ws -b

# You should receive a connection.ack message with sessionId
```

## Development Workflow

### Running in Development Mode

```bash
pnpm dev
```

This uses `nodemon` to automatically restart the server on file changes.

**What runs**:
- Express server on port 3001
- WebSocket server at `/ws`
- Binary MessagePack protocol
- Deepgram STT integration (if API key configured)
- Audio resampling (48kHz → 16kHz)

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests with UI
pnpm test:ui

# Run tests with coverage report
pnpm test:coverage

# Run tests in watch mode
pnpm test:watch
```

**Current Test Coverage**: 85%+ (20 test files, 96+ test cases)

**Test Structure**:
```
tests/
├── unit/                    # Unit tests for services/handlers
├── integration/             # Integration tests for modules
├── modules/
│   ├── audio/              # Audio resampling tests
│   ├── socket/             # WebSocket infrastructure tests
│   └── stt/                # STT integration tests (comprehensive)
└── shared/                 # Shared utility tests
```

### Building for Production

```bash
pnpm build
```

This compiles TypeScript to JavaScript in the `dist/` directory and rewrites path aliases using `tsc-alias` (see `package.json` scripts).

### Running Production Build

```bash
pnpm start
```

Runs the compiled JavaScript from `dist/` directory.

### Type Checking

```bash
pnpm typecheck
```

Runs TypeScript compiler without emitting files (checks for type errors).

## Project Structure

```
vantum-backend/
├── src/
│   ├── index.ts              # Application entry point
│   ├── server.ts             # Express + WebSocket server setup
│   ├── modules/              # Feature modules (self-contained)
│   │   ├── audio/            # Audio resampling (✅ Complete)
│   │   │   ├── services/     # AudioResamplerService
│   │   │   └── constants/    # Audio format constants
│   │   ├── socket/           # WebSocket infrastructure (✅ Complete)
│   │   │   ├── handlers/     # Event handlers (connection, audio, error)
│   │   │   ├── services/     # SessionService, WebSocketService
│   │   │   ├── types/        # Module-specific types
│   │   │   ├── utils/        # MessagePack utilities
│   │   │   └── socket.server.ts
│   │   ├── stt/              # Speech-to-Text (✅ Complete)
│   │   │   ├── controllers/  # STTController (API layer)
│   │   │   ├── services/     # STTService, STTSessionService
│   │   │   ├── types/        # Deepgram types
│   │   │   ├── config/       # Deepgram configuration
│   │   │   └── utils/        # Error classifier, helpers
│   │   ├── llm/              # LLM (❌ Not Started - Future)
│   │   ├── tts/              # TTS (❌ Not Started - Future)
│   │   ├── conversation/     # Orchestration (❌ Not Started - Future)
│   │   └── telephony/        # Twilio (❌ Not Started - Future)
│   └── shared/               # Shared across all modules
│       ├── config/           # Environment configuration
│       ├── utils/            # Logger, UUID, helpers
│       └── types/            # Shared types
├── tests/                    # Test files (mirrors src/ structure)
│   ├── unit/
│   ├── integration/
│   ├── modules/
│   └── shared/
├── docs/                     # Documentation
├── dist/                     # Compiled JavaScript (generated)
├── node_modules/             # Dependencies (generated)
├── .env                      # Environment variables (not in git)
├── .env.example              # Example environment file
├── package.json              # Project dependencies and scripts
├── tsconfig.json             # TypeScript configuration
└── vitest.config.ts          # Vitest test configuration
```

## Module Status

| Module | Status | Description |
|--------|--------|-------------|
| **socket** | ✅ Complete | WebSocket infrastructure, session management |
| **audio** | ✅ Complete | Audio resampling (48kHz/8kHz → 16kHz) |
| **stt** | ✅ Complete | Deepgram STT integration |
| **llm** | ❌ Not Started | OpenAI GPT-4 (Future - Phase 5) |
| **tts** | ❌ Not Started | Cartesia TTS (Future - Phase 6) |
| **conversation** | ❌ Not Started | State machine orchestration (Future - Phase 7) |
| **telephony** | ❌ Not Started | Twilio integration (Future - Phase 8) |

## Troubleshooting

### Port Already in Use

If port 3001 is already in use, change it in `.env`:

```
PORT=3002
```

Then restart the server.

### Module Not Found Errors

Clear node_modules and reinstall:

```bash
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### TypeScript Compilation Errors

Check TypeScript configuration and type errors:

```bash
pnpm typecheck
```

Fix any type errors reported. The project uses TypeScript strict mode (no `any` allowed).

### API Key Issues

**Deepgram API Key**:
- Ensure `DEEPGRAM_API_KEY` is correctly set in `.env`
- Verify API key is valid (test at [Deepgram Console](https://console.deepgram.com/))
- Check API key format (no extra spaces, quotes, or newlines)
- Ensure you have available credits ($200 free tier)

**Connection Errors**:
- Check that port 3001 is accessible
- Verify firewall settings allow WebSocket connections
- Test with `curl http://localhost:3001/health`

### Test Failures

Run tests with verbose output:

```bash
pnpm test -- --reporter=verbose
```

Check specific test file:

```bash
pnpm test tests/modules/stt/services/stt.service.test.ts
```

### Path Alias Issues

If imports with `@/` aren't resolving:

1. Check `tsconfig.json` has correct path aliases
2. Run `pnpm build` to trigger `tsc-alias`
3. Restart your IDE/editor

### WebSocket Connection Issues

Test WebSocket with `wscat`:

```bash
# Install wscat
npm install -g wscat

# Connect to WebSocket
wscat -c ws://localhost:3001/ws -b

# You should receive a connection.ack message
```

## Development Tips

### Path Aliases

Always use path aliases for imports:

```typescript
// ✅ Good
import { logger } from '@/shared/utils/logger';
import { sessionService } from '@/modules/socket/services';

// ❌ Bad
import { logger } from '../../../shared/utils/logger';
```

**Available Aliases**:
- `@/*` → `src/*`
- `@/modules/*` → `src/modules/*`
- `@/shared/*` → `src/shared/*`

### Code Quality

Follow these standards (enforced by Grade A - 95.25% quality):

- **Handler + Service Pattern**: Handlers stateless, services stateful
- **TypeScript Strict Mode**: No `any` types
- **Comprehensive Error Handling**: Try-catch with logging
- **Resource Cleanup**: No memory leaks (clean up on disconnect)
- **DRY Principles**: No code duplication
- **Structured Logging**: Use `logger.info/error/debug` with context

### Running Specific Tests

```bash
# Test specific module
pnpm test tests/modules/stt

# Test with pattern
pnpm test --grep "STTService"

# Watch mode for specific file
pnpm test:watch tests/modules/stt/services/stt.service.test.ts
```

### Debugging

Use VS Code debugger:

1. Set breakpoint in code
2. Run "Launch Program" debug configuration
3. Or attach to running `pnpm dev` process

Add debug logs:

```typescript
import { logger } from '@/shared/utils/logger';

logger.debug('Debug message', { sessionId, data });
```

## Next Steps

After setup, refer to:

- [Implementation Plan](./implementation-plan.md) - For development phases and roadmap
- [Comprehensive Architecture](../comprehensive-architecture.md) - For complete system design
- [WebSocket Protocol](../protocol/websocket-protocol.md) - For protocol specification
- [API Documentation](../api/api.md) - For API endpoints

## References

### Documentation

- [Node.js Documentation](https://nodejs.org/docs/)
- [pnpm Documentation](https://pnpm.io/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)
- [Vitest Documentation](https://vitest.dev/)

### External Services

- [Deepgram Documentation](https://developers.deepgram.com/)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [Cartesia Documentation](https://cartesia.ai/docs)
- [Twilio Voice Documentation](https://www.twilio.com/docs/voice)

---

## Version History

- **v2.0.0** (2024-12-27) - Major update: Added test coverage info, module status, updated for Cartesia (not ElevenLabs), added comprehensive troubleshooting
- **v1.0.0** (2024-12-17) - Initial setup guide
