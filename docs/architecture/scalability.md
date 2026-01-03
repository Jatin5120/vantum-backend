# Scalability Architecture

**Version**: 1.0.0
**Last Updated**: 2024-12-27
**Status**: Living Document

---

## Overview

This document outlines the scalability strategy for the Vantum backend, from initial deployment (10 concurrent calls) to future scaling (100+ concurrent calls). It covers architecture evolution, bottleneck identification, horizontal scaling strategies, and monitoring requirements.

**Current Target**: 10 concurrent users at launch
**Future Target**: 50-100 concurrent users per instance, 1000+ across instances

---

## Table of Contents

1. [Current Capacity (Single Instance)](#current-capacity-single-instance)
2. [Bottleneck Analysis](#bottleneck-analysis)
3. [Horizontal Scaling Strategy](#horizontal-scaling-strategy)
4. [Redis for Distributed State](#redis-for-distributed-state)
5. [Load Balancing](#load-balancing)
6. [Message Queue Integration](#message-queue-integration)
7. [Caching Strategy](#caching-strategy)
8. [Monitoring and Observability](#monitoring-and-observability)
9. [Cost Projections](#cost-projections)

---

## Current Capacity (Single Instance)

### Design Target

**Launch Capacity**: 10 concurrent calls
**Comfortable Capacity**: 50-100 concurrent calls per instance
**Maximum Capacity**: 200 concurrent calls (theoretical, with optimizations)

### Resource Usage Per Session

**Memory**:
- Session object: ~2KB
- Conversation history: ~10KB (10-20 messages)
- Audio buffers: ~200KB (2-3 seconds of audio)
- WebSocket connection: ~50KB
- Deepgram connection: ~100KB
- **Total per session**: ~360KB

**CPU**:
- Audio resampling: ~1% per session
- JSON/MessagePack serialization: ~0.5% per session
- WebSocket overhead: ~0.5% per session
- **Total per session**: ~2% CPU

**Network**:
- Audio input: ~32 KB/s (16kHz PCM 16-bit)
- Audio output: ~32 KB/s
- WebSocket overhead: ~5 KB/s
- **Total per session**: ~70 KB/s

### Single Instance Capacity Calculation

**Hardware Assumptions** (AWS t3.large):
- 2 vCPUs
- 8 GB RAM
- 5 Gbps network

**Capacity Limits**:

**By Memory**:
- Available: 8 GB = 8,192 MB
- OS overhead: 1 GB = 1,024 MB
- App base: 500 MB
- Available for sessions: 6,668 MB = 6,828,032 KB
- Sessions: 6,828,032 KB / 360 KB = **18,966 sessions** (not limiting factor)

**By CPU**:
- Available: 2 vCPUs = 200% CPU
- OS overhead: 10%
- App base: 20%
- Available for sessions: 170%
- Sessions: 170% / 2% = **85 concurrent sessions** (comfortable)

**By Network**:
- Available: 5 Gbps = 625 MB/s = 640,000 KB/s
- OS overhead: 10%
- Available for sessions: 576,000 KB/s
- Sessions: 576,000 KB/s / 70 KB/s = **8,228 sessions** (not limiting factor)

**Conclusion**: Single t3.large instance can comfortably handle **50-85 concurrent calls**, CPU-bound.

---

## Bottleneck Analysis

### Internal Bottlenecks

**1. In-Memory Session Storage**
- **Current**: Sessions stored in `Map<sessionId, Session>`
- **Limit**: Single instance only, no cross-instance sharing
- **Impact**: Can't scale horizontally without Redis
- **Priority**: HIGH (Layer 3)

**2. CPU-Bound Processing**
- **Causes**: Audio resampling, serialization, WebSocket management
- **Limit**: 50-85 sessions per instance (t3.large)
- **Mitigation**: Horizontal scaling, optimize resampling algorithm
- **Priority**: MEDIUM

**3. Memory Per Session**
- **Current**: ~360KB per session
- **Limit**: Not limiting factor (18K+ sessions possible)
- **Mitigation**: Trim conversation history aggressively
- **Priority**: LOW

### External Bottlenecks

**1. Deepgram Connection Limits**
- **Default**: 50 concurrent connections per API key
- **Upgradeable**: Contact Deepgram for higher limits
- **Impact**: Hard limit on concurrent calls
- **Mitigation**: Multiple API keys, enterprise plan
- **Priority**: HIGH (Layer 2)

**2. OpenAI Rate Limits**
- **Tier-Based**: Depends on monthly spend
- **Typical**: 3,500 RPM (Requests Per Minute), 90,000 TPM (Tokens Per Minute)
- **Impact**: Can handle ~58 concurrent calls (1 request per second per call)
- **Mitigation**: Request tier upgrade, caching, response streaming
- **Priority**: MEDIUM

**3. Cartesia Rate Limits**
- **Unknown**: To be determined from documentation
- **Impact**: TBD
- **Mitigation**: Contact for enterprise limits
- **Priority**: MEDIUM (Layer 2)

**4. Twilio Concurrent Call Limits**
- **Default**: 10 concurrent calls (new accounts)
- **Upgradeable**: Request increase (up to thousands)
- **Impact**: Hard limit on outbound calls
- **Mitigation**: Request limit increase, multiple accounts
- **Priority**: HIGH (Layer 3)

### Network Bottlenecks

**Bandwidth**:
- **Current**: Not a bottleneck (8K+ sessions possible)
- **Future**: Monitor at 500+ concurrent sessions

**Latency**:
- **WebSocket**: <50ms (within same AWS region)
- **Deepgram**: <200ms (STT latency)
- **OpenAI**: <500ms (first token)
- **Cartesia**: <300ms (first audio chunk)
- **Total**: <1000ms (user stops speaking → AI starts speaking)

---

## Horizontal Scaling Strategy

### Phase 1: Single Instance (10-50 concurrent calls)

**Architecture**:
```
Internet
  ↓
[Backend Instance]
  ├─ WebSocket Server
  ├─ Session Service (in-memory)
  ├─ Audio Service
  ├─ STT Service → Deepgram
  ├─ LLM Service → OpenAI
  └─ TTS Service → Cartesia
```

**Characteristics**:
- In-memory session storage
- No load balancer needed
- Simple deployment
- No Redis/queue required

**Capacity**: 10-50 concurrent calls

---

### Phase 2: Multi-Instance with Load Balancer (50-200 concurrent calls)

**Architecture**:
```
Internet
  ↓
[Application Load Balancer] (sticky sessions)
  ↓        ↓        ↓
[Instance 1] [Instance 2] [Instance 3]
  ↓        ↓        ↓
[Redis] (shared session state)
```

**Changes Required**:
1. **Add Redis** for distributed session storage
2. **Add Load Balancer** with sticky sessions (WebSocket support)
3. **Migrate Session Storage** from in-memory to Redis
4. **Update Session Service** to use Redis instead of Map

**Capacity**: 50-200 concurrent calls (3-4 instances)

**Implementation**:
```typescript
// Before (in-memory)
class SessionServiceClass {
  private sessions = new Map<string, Session>();

  createSession(sessionId: string, socket: WebSocket): void {
    this.sessions.set(sessionId, { sessionId, socket, ... });
  }
}

// After (Redis)
class SessionServiceClass {
  private redis: RedisClient;

  async createSession(sessionId: string, socket: WebSocket): Promise<void> {
    await this.redis.set(`session:${sessionId}`, JSON.stringify({
      sessionId,
      status: 'active',
      createdAt: Date.now(),
      // Note: socket not serializable, managed separately
    }));
  }

  async getSession(sessionId: string): Promise<Session | null> {
    const data = await this.redis.get(`session:${sessionId}`);
    return data ? JSON.parse(data) : null;
  }
}
```

**Load Balancer Configuration** (AWS ALB):
```yaml
StickySessionsEnabled: true
StickySessionsDuration: 3600  # 1 hour
Protocol: WebSocket
HealthCheck: /health
```

---

### Phase 3: Multi-Region, Message Queue (200-1000+ concurrent calls)

**Architecture**:
```
Internet
  ↓
[Global Load Balancer] (Route53 / CloudFront)
  ↓        ↓
[Region US]      [Region EU]
  ↓                ↓
[ALB]            [ALB]
  ↓ ↓ ↓            ↓ ↓ ↓
[Instances]      [Instances]
  ↓                ↓
[Redis Cluster]  [Redis Cluster]
  ↓                ↓
[RabbitMQ / Kafka] (cross-region)
```

**Additional Components**:
1. **Message Queue** (RabbitMQ or Kafka) for async processing
2. **Redis Cluster** for high availability
3. **Multi-Region Deployment** for latency reduction
4. **Observability Stack** (Prometheus, Grafana, Datadog)

**Capacity**: 200-1000+ concurrent calls

---

## Redis for Distributed State

### Data to Store in Redis

**1. Session Metadata**:
```typescript
interface SessionRedisData {
  sessionId: string;
  status: 'idle' | 'active' | 'ended';
  state: ConversationState;
  createdAt: number;
  lastActivityAt: number;
  instanceId: string;  // Which instance handles this session
}

// Redis key: session:{sessionId}
await redis.set(`session:${sessionId}`, JSON.stringify(sessionData));
await redis.expire(`session:${sessionId}`, 3600);  // 1 hour TTL
```

**2. Conversation History**:
```typescript
// Redis list: conversation:{sessionId}
await redis.lpush(`conversation:${sessionId}`, JSON.stringify(message));
await redis.ltrim(`conversation:${sessionId}`, 0, 19);  // Keep last 20 messages
await redis.expire(`conversation:${sessionId}`, 3600);
```

**3. Active Instance Registry**:
```typescript
// Redis set: instances:active
await redis.sadd('instances:active', instanceId);
await redis.expire(`instance:${instanceId}`, 60);  // Heartbeat every 30s
```

### Data NOT to Store in Redis

**WebSocket Connections**:
- Not serializable
- Managed locally on each instance
- Load balancer ensures sticky sessions (client always connects to same instance)

**Audio Buffers**:
- Too large, high churn
- Managed in-memory on each instance

### Redis Configuration

**Deployment**: AWS ElastiCache (managed Redis)

**Configuration**:
```yaml
Engine: Redis 7.0
NodeType: cache.r6g.large  # 13.07 GB memory
Replicas: 2                # High availability
MultiAZ: true
Encryption: true
BackupRetention: 7 days
```

**Connection Pool**:
```typescript
import { createClient } from 'redis';

const redis = createClient({
  url: process.env.REDIS_URL,
  socket: {
    connectTimeout: 5000,
    keepAlive: 5000,
  },
});

await redis.connect();
```

---

## Load Balancing

### Requirements

**WebSocket Support**: REQUIRED (ALB supports WebSocket)
**Sticky Sessions**: REQUIRED (same client always to same instance)
**Health Checks**: Monitor instance health
**SSL Termination**: Handle HTTPS/WSS

### AWS Application Load Balancer (ALB)

**Target Group**:
```yaml
TargetType: instance
Protocol: HTTP
Port: 3001
HealthCheck:
  Path: /health
  Interval: 30s
  Timeout: 5s
  HealthyThreshold: 2
  UnhealthyThreshold: 3
StickinessEnabled: true
StickinessDuration: 3600  # 1 hour
```

**Listener Rules**:
```yaml
# WebSocket connections
- Path: /
  Protocol: WebSocket
  StickySession: true

# Health check endpoint
- Path: /health
  Protocol: HTTP
```

### Health Check Endpoint

```typescript
// src/routes/health.route.ts
import express from 'express';

const router = express.Router();

router.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    activeSessions: SessionService.getActiveSessionCount(),
    timestamp: Date.now(),
  };

  // Check external service connectivity
  try {
    await checkDeepgramHealth();
    await checkRedisHealth();
  } catch (error) {
    health.status = 'unhealthy';
    return res.status(503).json(health);
  }

  res.status(200).json(health);
});

export default router;
```

---

## Message Queue Integration

### Use Cases

**1. Async Call Processing**:
- Queue outbound calls
- Process call outcomes
- Retry failed calls

**2. Analytics Events**:
- Queue analytics events (call started, ended, interrupted)
- Process asynchronously in worker

**3. Cross-Instance Communication**:
- Broadcast state changes
- Coordinate across instances

### RabbitMQ vs Redis Pub/Sub vs Kafka

| Feature | RabbitMQ | Redis Pub/Sub | Kafka |
|---------|----------|---------------|-------|
| Message Persistence | ✅ Yes | ❌ No | ✅ Yes |
| Delivery Guarantee | ✅ At-least-once | ❌ Fire-and-forget | ✅ At-least-once |
| Scalability | Good | Excellent | Excellent |
| Complexity | Medium | Low | High |
| **Recommendation** | **✅ Best for Vantum** | Good for simple pub/sub | Overkill |

**Decision**: Use **RabbitMQ** for message queue (persistent, reliable, not too complex)

### RabbitMQ Integration

**Queue Structure**:
```
Exchange: vantum.calls
  ├─ Queue: calls.outbound (route: calls.outbound)
  ├─ Queue: calls.completed (route: calls.completed)
  └─ Queue: calls.failed (route: calls.failed)

Exchange: vantum.analytics
  ├─ Queue: analytics.events (route: analytics.#)
```

**Producer** (enqueue call):
```typescript
import amqp from 'amqplib';

async function queueOutboundCall(call: OutboundCall): Promise<void> {
  const connection = await amqp.connect(process.env.RABBITMQ_URL!);
  const channel = await connection.createChannel();

  await channel.assertExchange('vantum.calls', 'topic', { durable: true });
  await channel.assertQueue('calls.outbound', { durable: true });
  await channel.bindQueue('calls.outbound', 'vantum.calls', 'calls.outbound');

  channel.publish(
    'vantum.calls',
    'calls.outbound',
    Buffer.from(JSON.stringify(call)),
    { persistent: true }
  );

  await channel.close();
  await connection.close();
}
```

**Consumer** (process call):
```typescript
async function startCallWorker(): Promise<void> {
  const connection = await amqp.connect(process.env.RABBITMQ_URL!);
  const channel = await connection.createChannel();

  await channel.assertQueue('calls.outbound', { durable: true });
  channel.prefetch(1);  // Process one at a time

  channel.consume('calls.outbound', async (msg) => {
    if (!msg) return;

    const call = JSON.parse(msg.content.toString());

    try {
      await placeOutboundCall(call);
      channel.ack(msg);  // Success
    } catch (error) {
      channel.nack(msg, false, true);  // Retry
    }
  });
}
```

---

## Caching Strategy

### What to Cache

**1. Common LLM Responses**:
```typescript
const responseCache = new Map<string, string>();

// Cache key: hash of (systemPrompt + conversationContext)
const cacheKey = hashContext(systemPrompt, recentMessages);

// Check cache
if (responseCache.has(cacheKey)) {
  return responseCache.get(cacheKey);
}

// Generate response
const response = await generateLLMResponse(...);

// Cache for future
responseCache.set(cacheKey, response);
```

**Examples**:
- Greeting: "Hi! This is Sarah from Vantum. How are you today?"
- Objection handling: "I understand you're busy. Would it be better if I called back later?"
- Closing: "Thanks for your time! Have a great day."

**2. Pre-Generated TTS Audio**:
```typescript
const audioCache = new Map<string, Buffer>();

// Cache common phrases
await preGenerateTTS('greeting', 'Hi! This is Sarah from Vantum.');
await preGenerateTTS('callback', 'Would it be better if I called back later?');
await preGenerateTTS('goodbye', 'Thanks for your time! Have a great day.');

async function preGenerateTTS(key: string, text: string): Promise<void> {
  const audio = await cartesia.synthesize({ text, stream: false });
  audioCache.set(key, audio);
}
```

**Benefits**:
- Instant response (no API call)
- Cost savings (no TTS generation)
- Consistent quality

**3. Session Metadata** (Redis):
- Cache frequently accessed session data
- Reduce Redis round trips

### Cache Invalidation

**Time-Based** (TTL):
```typescript
// Cache for 1 hour
cache.set(key, value, { ttl: 3600 });
```

**Event-Based**:
```typescript
// Invalidate on system prompt change
onSystemPromptUpdate(() => {
  responseCache.clear();
});
```

---

## Monitoring and Observability

### Metrics to Track

**System Metrics**:
- CPU usage per instance
- Memory usage per instance
- Network bandwidth
- Active WebSocket connections
- Active sessions count

**Application Metrics**:
- Calls per minute (total, per instance)
- Average call duration
- Conversation state distribution (LISTENING, THINKING, RESPONDING, etc.)
- Error rate by service (STT, LLM, TTS, Twilio)
- API latency (Deepgram, OpenAI, Cartesia)

**Cost Metrics**:
- API costs per call (STT + LLM + TTS + Twilio)
- Daily/monthly total costs
- Cost per minute

**Quality Metrics**:
- STT transcript confidence
- LLM response time
- TTS audio quality (subjective, user feedback)
- Call completion rate

### Monitoring Tools

**Option 1: Prometheus + Grafana**
- Self-hosted
- Free, open-source
- Requires setup and maintenance

**Option 2: Datadog**
- Managed service
- Easy setup, excellent UI
- Paid ($15-31/host/month)

**Option 3: AWS CloudWatch**
- Native AWS integration
- Basic metrics included
- Good for AWS-native deployments

**Recommendation**: Start with **Datadog** (fast setup, great UX), migrate to Prometheus if cost becomes issue

### Alerting

**Critical Alerts** (PagerDuty / Datadog):
- Instance CPU > 90% for 5 minutes
- Error rate > 10% for 1 minute
- API error rate (STT/LLM/TTS) > 5%
- Redis connection lost
- Deepgram rate limit reached

**Warning Alerts** (Slack / Email):
- Daily cost exceeds budget by 20%
- Average call duration > 10 minutes
- Active sessions approaching instance capacity

### Logging

**Structured Logging**:
```typescript
logger.info('Call started', {
  sessionId,
  prospectPhone,
  campaignId,
  timestamp: Date.now(),
});

logger.error('STT connection failed', {
  sessionId,
  error: error.message,
  retryCount,
  timestamp: Date.now(),
});
```

**Log Aggregation**: CloudWatch Logs, Datadog Logs, or ELK Stack

---

## Cost Projections

### Phase 1: Launch (10 concurrent calls)

**Monthly Costs**:

| Component | Cost | Notes |
|-----------|------|-------|
| AWS EC2 (t3.large) | $60 | Single instance |
| Deepgram | $65 | 15,000 minutes |
| OpenAI | $26 | 3,000 calls |
| Cartesia | $300 | 3,000 calls |
| Twilio | $215 | 15,000 minutes |
| Redis | $0 | Not needed yet |
| RabbitMQ | $0 | Not needed yet |
| Monitoring | $0 | Basic CloudWatch |
| **TOTAL** | **$666** | $0.22 per call |

---

### Phase 2: Growth (100 concurrent calls)

**Monthly Costs**:

| Component | Cost | Notes |
|-----------|------|-------|
| AWS EC2 (3× t3.large) | $180 | 3 instances |
| AWS ALB | $23 | Load balancer |
| Redis (ElastiCache r6g.large) | $150 | Managed Redis |
| Deepgram | $645 | 150,000 minutes |
| OpenAI | $255 | 30,000 calls |
| Cartesia | $3,000 | 30,000 calls |
| Twilio | $2,150 | 150,000 minutes |
| Monitoring (Datadog) | $75 | 3 hosts |
| **TOTAL** | **$6,478** | $0.22 per call |

**Note**: Cost per call remains constant as volume scales.

---

### Phase 3: Scale (1000 concurrent calls)

**Monthly Costs**:

| Component | Cost | Notes |
|-----------|------|-------|
| AWS EC2 (20× t3.large) | $1,200 | 20 instances |
| AWS ALB (2 regions) | $46 | Multi-region |
| Redis (ElastiCache cluster) | $600 | High availability |
| RabbitMQ (managed) | $200 | CloudAMQP |
| Deepgram | $6,450 | 1.5M minutes |
| OpenAI | $2,550 | 300K calls |
| Cartesia | $30,000 | 300K calls |
| Twilio | $21,500 | 1.5M minutes |
| Monitoring (Datadog) | $400 | 20 hosts + APM |
| **TOTAL** | **$62,946** | $0.21 per call |

**Optimization Opportunity**: Cost per call actually decreases slightly due to infrastructure efficiency at scale.

---

## Summary

### Scaling Phases

| Phase | Concurrent Calls | Architecture | Complexity |
|-------|------------------|--------------|------------|
| **Phase 1** | 10-50 | Single instance | Low |
| **Phase 2** | 50-200 | Multi-instance + Redis | Medium |
| **Phase 3** | 200-1000+ | Multi-region + Queue | High |

### Key Bottlenecks

1. **External API Limits** (Deepgram, OpenAI, Twilio) - HIGH priority
2. **CPU** (audio resampling, serialization) - MEDIUM priority
3. **In-Memory Sessions** (single instance limit) - HIGH priority (Layer 3)

### Immediate Actions (Layer 2-3)

- [ ] Contact Deepgram for connection limit increase
- [ ] Contact Twilio for concurrent call limit increase
- [ ] Monitor OpenAI rate limits, request tier upgrade if needed
- [ ] Implement Redis session storage (Layer 3)
- [ ] Set up load balancer with sticky sessions (Layer 3)
- [ ] Implement health check endpoint
- [ ] Set up basic monitoring (CloudWatch or Datadog)

---

## Related Documents

- [Architecture Overview](/docs/architecture/architecture.md)
- [External Services Integration](/docs/integrations/external-services.md)
- [Architectural Decisions](/docs/architecture/decisions.md)
- [Data Models](/docs/architecture/data-models.md)

---

**Last Updated**: 2024-12-27
**Maintainer**: Architect Agent
**Status**: Living document - will be updated as scaling requirements evolve
