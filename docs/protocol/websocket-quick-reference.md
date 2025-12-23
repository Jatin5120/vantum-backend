# WebSocket Protocol Quick Reference

**Version**: 1.0.0  
**Last Updated**: 2025-12-17  
**Status**: Active

> **⚠️ This is a quick lookup guide only. For complete specification, see [websocket-protocol.md](./websocket-protocol.md)**  
> **All details, examples, and rules are defined in the main protocol document.**

## When to Use This

Use this quick reference when you need to:

- Quickly check message format templates
- Look up field requirements
- Verify naming conventions (camelCase)
- Find common event types

**For complete details, examples, and validation rules**, always refer to the [full protocol specification](./websocket-protocol.md).

## Quick Templates

### Request (Client → Server)

```typescript
{ eventType: string, eventId: string, sessionId: string, payload: object }
```

See: [Request Messages](./websocket-protocol.md#1-request-messages-client--server)

### ACK Response (Server → Client)

```typescript
{ eventType: string, eventId: string, sessionId: string, payload: { success: true } }
// All fields echo request values
```

See: [ACK Response Messages](./websocket-protocol.md#2-ack-response-messages-server--client)

### Regular Response (Server → Client)

```typescript
{ eventType: string, eventId: string, sessionId: string, payload: object }
// eventId and sessionId echo request values
```

See: [Regular Response Messages](./websocket-protocol.md#3-regular-response-messages-server--client)

### Response Chunk (Server → Client)

```typescript
{ eventType: "voicechat.response.chunk", eventId: string, sessionId: string, payload: { audio, utteranceId, sampleRate } }
// Same eventId for all chunks, unique utteranceId per chunk
```

See: [Response Chunks](websocket-protocol.md#response-chunks-special-format)

### Error Response (Server → Client)

```typescript
{ eventType: string, eventId: string, sessionId: string, requestType: string, payload: { message: string } }
// requestType at top level, payload only has message
```

See: [Error Response Messages](websocket-protocol.md#4-error-response-messages-server--client)

### Connection ACK (Server → Client)

```typescript
{ eventType: "connection.ack", eventId: string, sessionId: string, payload: { success: true } }
// New eventId (not a response to request)
```

See: [Connection ACK](./websocket-protocol.md#5-connection-ack-special-case)

---

## Common Event Types

See: [Event Types](./websocket-protocol.md#event-types)

- Client → Server: `voicechat.audio.start`, `voicechat.audio.chunk`, `voicechat.audio.end`
- Server → Client: `connection.ack`, `voicechat.response.*`, `voicechat.*.error`, `error.unknown`

---

## Field Naming

**All fields use camelCase** - See: [Naming Convention](./websocket-protocol.md#naming-convention)

| Correct       | Wrong          |
| ------------- | -------------- |
| `eventType`   | `event_type`   |
| `eventId`     | `event_id`     |
| `sessionId`   | `session_id`   |
| `requestType` | `request_type` |
| `utteranceId` | `utterance_id` |

---

## Field Requirements

See: [Field Requirements](./websocket-protocol.md#field-requirements)

| Field         | Request  | ACK       | Response  | Error          | Conn ACK    |
| ------------- | -------- | --------- | --------- | -------------- | ----------- |
| `eventType`   | ✅       | ✅ (same) | ✅        | ✅ (converted) | ✅          |
| `eventId`     | ✅ (new) | ✅ (same) | ✅ (same) | ✅ (same)      | ✅ (new)    |
| `sessionId`   | ✅       | ✅ (same) | ✅ (same) | ✅ (same)      | ✅ (server) |
| `requestType` | ❌       | ❌        | ❌        | ✅ (top level) | ❌          |
| `payload`     | ✅       | ✅        | ✅        | ✅             | ✅          |

---

## Key Concepts

### Chunk Ordering

- Same `eventId` for all chunks in a response
- Unique `utteranceId` per chunk (time-ordered UUIDv7)
- No `sequenceNumber` field
- See: [Response Chunks](./websocket-protocol.md#response-chunks-special-format)

### Error Format

- `requestType` at top level (not in payload)
- `payload` only contains `{ message: string }`
- See: [Error Response Messages](./websocket-protocol.md#4-error-response-messages-server--client)

---

## Links

- **[Full Protocol Specification](./websocket-protocol.md)** - Complete documentation (single source of truth)
- [API Documentation](../api/api.md) - REST + WebSocket overview
- [Architecture Documentation](../architecture/architecture.md) - System architecture

---

**Version**: 1.0.0  
**Last Updated**: 2025-12-17  
**Status**: Active
