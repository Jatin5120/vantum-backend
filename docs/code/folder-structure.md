# Folder Structure Documentation

**Version**: 1.0.0  
**Last Updated**: 2025-12-17  
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
├── modules/                     # Feature modules (self-contained)
│   └── socket/                  # Socket/WebSocket module
│       ├── index.ts            # Public API (barrel file)
│       ├── socket.server.ts    # WebSocket server initialization
│       ├── handlers/           # Event handlers
│       │   ├── index.ts        # Handler exports
│       │   ├── audio.handler.ts
│       │   ├── message.handler.ts
│       │   ├── error.handler.ts
│       │   └── handler-utils.ts
│       ├── services/            # Business logic services
│       │   ├── index.ts        # Service exports
│       │   ├── session.service.ts
│       │   ├── websocket.service.ts
│       │   └── websocket-utils.service.ts
│       └── types/               # Module-specific types
│           ├── index.ts        # Type exports
│           ├── events.ts
│           ├── session.ts
│           └── socket.ts
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

## Architecture Principles

### 1. Feature/Module-Based Organization

Each feature is organized as a **self-contained module** under `modules/`:

- **Self-contained**: All code related to a feature lives in one place
- **Clear boundaries**: Module internals are hidden behind a public API
- **Independent**: Modules can be developed and tested independently

**Example**: The `socket` module contains:

- All WebSocket-related handlers
- All WebSocket-related services
- All WebSocket-related types
- Module initialization logic

### 2. Shared Utilities

Common functionality lives in `shared/`:

- **Configuration**: Environment variables, feature flags
- **Utilities**: Logger, UUID generation, common helpers
- **Types**: Types used across multiple modules (currently minimal)

**Rule**: If something is used by 2+ modules, it belongs in `shared/`.

### 3. Barrel Files (Index Files)

Every directory has an `index.ts` that exports its public API:

- **Simplifies imports**: `import { logger } from '@/shared/utils'` instead of `import { logger } from '@/shared/utils/logger'`
- **Encapsulation**: Only export what should be public
- **Type safety**: Centralized type exports

**Example**:

```typescript
// modules/socket/index.ts - Public API only
export { sessionService, SessionService } from "./services";
export { initializeSocketServer } from "./socket.server";
export type { Session, SessionState } from "./types";

// Internal handlers/services are NOT exported here
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
- `@/modules/socket` → `src/modules/socket`
- `@/index.ts` → `src/index.ts`

## Import Guidelines

### Module-Internal Imports

Within a module, use **relative imports**:

```typescript
// modules/socket/handlers/audio.handler.ts
import { sessionService } from "../services";
import { SessionState } from "../types";
import { handlerUtils } from "./handler-utils";
```

### Cross-Module Imports

When importing from another module, use **path aliases**:

```typescript
// src/index.ts
import { initializeSocketServer, sessionService } from "@/modules/socket";
```

### Shared Imports

Always use **path aliases** for shared code:

```typescript
// modules/socket/services/session.service.ts
import { logger, generateId } from "@/shared/utils";
import { env } from "@/shared/config";
```

### Barrel File Imports

Always import from barrel files, not individual files:

```typescript
// ✅ Good
import { logger, generateId } from "@/shared/utils";
import { sessionService } from "@/modules/socket";

// ❌ Bad
import { logger } from "@/shared/utils/logger";
import { sessionService } from "@/modules/socket/services/session.service";
```

## Adding a New Module

### Step 1: Create Module Structure

```bash
src/modules/
└── your-module/
    ├── index.ts           # Public API
    ├── handlers/          # (if needed)
    ├── services/          # (if needed)
    ├── types/             # (if needed)
    └── your-module.ts     # Main module file
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
export type { YourType, YourEnum } from "./types";

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

- **Services**: Business logic, state management
- **Handlers**: Event/request handlers (if applicable)
- **Types**: Module-specific TypeScript types
- **Public API**: Only export what's needed externally

## Module Structure Examples

### Example: Socket Module

