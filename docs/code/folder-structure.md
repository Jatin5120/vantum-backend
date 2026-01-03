# Folder Structure Documentation

**Version**: 2.0.0
**Last Updated**: 2024-12-27
**Status**: Active

## Overview

The Vantum backend follows a **feature/module-based architecture** with clear separation between shared utilities and feature modules. This structure promotes:

- **Modularity**: Each feature is self-contained
- **Scalability**: Easy to add new modules without affecting existing ones
- **Maintainability**: Clear boundaries and responsibilities
- **Reusability**: Shared utilities are easily accessible
- **Type Safety**: Barrel files provide clean, typed exports

## Current Structure

```
src/
├── index.ts                    # Application entry point
├── server.ts                   # Express + WebSocket server setup
├── modules/                     # Feature modules (self-contained)
│   ├── audio/                   # Audio processing (✅ Complete)
│   │   ├── services/
│   │   │   └── audio-resampler.service.ts   # Resampling (48kHz/8kHz → 16kHz)
│   │   └── constants/
│   │       └── audio.constants.ts
│   │
│   ├── socket/                  # WebSocket infrastructure (✅ Complete)
│   │   ├── handlers/
│   │   │   ├── index.ts        # Handler exports
│   │   │   ├── audio.handler.ts
│   │   │   ├── message.handler.ts
│   │   │   ├── error.handler.ts
│   │   │   └── handler-utils.ts
│   │   ├── services/            # Business logic services
│   │   │   ├── index.ts        # Service exports
│   │   │   ├── session.service.ts
│   │   │   ├── websocket.service.ts
│   │   │   └── websocket-utils.service.ts
│   │   ├── types/               # Module-specific types
│   │   │   ├── index.ts        # Type exports
│   │   │   ├── events.ts
│   │   │   ├── session.ts
│   │   │   └── socket.ts
│   │   ├── utils/
│   │   │   └── messagepack.utils.ts
│   │   └── socket.server.ts     # WebSocket server setup
│   │
│   ├── stt/                     # Speech-to-Text (✅ Complete)
│   │   ├── controllers/
│   │   │   └── stt.controller.ts            # API layer
│   │   ├── services/
│   │   │   ├── stt.service.ts               # Deepgram integration
│   │   │   └── stt-session.service.ts       # Per-session state
│   │   ├── types/
│   │   │   └── stt.types.ts
│   │   ├── config/
│   │   │   └── stt.config.ts
│   │   └── utils/
│   │       └── error-classifier.ts
│   │
│   ├── llm/                     # LLM Service (❌ Not Started - Future)
│   │   ├── handlers/
│   │   │   └── llm.handler.ts
│   │   ├── services/
│   │   │   └── llm.service.ts               # OpenAI API client
│   │   ├── types/
│   │   │   └── llm.types.ts
│   │   └── config/
│   │       └── llm.config.ts
│   │
│   ├── tts/                     # Text-to-Speech (❌ Not Started - Future)
│   │   ├── handlers/
│   │   │   └── tts.handler.ts
│   │   ├── services/
│   │   │   └── tts.service.ts               # Cartesia API client
│   │   ├── types/
│   │   │   └── tts.types.ts
│   │   └── config/
│   │       └── tts.config.ts
│   │
│   ├── conversation/            # Conversation Orchestration (❌ Not Started - Future)
│   │   ├── services/
│   │   │   ├── conversation.service.ts      # State machine
│   │   │   └── context.service.ts           # History management
│   │   ├── types/
│   │   │   └── conversation.types.ts
│   │   └── state/
│   │       └── conversation.state.ts
│   │
│   └── telephony/               # Twilio Integration (❌ Not Started - Future)
│       ├── handlers/
│       │   └── telephony.handler.ts
│       ├── services/
│       │   └── telephony.service.ts         # Twilio API client
│       ├── types/
│       │   └── telephony.types.ts
│       └── config/
│           └── telephony.config.ts
│
└── shared/                      # Shared across all modules
    ├── config/                  # Configuration
    │   ├── index.ts            # Config exports
    │   └── socket.ts
    ├── utils/                   # Utility functions
    │   ├── index.ts            # Utility exports
    │   ├── logger.ts
    │   └── uuid.ts
    └── types/                   # Shared types (if any)
        └── index.ts
```

## Module Status

| Module | Status | Test Coverage | Description |
|--------|--------|---------------|-------------|
| **audio** | ✅ Complete | 90%+ | Audio resampling (48kHz/8kHz → 16kHz) |
| **socket** | ✅ Complete | 85%+ | WebSocket infrastructure, session management |
| **stt** | ✅ Complete | 85%+ | Deepgram STT integration |
| **llm** | ❌ Not Started | N/A | OpenAI GPT-4 (Future - Phase 5) |
| **tts** | ❌ Not Started | N/A | Cartesia TTS (Future - Phase 6) |
| **conversation** | ❌ Not Started | N/A | State machine orchestration (Future - Phase 7) |
| **telephony** | ❌ Not Started | N/A | Twilio integration (Future - Phase 8) |

