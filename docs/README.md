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
│   └── websocket-quick-reference.md
│
├── api/                         # API Documentation
│   └── api.md                   # REST + WebSocket API overview
│
├── architecture/                # Architecture & Design
│   └── architecture.md          # System architecture
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
- All message types (Request, ACK, Response, Error, Connection ACK)
- Field requirements and validation rules
- Complete examples
- **All other docs reference this document**

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

### 🏗️ Architecture & Design

#### [Architecture Overview](architecture/architecture.md)

**System Architecture** - System architecture and design

- High-level system design
- Communication flow
- Technology decisions
- Scalability considerations

### 💻 Development Guides

#### [Setup Guide](development/setup.md)

**Development Setup** - Development setup instructions

- Prerequisites
- Installation steps
- Environment configuration
- Troubleshooting

#### [Implementation Plan](development/implementation-plan.md)

**Implementation Phases** - Phased implementation approach

- Phase breakdown
- Dependencies
- Current focus
- Deliverables

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
    ├── api/api.md (References protocol doc)
    ├── architecture/architecture.md (References protocol doc)
    └── README.md (Links to all docs)
```

## Quick Links

- **New to the project?** Start with [Setup Guide](development/setup.md)
- **Implementing WebSocket?** Read [WebSocket Protocol Specification](protocol/websocket-protocol.md)
- **Quick lookup?** Use [WebSocket Quick Reference](protocol/websocket-quick-reference.md)
- **API overview?** See [API Documentation](api/api.md)
- **Understanding architecture?** Read [Architecture Overview](architecture/architecture.md)

## Contributing to Documentation

When updating documentation:

1. **Protocol Changes**: Update `protocol/websocket-protocol.md` only
2. **Cross-References**: Other docs should link to protocol doc, not duplicate
3. **Examples**: Keep examples in protocol doc, reference from other docs
4. **Consistency**: Ensure all docs use same terminology and naming conventions
5. **Folder Structure**: Keep related docs in appropriate folders (protocol/, api/, architecture/, etc.)
6. **New Docs**: Use [TEMPLATE.md](TEMPLATE.md) as a starting point

---

**Version**: 1.0.0  
**Last Updated**: 2025-12-17  
**Status**: Active