```typescript
// modules/socket/index.ts - Public API
export { sessionService, SessionService } from "./services";
export { initializeSocketServer } from "./socket.server";
export type { Session, SessionState } from "./types";

// modules/socket/services/session.service.ts - Internal
import { logger, generateId } from "@/shared/utils";
import { Session, SessionState } from "../types";

export class SessionService {
  // Implementation
}
export const sessionService = new SessionService();
```

### Example: Future STT Module

```typescript
// modules/stt/index.ts - Public API
export { sttService, STTService } from "./services";
export { initializeSTTConnection } from "./stt.connection";
export type { STTConfig, Transcription } from "./types";

// modules/stt/services/stt.service.ts - Internal
import { logger } from "@/shared/utils";
import { STTConfig } from "../types";

export class STTService {
  // Implementation
}
export const sttService = new STTService();
```

## Best Practices

### 1. Encapsulation

**✅ Do**: Keep module internals private

```typescript
// modules/socket/index.ts
export { sessionService } from "./services"; // Public
// handler-utils.ts is NOT exported - it's internal
```

**❌ Don't**: Export everything

```typescript
// ❌ Bad - exposes internals
export * from "./handlers";
export * from "./services";
```

### 2. Type Safety

**✅ Do**: Use TypeScript types consistently

```typescript
import type { Session } from "@/modules/socket";
import { logger } from "@/shared/utils";
```

**❌ Don't**: Use `any` types

```typescript
// ❌ Bad
function process(data: any) {}
```

### 3. Dependency Direction

**✅ Do**: Modules depend on shared, not on each other

```
modules/socket → shared/utils
modules/stt → shared/utils
modules/llm → shared/utils
```

**❌ Don't**: Create circular dependencies

```
modules/socket → modules/stt → modules/socket  // ❌ Bad
```

### 4. Barrel File Exports

**✅ Do**: Export only what's needed

```typescript
// modules/socket/index.ts
export { sessionService } from "./services"; // Public API
export type { Session } from "./types"; // Public types
```

**❌ Don't**: Export internal utilities

```typescript
// ❌ Bad - handlerUtils is internal
export { handlerUtils } from "./handlers";
```

### 5. File Naming Conventions

- **Services**: `*.service.ts` (e.g., `session.service.ts`)
- **Handlers**: `*.handler.ts` (e.g., `audio.handler.ts`)
- **Types**: `*.ts` (e.g., `events.ts`, `session.ts`)
- **Utils**: `*.utils.ts` or `*-utils.ts` (e.g., `handler-utils.ts`)
- **Config**: `*.ts` or `*.config.ts` (e.g., `socket.ts`)

## Migration from Layer-Based Structure

### Before (Layer-Based)

```
src/
├── config/
├── utils/
├── services/
│   └── socket/
├── handlers/
│   └── socket/
├── types/
└── socket/
```

### After (Feature/Module-Based)

```
src/
├── shared/
│   ├── config/
│   └── utils/
└── modules/
    └── socket/
        ├── services/
        ├── handlers/
        └── types/
```

### Key Changes

1. **Moved to shared**: `config/` → `shared/config/`, `utils/` → `shared/utils/`
2. **Grouped by feature**: Socket-related code moved to `modules/socket/`
3. **Added barrel files**: Every directory has an `index.ts`
4. **Path aliases**: Clean imports with `@/modules/*` and `@/shared/*`

## Benefits

### 1. Scalability

Adding new features is straightforward:

```
modules/
├── socket/
├── stt/        # New module
├── llm/        # New module
└── tts/        # New module
```

### 2. Maintainability

- Clear boundaries: Each module is self-contained
- Easy to locate code: Feature code is grouped together
- Reduced coupling: Modules don't depend on each other

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

As the project grows, we'll add:

- `modules/stt/` - Speech-to-Text integration (Deepgram)
- `modules/llm/` - Large Language Model integration (OpenAI)
- `modules/tts/` - Text-to-Speech integration (Cartesia)
- `modules/auth/` - Authentication and authorization
- `modules/db/` - Database access layer

Each module will follow the same structure and conventions documented here.