## Architecture Principles

### 1. Feature/Module-Based Organization

Each feature is organized as a **self-contained module** under `modules/`:

- **Self-contained**: All code related to a feature lives in one place
- **Clear boundaries**: Module internals are hidden behind a public API
- **Independent**: Modules can be developed and tested independently

**Example**: The `stt` module contains:

- All STT-related controllers
- All STT-related services (STTService, STTSessionService)
- All STT-related types
- All STT-related configuration
- Module initialization logic

### 2. Shared Utilities

Common functionality lives in `shared/`:

- **Configuration**: Environment variables, feature flags
- **Utilities**: Logger, UUID generation, common helpers
- **Types**: Types used across multiple modules

**Rule**: If something is used by 2+ modules, it belongs in `shared/`.

### 3. Barrel Files (Index Files)

Every directory has an `index.ts` that exports its public API:

- **Simplifies imports**: `import { logger } from '@/shared/utils'` instead of `import { logger } from '@/shared/utils/logger'`
- **Encapsulation**: Only export what should be public
- **Type safety**: Centralized type exports

**Example**:

```typescript
// modules/stt/services/index.ts - Public API only
export { sttService, STTService } from './stt.service';
export { STTSessionService } from './stt-session.service';

// Internal implementation details are NOT exported
```

### 4. Path Aliases

TypeScript path aliases provide clean imports:

```json
{
  "baseUrl": ".",
  "paths": {
    "@/*": ["src/*"],
    "@/modules/*": ["src/modules/*"],
    "@/shared/*": ["src/shared/*"]
  }
}
```

**Usage**:

- `@/shared/utils` → `src/shared/utils`
- `@/modules/stt` → `src/modules/stt`
- `@/modules/socket` → `src/modules/socket`

## Import Guidelines

### Module-Internal Imports

Within a module, use **relative imports**:

```typescript
// modules/stt/services/stt.service.ts
import { STTSessionService } from './stt-session.service';
import { STTConfig } from '../types';
import { classifyError } from '../utils/error-classifier';
```

### Cross-Module Imports

When importing from another module, use **path aliases**:

```typescript
// modules/stt/services/stt.service.ts
import { sessionService } from '@/modules/socket/services';
import { audioResamplerService } from '@/modules/audio/services';
```

### Shared Imports

Always use **path aliases** for shared code:

```typescript
// modules/stt/services/stt.service.ts
import { logger, generateId } from '@/shared/utils';
import { env } from '@/shared/config';
```

### Barrel File Imports

Always import from barrel files, not individual files:

```typescript
// ✅ Good
import { logger, generateId } from '@/shared/utils';
import { sttService } from '@/modules/stt/services';

// ❌ Bad
import { logger } from '@/shared/utils/logger';
import { sttService } from '@/modules/stt/services/stt.service';
```

## Adding a New Module

### Step 1: Create Module Structure

```bash
src/modules/
└── your-module/
    ├── index.ts           # Public API
    ├── controllers/       # (if needed)
    ├── handlers/          # (if needed)
    ├── services/          # (if needed)
    ├── types/             # (if needed)
    ├── config/            # (if needed)
    └── utils/             # (if needed)
```

### Step 2: Create Barrel Files

**`modules/your-module/index.ts`** (Public API):

```typescript
/**
 * Your Module - Public API
 * Only export what other modules should use
 */

// Public services
export { yourService, YourService } from "./services";

// Public types
export type { YourType, YourConfig } from "./types";

// Public functions
export { initializeYourModule } from "./your-module";
```

**`modules/your-module/services/index.ts`**:

```typescript
export { YourService, yourService } from "./your.service";
```

**`modules/your-module/types/index.ts`**:

```typescript
export * from "./your-types";
```

### Step 3: Use Path Aliases

Import from your module using path aliases:

```typescript
// From another module or src/index.ts
import { yourService, YourType } from "@/modules/your-module";
```

### Step 4: Follow Module Conventions

- **Controllers**: API layer (if applicable)
- **Services**: Business logic, state management
- **Handlers**: Event/request handlers (if applicable)
- **Types**: Module-specific TypeScript types
- **Config**: Module-specific configuration
- **Utils**: Module-specific utilities
- **Public API**: Only export what's needed externally

## Module Structure Examples

### Example: STT Module (Complete)

```typescript
// modules/stt/services/index.ts - Public API
export { sttService, STTService } from "./stt.service";
export { STTSessionService } from "./stt-session.service";

// modules/stt/services/stt.service.ts - Implementation
import { logger, generateId } from "@/shared/utils";
import { sessionService } from "@/modules/socket/services";
import { audioResamplerService } from "@/modules/audio/services";
import { STTConfig } from "../types";
import { classifyError } from "../utils/error-classifier";

export class STTService {
  // Implementation
}
export const sttService = new STTService();
```

