# API Documentation

**Version**: 1.0.0  
**Last Updated**: 2025-12-17  
**Status**: Active

## Overview

This document describes the REST endpoint and WebSocket protocol for the Vantum backend.

## Getting Started

**New to the API?** Start here:

1. **REST API**: See [REST API Endpoints](#rest-api-endpoints) for HTTP endpoints
2. **WebSocket API**: See [WebSocket API](#websocket-api) for real-time communication
3. **Protocol Details**: For complete WebSocket protocol specification, see [WebSocket Protocol Specification](../protocol/websocket-protocol.md)
4. **Quick Reference**: For fast lookup, see [WebSocket Quick Reference](../protocol/websocket-quick-reference.md)

## REST API Endpoints

### Health Check

**GET** `/health`

Check if the server is running.

**Response**:

```json
{
  "status": "ok",
  "message": "Vantum API is running"
}
```

**Status Codes**:

- `200 OK`: Server is running

---

## WebSocket API

The backend uses a **native WebSocket (`ws`) server** with a **MessagePack** protocol for real-time communication.

- Connection URL: `ws://<host>:<port>/ws` (for local dev: `ws://localhost:3001/ws`)
- Transport: WebSocket (RFC 6455)
- Framing: Binary MessagePack using a shared envelope

> **📖 For complete protocol specification, see [websocket-protocol.md](../protocol/websocket-protocol.md)**  
> **⚡ For quick reference, see [websocket-quick-reference.md](../protocol/websocket-quick-reference.md)**

### Message Structure

All messages follow the base structure defined in the [protocol specification](../protocol/websocket-protocol.md#base-message-structure). See the protocol document for complete details on:

- Base message structure
- Field requirements
- Naming conventions (camelCase)
- Validation rules

---

### Client → Server Events

These events are sent by the frontend to the backend WebSocket server.

See [Request Messages](../protocol/websocket-protocol.md#1-request-messages-client--server) in the protocol specification for complete details and examples.

#### VOICECHAT_AUDIO_START

- **Event type**: `voicechat.audio.start`
- **Purpose**: Start an audio session / configure audio parameters
- **Payload**: `{ samplingRate?: number, language?: string, voiceId?: string }`

See [complete example](../protocol/websocket-protocol.md#example-2-audio-session-start) in protocol specification.

#### VOICECHAT_AUDIO_CHUNK

- **Event type**: `voicechat.audio.chunk`
- **Purpose**: Stream raw PCM audio to the backend
- **Payload**: `{ audio: Uint8Array, isMuted?: boolean }`

See [protocol specification](../protocol/websocket-protocol.md#1-request-messages-client--server) for details.

#### VOICECHAT_AUDIO_END

- **Event type**: `voicechat.audio.end`
- **Purpose**: Signal end of user audio for the current turn
- **Payload**: `{}` (empty object)

See [protocol specification](../protocol/websocket-protocol.md#1-request-messages-client--server) for details.

---

### Server → Client Events

These events are emitted by the backend and consumed by the frontend WebSocket client.

See [Regular Response Messages](../protocol/websocket-protocol.md#3-regular-response-messages-server--client) and [Error Response Messages](../protocol/websocket-protocol.md#4-error-response-messages-server--client) in the protocol specification for complete details.

#### Response Events

- **`voicechat.response.start`** - AI about to start responding
- **`voicechat.response.chunk`** - TTS audio chunk (same `eventId`, unique `utteranceId` per chunk)
- **`voicechat.response.complete`** - AI response complete
- **`voicechat.response.interrupt`** - User interrupted AI
- **`voicechat.response.stop`** - Stop in-flight response

See [Response Chunks](../protocol/websocket-protocol.md#response-chunks-special-format) for important details about chunk ordering.

#### Error Events

- **Event type**: `voicechat.audio.error`, `voicechat.response.error`, etc. (converted from request type)
- **Format**: `requestType` at top level, `payload` only contains `{ message: string }`

See [Error Response Messages](../protocol/websocket-protocol.md#4-error-response-messages-server--client) for complete error format specification.

#### Connection ACK

- **Event type**: `connection.ack`
- **Purpose**: Sent automatically when WebSocket connection is established

See [Connection ACK](../protocol/websocket-protocol.md#5-connection-ack-special-case) for details.

---

## Audio Format Specifications

### Input Format (Client → Server)

- **Format**: PCM (Pulse Code Modulation)
- **Sample Rate**: 16kHz
- **Bit Depth**: 16-bit
- **Channels**: Mono (1 channel)
- **Encoding**: Raw binary (`Uint8Array` inside MessagePack payload)

### Output Format (Server → Client)

- **Format**: PCM / Opus / MP3 (configurable, depends on TTS provider)
- **Sample Rate**: Typically 16kHz–24kHz
- **Bit Depth**: 16-bit
- **Channels**: Mono

### Chunk Size

- **Recommended**: 100–200 ms chunks
- **Buffering**: 1–2 seconds may be buffered internally before STT processing (see voice-mode docs)

---

## Example Client Implementation

See [Complete Examples](../protocol/websocket-protocol.md#complete-examples) in the protocol specification for full request-response examples.

```ts
import { pack, unpack } from "msgpackr";
import { uuidv7 } from "./utils";

const ws = new WebSocket("ws://localhost:3001/ws");
ws.binaryType = "arraybuffer";

let sessionId: string | undefined;

ws.onopen = () => {
  // Wait for connection.ack to receive sessionId
};

ws.onmessage = (event) => {
  const msg = unpack(new Uint8Array(event.data)) as EventMessage;

  // Handle connection.ack
  if (msg.eventType === "connection.ack") {
    sessionId = msg.sessionId;
    // Now ready to send requests
  }

  // Handle responses and errors
  // All field names use camelCase (eventType, eventId, sessionId)
};
```

---

## Rate Limiting

API rate limits may apply based on:

- Number of concurrent connections
- Audio chunk frequency
- Downstream API service limits (OpenAI, Deepgram, Cartesia, etc.)

---

## See Also

- [WebSocket Protocol Specification](../protocol/websocket-protocol.md) - Complete protocol specification (single source of truth)
- [WebSocket Quick Reference](../protocol/websocket-quick-reference.md) - Quick lookup guide
- [Architecture Documentation](../architecture/architecture.md) - System architecture
- [Documentation Index](../README.md) - All documentation files

## References

### External References

- [WebSocket Protocol (RFC 6455)](https://datatracker.ietf.org/doc/html/rfc6455)
- [msgpackr](https://github.com/kriszyp/msgpackr)
