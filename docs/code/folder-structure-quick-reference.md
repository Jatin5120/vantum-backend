# Folder Structure - Quick Reference

**Version**: 1.0.0  
**Last Updated**: 2025-12-17  
**Status**: Active

> **⚠️ This is a quick lookup guide only. For complete details, see [Folder Structure Documentation](./folder-structure.md)**

## Directory Structure

```
src/
├── index.ts                    # Entry point
├── modules/                    # Feature modules
│   └── socket/                # Socket module
│       ├── index.ts           # Public API
│       ├── socket.server.ts
│       ├── handlers/
│       ├── services/
│       └── types/
└── shared/                     # Shared utilities
    ├── config/
    ├── utils/
    └── types/
```

## Import Patterns

### Shared Utilities

```typescript
import { logger, generateId } from "@/shared/utils";
import { env, validateEnv } from "@/shared/config";
```

### Module Imports

```typescript
import { sessionService, initializeSocketServer } from "@/modules/socket";
import type { Session, SessionState } from "@/modules/socket";
```

### Module-Internal (Relative)

```typescript
// Within modules/socket/handlers/audio.handler.ts
import { sessionService } from "../services";
import { SessionState } from "../types";
import { handlerUtils } from "./handler-utils";
```

## Path Aliases

| Alias         | Path            |
| ------------- | --------------- |
| `@/*`         | `src/*`         |
| `@/modules/*` | `src/modules/*` |
| `@/shared/*`  | `src/shared/*`  |

## Creating a New Module

1. **Create structure**:

   ```
   modules/your-module/
   ├── index.ts
   ├── services/
   ├── handlers/ (if needed)
   └── types/
   ```

2. **Create barrel files**:

   - `index.ts` - Public API only
   - `services/index.ts` - Service exports
   - `types/index.ts` - Type exports

3. **Import using alias**:
   ```typescript
   import { yourService } from "@/modules/your-module";
   ```

## Rules

- ✅ Use barrel files for imports
- ✅ Use path aliases for cross-module/shared imports
- ✅ Use relative imports within a module
- ✅ Export only public API in module `index.ts`
- ❌ Don't export internal utilities
- ❌ Don't create circular dependencies between modules

## File Naming

- Services: `*.service.ts`
- Handlers: `*.handler.ts`
- Utils: `*-utils.ts` or `*.utils.ts`
- Types: `*.ts` (e.g., `events.ts`)

## See Also

- [Full Folder Structure Documentation](./folder-structure.md) - Complete detailed documentation
- [Architecture Documentation](../architecture/architecture.md) - System architecture
- [Documentation Index](../README.md) - All documentation files
