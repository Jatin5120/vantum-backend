# STT Provider Comparison: Deepgram vs Soniox

**Version**: 1.0.0  
**Last Updated**: 2025-12-17  
**Status**: Active

**Purpose**: Choose STT provider for Vantum POC

> **⚠️ Note**: Pricing and features change frequently. Verify current information on official websites before making final decision.

---

## Quick Comparison Table

| Feature                 | Deepgram             | Soniox                      |
| ----------------------- | -------------------- | --------------------------- |
| **Pricing (Base)**      | ~$0.0043/min         | ~$0.01-0.02/min (estimated) |
| **Free Tier**           | 12,000 minutes/month | Limited/Unknown             |
| **Latency**             | ~200-300ms           | ~100-200ms (very low)       |
| **Accuracy**            | High                 | High                        |
| **Documentation**       | Excellent            | Good (newer service)        |
| **WebSocket Support**   | ✅ Yes               | ✅ Yes                      |
| **Real-time Streaming** | ✅ Yes               | ✅ Yes                      |
| **Language Support**    | 30+ languages        | 15+ languages               |
| **Enterprise Features** | ✅ Yes               | ✅ Yes                      |

---

## Deepgram

### Pricing

**Base Model (Nova-2)**:

- **Free Tier**: 12,000 minutes/month (generous!)
- **Paid**: ~$0.0043 per minute (~$4.30 per 1000 minutes)
- **Volume Discounts**: Available for high usage

**Enhanced Models**:

- **Nova-2 Enhanced**: Higher accuracy, slightly higher cost
- **Base Model**: Standard accuracy, lower cost

**Billing**:

- Pay-as-you-go
- No minimum commitment
- Billed per second (rounded up)

### Latency

- **Real-time Streaming**: ~200-300ms average latency
- **Time to First Result**: Very fast
- **Optimized for**: Real-time conversational AI
- **Performance**: Excellent for voice AI applications

### Free Plan Benefits

✅ **12,000 minutes/month free** (very generous!)

- Enough for ~200 hours of transcription per month
- Full API access
- All features included
- No credit card required initially
- Perfect for POC and early development

### Features & Options

**Models**:

- **Nova-2**: Latest model (recommended)
- **Nova**: Previous generation
- **Base**: Standard model
- **Enhanced**: Higher accuracy variant

**Capabilities**:

- Real-time streaming transcription
- Speaker diarization (identify different speakers)
- Punctuation and formatting
- Profanity filtering
- Custom vocabulary
- Language detection
- Multi-language support (30+ languages)

**API Options**:

- REST API
- WebSocket API (real-time streaming)
- SDKs: Python, Node.js, Go, etc.
- Webhooks support

### Pros

✅ **Excellent free tier** (12,000 min/month)
✅ **Very competitive pricing** (~$0.0043/min)
✅ **Great documentation** and developer experience
✅ **Proven reliability** (used by many companies)
✅ **Low latency** (~200-300ms)
✅ **Comprehensive features** (diarization, custom vocab, etc.)
✅ **Good SDK support**

### Cons

❌ Slightly higher latency than Soniox (but still very good)
❌ May be overkill for simple use cases

---

## Soniox

### Pricing

**Estimated Pricing** (based on reference implementation):

- **Free Tier**: Limited or unknown (need to verify)
- **Paid**: Estimated ~$0.01-0.02 per minute
- **Volume Discounts**: Likely available

**Note**: Soniox pricing is less publicly documented. Contact sales for accurate pricing.

### Latency

- **Real-time Streaming**: ~100-200ms average latency
- **Time to First Result**: Extremely fast
- **Optimized for**: Ultra-low latency applications
- **Performance**: Excellent, possibly best-in-class latency

### Free Plan Benefits

❓ **Unclear** - Need to verify:

- May have limited free tier
- May require contact with sales
- Free trial likely available

### Features & Options

**Models**:

- **Ink-Whisper**: Real-time transcription model
- Optimized for conversational AI
- Good accuracy in noisy environments

**Capabilities**:

- Real-time streaming transcription
- Low latency (key strength)
- Good accuracy
- Multi-language support (15+ languages)
- WebSocket API

**API Options**:

- WebSocket API (primary)
- REST API (likely available)
- SDKs: May be limited (newer service)

### Pros

✅ **Ultra-low latency** (~100-200ms, best-in-class)
✅ **Used successfully** in reference implementation
✅ **Good for real-time** conversational AI
✅ **Optimized for** voice AI use cases

### Cons

❌ **Less documented** (newer service)
❌ **Pricing unclear** (need to contact sales)
❌ **Free tier unknown** (may be limited)
❌ **Smaller ecosystem** (fewer resources/examples)
❌ **Potentially higher cost** than Deepgram

---

## Detailed Comparison

### 1. Pricing

**Deepgram**:

- **Winner**: Deepgram
- **Free Tier**: 12,000 minutes/month (excellent for POC)
- **Cost**: ~$0.0043/min (very competitive)
- **Transparency**: Clear, public pricing

