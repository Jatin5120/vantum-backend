# Vantum Backend

Backend service for Vantum AI Audio Call SaaS - A B2B platform for AI-powered cold outreach calls.

## Overview

Vantum enables businesses to automate cold outreach calls using AI. The AI calls prospects, engages in natural conversations, and gathers sentiment/interest data.

## Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Real-time Communication**: Native WebSocket (ws) with MessagePack
- **AI/LLM**: OpenAI GPT-4
- **Speech-to-Text**: Deepgram / Google Speech-to-Text
- **Text-to-Speech**: ElevenLabs / Google TTS
- **Package Manager**: pnpm

## Project Structure

```
backend/
├── src/
│   ├── index.ts                 # Express + WebSocket server entry point
│   ├── modules/
│   │   └── socket/              # WebSocket module
│   │       ├── handlers/       # Message handlers
│   │       ├── services/       # Stateful services (session, websocket)
│   │       ├── utils/          # Static utilities (MessagePack, WebSocket)
│   │       ├── types/          # TypeScript type definitions
│   │       └── socket.server.ts # WebSocket server initialization
│   └── shared/                  # Shared utilities
│       ├── config/             # Configuration
│       ├── types/              # Shared types
│       └── utils/              # Shared utilities (logger, uuid)
├── docs/                        # Documentation directory
│   ├── websocket-protocol.md   # WebSocket protocol specification (single source of truth)
│   ├── websocket-quick-reference.md # Quick lookup guide
│   ├── api.md                  # REST + WebSocket API overview
│   ├── architecture.md         # System architecture
│   ├── setup.md                # Setup guide
│   └── implementation-plan.md  # Implementation phases
├── package.json
├── tsconfig.json
└── .env
```

## Quick Start

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Set up environment variables (see `.env.example`):

   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

3. Run development server:

   ```bash
   pnpm dev
   ```

4. Build for production:
   ```bash
   pnpm build
   pnpm start
   ```

## Documentation

### Core Documentation

**WebSocket Protocol** (Single Source of Truth)

- [WebSocket Protocol Specification](./docs/websocket-protocol.md) - Complete protocol specification
- [WebSocket Quick Reference](./docs/websocket-quick-reference.md) - Quick lookup guide

**API & Architecture**

- [API Documentation](./docs/api.md) - REST + WebSocket API overview
- [Architecture Overview](./docs/architecture.md) - System architecture and design

**Setup & Planning**

- [Setup Guide](./docs/setup.md) - Development setup instructions
- [Implementation Plan](./docs/implementation-plan.md) - Implementation phases and roadmap

**Documentation Index**

- [Documentation README](./docs/README.md) - Documentation structure and principles

## References

### Protocol & Standards

- [WebSocket Protocol (RFC 6455)](https://datatracker.ietf.org/doc/html/rfc6455)
- [MessagePack Specification](https://msgpack.org/)

### Libraries & Tools

- [ws (WebSocket library)](https://github.com/websockets/ws)
- [msgpackr](https://github.com/kriszyp/msgpackr)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)

### External APIs

- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [Deepgram API Documentation](https://developers.deepgram.com/)
- [ElevenLabs API Documentation](https://elevenlabs.io/docs/api-reference)

## License

ISC
