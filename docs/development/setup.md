# Setup Guide

**Version**: 1.0.0  
**Last Updated**: 2025-12-17  
**Status**: Active

This guide will help you set up the Vantum backend development environment.

## Prerequisites

- **Node.js**: v18.x or higher
- **pnpm**: v8.x or higher
- **Git**: For version control

## Installation Steps

### 1. Install Node.js

Download and install Node.js from [nodejs.org](https://nodejs.org/).

Verify installation:

```bash
node --version
npm --version
```

### 2. Install pnpm

Install pnpm globally:

```bash
npm install -g pnpm
```

Verify installation:

```bash
pnpm --version
```

### 3. Clone and Navigate to Project

```bash
cd /Users/jatin/Documents/Projects/Vantum/backend
```

### 4. Install Dependencies

```bash
pnpm install
```

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

# OpenAI API Key
OPENAI_API_KEY=your_openai_api_key_here

# Deepgram API Key (for Speech-to-Text)
DEEPGRAM_API_KEY=your_deepgram_api_key_here

# ElevenLabs API Key (for Text-to-Speech)
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
```

### 6. Get API Keys

#### OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Sign up or log in
3. Navigate to API Keys section
4. Create a new API key
5. Copy and add to `.env` file

**Reference**: [OpenAI API Keys](https://platform.openai.com/api-keys)

#### Deepgram API Key

1. Go to [Deepgram](https://www.deepgram.com/)
2. Sign up for an account
3. Navigate to API Keys in dashboard
4. Create a new API key
5. Copy and add to `.env` file

**Reference**: [Deepgram Getting Started](https://developers.deepgram.com/docs/getting-started)

#### ElevenLabs API Key

1. Go to [ElevenLabs](https://elevenlabs.io/)
2. Sign up for an account
3. Navigate to Profile → API Keys
4. Generate a new API key
5. Copy and add to `.env` file

**Reference**: [ElevenLabs API Setup](https://elevenlabs.io/docs/api-reference/authentication)

### 7. Run Development Server

```bash
pnpm dev
```

The server should start on `http://localhost:3001`

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

## Development Workflow

### Running in Development Mode

```bash
pnpm dev
```

This uses `nodemon` to automatically restart the server on file changes.

### Building for Production

```bash
pnpm build
```

This compiles TypeScript to JavaScript in the `dist/` directory and rewrites path aliases using `tsc-alias` (see `package.json` scripts).

### Running Production Build

```bash
pnpm start
```

## Project Structure

```
backend/
├── src/
│   ├── index.ts              # Application entry point
│   ├── modules/              # Feature modules (self-contained)
│   │   └── socket/           # Socket/WebSocket module
│   │       ├── index.ts      # Public API (barrel file)
│   │       ├── socket.server.ts
│   │       ├── handlers/     # Event handlers
│   │       ├── services/     # Business logic services
│   │       └── types/        # Module-specific types
│   └── shared/               # Shared across all modules
│       ├── config/           # Configuration (e.g. socket config)
│       ├── utils/            # Shared utilities (logger, uuid, etc.)
│       └── types/            # Shared types (if any)
├── docs/                     # Documentation
├── dist/                     # Compiled JavaScript (generated)
├── node_modules/             # Dependencies (generated)
├── .env                      # Environment variables (not in git)
├── .env.example              # Example environment file
├── package.json              # Project dependencies and scripts
└── tsconfig.json             # TypeScript configuration
```

## Troubleshooting

### Port Already in Use

If port 3001 is already in use, change it in `.env`:

```
PORT=3002
```

### Module Not Found Errors

Clear node_modules and reinstall:

```bash
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### TypeScript Compilation Errors

Check TypeScript configuration:

```bash
pnpm exec tsc --noEmit
```

### API Key Issues

- Ensure API keys are correctly set in `.env`
- Verify API keys are valid and have proper permissions
- Check API key format (no extra spaces or quotes)

## Next Steps

After setup, refer to:

- [Implementation Plan](./implementation-plan.md) - For development phases
- [Architecture Documentation](../architecture/architecture.md) - For system design
- [API Documentation](../api/api.md) - For API endpoints

## References

- [Node.js Documentation](https://nodejs.org/docs/)
- [pnpm Documentation](https://pnpm.io/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)