### Example: Future LLM Module (Planned)

```typescript
// modules/llm/services/index.ts - Public API
export { llmService, LLMService } from "./llm.service";

// modules/llm/services/llm.service.ts - Implementation
import { logger } from "@/shared/utils";
import { LLMConfig } from "../types";

export class LLMService {
  async generateResponse(
    sessionId: string,
    messages: ConversationMessage[],
    onToken: (token: string) => void
  ): Promise<void> {
    // OpenAI GPT-4 streaming implementation
  }
}
export const llmService = new LLMService();
```

## Best Practices

### 1. Encapsulation

**✅ Do**: Keep module internals private

```typescript
// modules/stt/services/index.ts
export { sttService } from "./stt.service"; // Public
// error-classifier.ts is NOT exported - it's internal
```

**❌ Don't**: Export everything

```typescript
// ❌ Bad - exposes internals
export * from "./utils";
export * from "./services";
```

### 2. Type Safety

**✅ Do**: Use TypeScript types consistently

```typescript
import type { STTConfig } from "@/modules/stt/types";
import { logger } from "@/shared/utils";
```

**❌ Don't**: Use `any` types

```typescript
// ❌ Bad
function process(data: any) {}
```

### 3. Dependency Direction

**✅ Do**: Modules depend on shared, not on each other (unless necessary)

```
modules/socket → shared/utils
modules/stt → shared/utils, modules/socket, modules/audio
modules/llm → shared/utils
```

**❌ Don't**: Create circular dependencies

```
modules/socket → modules/stt → modules/socket  // ❌ Bad
```

### 4. Barrel File Exports

**✅ Do**: Export only what's needed

```typescript
// modules/stt/services/index.ts
export { sttService } from "./stt.service"; // Public API
// stt-session.service.ts is internal - not exported
```

**❌ Don't**: Export internal utilities

```typescript
// ❌ Bad - error-classifier is internal
export { classifyError } from "./utils/error-classifier";
```

### 5. File Naming Conventions

- **Services**: `*.service.ts` (e.g., `stt.service.ts`, `session.service.ts`)
- **Controllers**: `*.controller.ts` (e.g., `stt.controller.ts`)
- **Handlers**: `*.handler.ts` (e.g., `audio.handler.ts`)
- **Types**: `*.types.ts` (e.g., `stt.types.ts`)
- **Config**: `*.config.ts` (e.g., `stt.config.ts`)
- **Utils**: `*.utils.ts` or `*-utils.ts` (e.g., `handler-utils.ts`, `error-classifier.ts`)

## Benefits

### 1. Scalability

Adding new features is straightforward:

```
modules/
├── socket/    # ✅ Complete
├── audio/     # ✅ Complete
├── stt/       # ✅ Complete
├── llm/       # ❌ Future
├── tts/       # ❌ Future
├── conversation/ # ❌ Future
└── telephony/    # ❌ Future
```

### 2. Maintainability

- Clear boundaries: Each module is self-contained
- Easy to locate code: Feature code is grouped together
- Reduced coupling: Modules don't unnecessarily depend on each other

### 3. Developer Experience

- Clean imports: `import { logger } from '@/shared/utils'`
- Type safety: Barrel files provide typed exports
- IDE support: Path aliases work with autocomplete

### 4. Testing

- Module isolation: Test modules independently
- Mock shared utilities: Easy to mock `@/shared/utils`
- Clear test structure: Mirror module structure in tests

## References

This structure is inspired by:

- **Next.js App Router**: Feature-based organization
- **NestJS Modules**: Self-contained modules with clear APIs
- **Domain-Driven Design**: Feature-based organization
- **Popular TypeScript Projects**:
  - [TypeORM](https://github.com/typeorm/typeorm) - Feature-based modules
  - [Prisma](https://github.com/prisma/prisma) - Clear separation of concerns
  - [NestJS](https://github.com/nestjs/nest) - Module-based architecture

## Future Modules

As the project grows, the remaining modules will be implemented following the same structure:

- `modules/llm/` - Large Language Model integration (OpenAI GPT-4)
- `modules/tts/` - Text-to-Speech integration (Cartesia)
- `modules/conversation/` - Conversation orchestration and state machine
- `modules/telephony/` - Twilio phone call integration
- `modules/auth/` - Authentication and authorization (Layer 3+)
- `modules/db/` - Database access layer (Layer 3+)

Each module will follow the same structure and conventions documented here.

---

## Version History

- **v2.0.0** (2024-12-27) - Major update: Added module status table, updated for completed modules (audio, socket, stt), documented future modules
- **v1.0.0** (2024-12-17) - Initial folder structure documentation

## See Also

- [Implementation Plan](../development/implementation-plan.md) - Development phases and roadmap
- [Comprehensive Architecture](../comprehensive-architecture.md) - Complete system architecture
- [Setup Guide](../development/setup.md) - Development environment setup
