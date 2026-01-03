# Documentation Index

This directory contains all documentation for the Vantum backend. Documents are organized following DRY (Don't Repeat Yourself) principles and grouped by category.

## Documentation Structure

```
docs/
├── README.md                    # This file - Documentation index
├── TEMPLATE.md                  # Documentation template for new docs
│
├── protocol/                    # WebSocket Protocol Documentation
│   ├── websocket-protocol.md    # Single source of truth
│   ├── websocket-quick-reference.md
│   └── event-system.md          # Event system specification (NEW)
│
├── api/                         # API Documentation
│   └── api.md                   # REST + WebSocket API overview
│
├── architecture/                # Architecture & Design
│   ├── architecture.md          # System architecture
│   ├── data-models.md           # Data models and types (NEW)
│   ├── state-machine.md         # Conversation state machine (NEW)
│   ├── decisions.md             # Architectural Decision Records (NEW)
│   └── scalability.md           # Scalability architecture (NEW)
│
├── audio/                       # Audio Processing
│   ├── audio-resampling.md      # Audio resampling architecture
│   └── sample-rate-handling.md  # Sample rate handling guide
│
├── integrations/                # External Service Integrations (NEW)
│   └── external-services.md     # Deepgram, OpenAI, Cartesia, Twilio
│
├── design/                      # Module Design Specifications
│   ├── deepgram-stt-integration-design.md
│   └── stt-implementation-guide.md
│
├── development/                 # Development Guides
│   ├── setup.md                 # Development setup
│   └── implementation-plan.md   # Implementation phases
│
├── code/                        # Code Organization
│   ├── folder-structure.md      # Detailed folder structure
│   └── folder-structure-quick-reference.md
│
└── reference/                   # Reference Materials
    ├── voice-mode-implementation.md  # Reference from thine project
    └── stt-provider-comparison.md    # Provider comparison
```

## Primary Documents

### 📘 Protocol Documentation

#### [WebSocket Protocol Specification](protocol/websocket-protocol.md)

**Single Source of Truth** - Complete WebSocket protocol specification

- Base message structure
- Session ID generation (server-generated)
- All message types (Request, ACK, Response, Error, Connection ACK)
- Field requirements and validation rules
- Complete examples
- **All other docs reference this document**

#### [Event System Specification](protocol/event-system.md) 🆕

**Event Organization** - Single unified EVENTS object

- Hierarchical event structure (domain.category.action)
- Complete event reference (50+ events)
- Event metadata registry
- Helper functions
- Migration guide from legacy VOICECHAT_EVENTS
- TypeScript implementation

#### ⚡ [WebSocket Quick Reference](protocol/websocket-quick-reference.md)

**Quick Lookup Guide** - Minimal templates and links

- Message type templates
- Field requirements matrix
- Key concepts summary
- Links to protocol specification for details

### 📋 API Documentation

#### [API Documentation](api/api.md)

**API Overview** - REST + WebSocket API

- REST endpoints
- WebSocket API overview
- Audio format specifications
- Links to protocol specification for details

### 🏗️ Core Architecture

#### [Architecture Overview](architecture/architecture.md)

**System Architecture** - System architecture and design

- High-level system design
- Module structure (socket, audio, stt, llm, tts, conversation)
- Communication flow
- Technology stack
- Current implementation status

#### [Data Models](architecture/data-models.md) 🆕

**Type Definitions** - TypeScript data structures

- Session model with SessionStatus enum
- ConversationContext and ConversationMessage models
- ConversationState enum
- STTSession model (future)
- Event message models
- Type safety guidelines

#### [Conversation State Machine](architecture/state-machine.md) 🆕

**State Management** - Conversation state flow

- Complete state machine with Mermaid diagrams
- All 6 states (INITIALIZING, LISTENING, THINKING, RESPONDING, INTERRUPTED, ENDED)
- State transition rules and validation
- Interruption handling strategy
- TypeScript implementation
- Edge cases and testing

#### [Architectural Decision Records (ADR)](architecture/decisions.md) 🆕

**Technical Decisions** - All major architectural decisions

- 13 ADRs documented with rationale
- Infrastructure decisions (MessagePack, UUID v7, Server-generated IDs)
- Architecture patterns (Handler+Service, Module structure)
- Audio processing (Resampling, Persistent connections)
- UX decisions (Interruption handling, Streaming)
- External services (Cartesia TTS selection)

#### [Scalability Architecture](architecture/scalability.md) 🆕

**Scaling Strategy** - From 10 to 1000+ concurrent calls

- Current capacity (50-100 calls per instance)
- Bottleneck analysis (internal and external)
- Horizontal scaling strategy (3 phases)
- Redis for distributed state
- Load balancing with ALB
- Message queue integration (RabbitMQ)
- Caching strategy
- Monitoring and observability
- Cost projections

### 🔌 External Integrations

#### [External Services Integration](integrations/external-services.md) 🆕

**API Integrations** - Deepgram, OpenAI, Cartesia, Twilio

- **Deepgram (STT)**: Configuration, features, cost ($64.50/month)
- **OpenAI (LLM)**: Streaming, system prompts, cost ($25.50/month)
- **Cartesia (TTS)**: Voice selection, streaming, cost ($300/month)
- **Twilio (Telephony)**: Media Streams integration (future, $215/month)
- API key management and security
- Rate limiting strategies
- Fallback strategies
- Cost management and optimization

### 🎵 Audio Processing

#### [Audio Resampling Architecture](audio/audio-resampling.md)

**Audio Resampling Design** - Audio resampling architecture and implementation

- Problem statement and solution
- wave-resampler selection rationale
- AudioResamplerService design
- Performance analysis (<1ms latency)
- Alternatives considered (node-libsamplerate, Python/PyAV, FFmpeg)

#### [Sample Rate Handling Guide](audio/sample-rate-handling.md)

**Sample Rate Management** - Comprehensive guide for handling different audio sources

- Browser audio (48kHz)
- Twilio integration (8kHz)
- Pre-recorded files (variable rates)
- Resampling strategy and decision matrix
- Implementation patterns and edge cases

### 💻 Development Guides

#### [Setup Guide](development/setup.md)

**Development Setup** - Development setup instructions

- Prerequisites
- Installation steps
- Environment configuration
- Troubleshooting

#### [Implementation Plan](development/implementation-plan.md)

**Implementation Phases** - Phased implementation approach

- Layer 1: Infrastructure (✅ COMPLETE)
- Layer 2: AI Pipeline (📝 PLANNED - Not Started)
- Layer 3: Scaling & Production (⏳ FUTURE)
- Layer 4: Advanced Features (⏳ FUTURE)
- Phase dependencies and deliverables

#### [Technical Debt Tracking](development/technical-debt.md) 🆕

**Centralized Debt Management** - Track TODOs and future improvements

- 4 current technical debt items (Layer 2 dependencies)
- 2 resolved items
- Priority definitions and effort estimates
- Contributing guidelines

### 🎨 Design Specifications

#### [Deepgram STT Integration Design](design/deepgram-stt-integration-design.md)

**STT Integration** - Complete Deepgram integration design

- Architecture and data flow
- WebSocket connection management
- Audio streaming
- Transcript processing
- Error handling and fallbacks

#### [STT Implementation Guide](design/stt-implementation-guide.md)

**Implementation Guide** - Step-by-step STT implementation

- Service structure
- Connection handling
- Audio processing
- Testing strategy

### 📁 Code Organization

#### [Folder Structure Documentation](code/folder-structure.md)

**Code Organization** - Detailed folder structure and conventions

- Module-based architecture
- Import guidelines
- Best practices
- Adding new modules

#### [Folder Structure Quick Reference](code/folder-structure-quick-reference.md)

**Quick Lookup** - Quick reference for folder structure

- Directory structure
- Import patterns
- Path aliases
- Rules

### 📚 Reference Materials

#### [Voice Mode Implementation Reference](reference/voice-mode-implementation.md)

**Conceptual Reference** - Reference from thine project

- Voice flow architecture
- Speculative generation
- VAD configuration
- Implementation patterns

#### [STT Provider Comparison](reference/stt-provider-comparison.md)

**Provider Comparison** - Deepgram vs Soniox comparison

- Pricing comparison
- Feature comparison
- Recommendations

## Documentation Principles

### DRY (Don't Repeat Yourself)

1. **Single Source of Truth**: `websocket-protocol.md` contains all protocol details
2. **Reference, Don't Duplicate**: Other docs link to protocol doc instead of copying content
3. **Minimal Quick Reference**: Quick reference provides templates only, not full details
4. **Consistent Updates**: Changes made in one place (protocol doc) automatically reflect everywhere

### Document Hierarchy

```
protocol/websocket-protocol.md (Single Source of Truth)
    ↑
    ├── protocol/websocket-quick-reference.md (References protocol doc)
    ├── protocol/event-system.md (Event system specification)
    ├── api/api.md (References protocol doc)
    ├── architecture/architecture.md (References protocol doc)
    └── README.md (Links to all docs)

architecture/decisions.md (Architectural Decisions)
    ↑
    ├── architecture/architecture.md
    ├── architecture/state-machine.md
    ├── architecture/scalability.md
    └── integrations/external-services.md
```

## Quick Links by Task

### 🚀 Getting Started
- **New to the project?** Start with [Setup Guide](development/setup.md)
- **Understanding the system?** Read [Architecture Overview](architecture/architecture.md)
- **Implementation roadmap?** See [Implementation Plan](development/implementation-plan.md)

### 💬 WebSocket Development
- **Implementing WebSocket?** Read [WebSocket Protocol Specification](protocol/websocket-protocol.md)
- **Event system?** See [Event System Specification](protocol/event-system.md)
- **Quick lookup?** Use [WebSocket Quick Reference](protocol/websocket-quick-reference.md)
- **API overview?** See [API Documentation](api/api.md)

### 🎯 Core Features
- **Audio processing?** See [Audio Resampling Architecture](audio/audio-resampling.md)
- **Sample rate handling?** See [Sample Rate Handling Guide](audio/sample-rate-handling.md)
- **STT integration?** See [Deepgram STT Integration Design](design/deepgram-stt-integration-design.md)
- **Conversation flow?** See [Conversation State Machine](architecture/state-machine.md)

### 🔧 Architecture & Design
- **Data structures?** See [Data Models](architecture/data-models.md)
- **Why this decision?** See [Architectural Decision Records](architecture/decisions.md)
- **Scaling strategy?** See [Scalability Architecture](architecture/scalability.md)
- **External APIs?** See [External Services Integration](integrations/external-services.md)

### 📦 Code Organization
- **Folder structure?** See [Folder Structure Documentation](code/folder-structure.md)
- **Quick structure lookup?** See [Folder Structure Quick Reference](code/folder-structure-quick-reference.md)

## Documentation by Status

### ✅ Complete (Production-Ready)
- WebSocket Protocol Specification
- Architecture Overview
- Data Models
- State Machine
- Architectural Decisions (13 ADRs)
- Event System Specification
- External Services Integration
- Scalability Architecture
- Audio Resampling Architecture
- Sample Rate Handling
- Deepgram STT Integration (FULLY IMPLEMENTED with 85%+ test coverage)

### 🚧 In Progress
- Implementation Plan (Layer 2 planned - LLM and TTS not started)

### ⏳ Planned
- LLM Service Documentation (Layer 2)
- TTS Service Documentation (Layer 2)
- Conversation Orchestrator Documentation (Layer 2)
- Telephony Gateway Documentation (Layer 3)

## Critical Documents for New Developers

**Must Read (In Order)**:
1. [Architecture Overview](architecture/architecture.md) - Understand the system
2. [WebSocket Protocol Specification](protocol/websocket-protocol.md) - Protocol details
3. [Event System Specification](protocol/event-system.md) - Event organization
4. [Architectural Decision Records](architecture/decisions.md) - Why we made these choices
5. [Setup Guide](development/setup.md) - Get started locally

**Layer 2 Development**:
1. [External Services Integration](integrations/external-services.md) - API details
2. [Conversation State Machine](architecture/state-machine.md) - State management
3. [Data Models](architecture/data-models.md) - Type definitions
4. [Deepgram STT Integration Design](design/deepgram-stt-integration-design.md) - STT implementation

## Contributing to Documentation

When updating documentation:

1. **Protocol Changes**: Update `protocol/websocket-protocol.md` only
2. **Event System**: Update `protocol/event-system.md` for new events
3. **Architectural Decisions**: Add new ADRs to `architecture/decisions.md`
4. **Cross-References**: Other docs should link to source docs, not duplicate
5. **Examples**: Keep examples in source docs, reference from other docs
6. **Consistency**: Ensure all docs use same terminology and naming conventions
7. **Folder Structure**: Keep related docs in appropriate folders
8. **New Docs**: Use [TEMPLATE.md](TEMPLATE.md) as a starting point
9. **Update This Index**: Add new documents to this README.md

## Document Version Information

All new documents created on 2024-12-27 are version 1.0.0 and follow consistent formatting:
- Version header
- Last updated date
- Status (Living Document, Active, Complete, etc.)
- Table of contents
- Clear section structure
- Related documents links
- Maintainer information

---

**Version**: 2.0.0
**Last Updated**: 2024-12-27
**Status**: Active

**Recent Updates**:
- Added 6 new documentation files (event-system, data-models, state-machine, decisions, scalability, external-services)
- Reorganized Quick Links by task
- Added Documentation by Status section
- Added Critical Documents for New Developers section
- Updated documentation structure diagram
