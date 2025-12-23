# Document Title

**Version**: 1.0.0  
**Last Updated**: YYYY-MM-DD  
**Status**: [Draft|Active|Deprecated]

## Overview

Brief description of what this document covers and its purpose.

> **Related Documents**: [Link to related docs if applicable]

---

## Table of Contents

1. [Section 1](#section-1)
2. [Section 2](#section-2)

---

## Section 1

Content here.

### Subsection

More content.

---

## Section 2

Content here.

---

## Code Examples

When including code examples:

```typescript
// Use proper language tags
// Follow camelCase naming convention
// Reference protocol spec for message formats
```

**Key Points**:

- Use camelCase for all field names (`eventType`, `eventId`, `sessionId`)
- Reference [WebSocket Protocol Specification](./websocket-protocol.md) for message formats
- Don't duplicate content - link to single source of truth

---

## See Also

- [WebSocket Protocol Specification](./websocket-protocol.md) - If related to protocol
- [Architecture Documentation](./architecture.md) - If related to architecture
- [API Documentation](./api.md) - If related to API
- [Documentation Index](./README.md) - All documentation files

---

## Naming Conventions

**All field names use camelCase**:

- ✅ `eventType` (not `event_type`)
- ✅ `eventId` (not `event_id`)
- ✅ `sessionId` (not `session_id`)
- ✅ `requestType` (not `request_type`)
- ✅ `utteranceId` (not `utterance_id`)

**Reference**: See [WebSocket Protocol Specification](./websocket-protocol.md#naming-convention) for complete naming guidelines.

---

## Cross-Reference Guidelines

1. **Don't Duplicate**: Reference the protocol doc instead of copying content
2. **Use Anchor Links**: Link to specific sections using `#anchor-name`
3. **Bidirectional**: If doc A links to doc B, doc B should link back (where appropriate)
4. **Related Documents**: Add "See Also" section at end of each doc

---

## Version History

| Version | Date       | Changes         |
| ------- | ---------- | --------------- |
| 1.0.0   | YYYY-MM-DD | Initial version |

---

**Last Updated**: YYYY-MM-DD  
**Maintained By**: [Team/Individual]