**Soniox**:

- **Free Tier**: Unknown (need to verify)
- **Cost**: Estimated higher (~$0.01-0.02/min)
- **Transparency**: Less clear, may need sales contact

**Verdict**: Deepgram is more cost-effective, especially with generous free tier.

### 2. Latency

**Deepgram**:

- ~200-300ms average
- Very good for real-time applications
- Proven performance

**Soniox**:

- ~100-200ms average
- Possibly best-in-class latency
- Used successfully in reference

**Verdict**: Soniox has lower latency, but Deepgram's latency is still excellent and sufficient.

### 3. Free Plan Benefits

**Deepgram**:

- ✅ 12,000 minutes/month free
- ✅ No credit card required initially
- ✅ Full API access
- ✅ Perfect for POC

**Soniox**:

- ❓ Unknown/limited
- ❓ May require sales contact
- ❓ May need credit card upfront

**Verdict**: Deepgram's free tier is much better for POC development.

### 4. Documentation & Developer Experience

**Deepgram**:

- ✅ Excellent documentation
- ✅ Many code examples
- ✅ Active community
- ✅ Good SDK support
- ✅ Clear API reference

**Soniox**:

- ⚠️ Less documented (newer)
- ⚠️ Fewer examples
- ⚠️ Smaller community
- ⚠️ May need more trial-and-error

**Verdict**: Deepgram has better developer experience.

### 5. Features & Options

**Deepgram**:

- ✅ Speaker diarization
- ✅ Custom vocabulary
- ✅ Profanity filtering
- ✅ 30+ languages
- ✅ Multiple model options
- ✅ Webhooks

**Soniox**:

- ✅ Real-time streaming
- ✅ Good accuracy
- ✅ 15+ languages
- ⚠️ May have fewer advanced features

**Verdict**: Deepgram offers more features and options.

### 6. Reliability & Proven Track Record

**Deepgram**:

- ✅ Used by many companies
- ✅ Proven reliability
- ✅ Established service
- ✅ Good uptime

**Soniox**:

- ⚠️ Newer service
- ✅ Used in reference implementation
- ⚠️ Less proven at scale

**Verdict**: Deepgram has longer track record, but Soniox works well (per reference).

---

## Recommendation

### For Vantum POC: **Deepgram**

**Reasons**:

1. **Generous Free Tier**: 12,000 minutes/month is perfect for POC

   - No cost during development
   - Enough for extensive testing
   - Can build full POC without worrying about costs

2. **Better Documentation**: Easier to implement and debug

   - Faster development
   - More examples and resources
   - Better developer experience

3. **Cost-Effective**: Lower cost per minute

   - Important for B2B SaaS scaling
   - Better unit economics

4. **Proven Reliability**: Established service

   - Less risk for production
   - Better support

5. **Sufficient Latency**: 200-300ms is excellent
   - Good enough for conversational AI
   - Users won't notice difference vs 100-200ms
   - Speculative generation will mask any latency difference

### When to Consider Soniox

Consider Soniox if:

- **Latency is critical**: If you need absolute lowest latency
- **Cost is not primary concern**: If pricing is acceptable
- **Reference implementation**: If you want to follow reference exactly
- **After POC**: Test both in production and switch if Soniox performs significantly better

---

## Action Items

1. ✅ **Start with Deepgram** for POC
2. 📋 **Verify Soniox pricing** (contact sales if needed)
3. 🧪 **Test both** in parallel during POC (if possible)
4. 📊 **Compare performance**:
   - Latency measurements
   - Accuracy on your use case
   - Cost at your volume
   - Developer experience
5. 🔄 **Switch if needed** (Soniox if significantly better)

---

## Next Steps

1. **Sign up for Deepgram**:

   - Get free tier (12,000 min/month)
   - Test WebSocket API
   - Verify latency meets requirements

2. **Research Soniox**:

   - Contact sales for pricing
   - Check free tier availability
   - Test API if possible

3. **Implement with Deepgram**:

   - Build POC with Deepgram
   - Measure actual latency
   - Test accuracy

4. **Evaluate Later**:
   - Compare both in production
   - Switch if Soniox offers significant advantages

---

## Resources

- **Deepgram**: https://deepgram.com/pricing
- **Deepgram Docs**: https://developers.deepgram.com/
- **Soniox**: https://soniox.com (verify pricing page)
- **Soniox Docs**: Check official documentation

---

## Summary

**Recommendation**: **Deepgram** for POC

**Key Factors**:

- ✅ 12,000 minutes/month free (excellent for POC)
- ✅ Better documentation and developer experience
- ✅ Lower cost (~$0.0043/min)
- ✅ Sufficient latency (200-300ms)
- ✅ Proven reliability
- ✅ More features and options

**Soniox Advantages**:

- Lower latency (100-200ms)
- Used in reference implementation
- May be better for ultra-low latency needs

**Final Decision**: Start with Deepgram, test Soniox in parallel, switch if Soniox proves significantly better for your specific use case.
