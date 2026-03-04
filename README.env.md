# Environment Variables

This document lists every environment variable used by Consensus Engine, grouped by category. Copy the [starter `.env`](#starter-env) at the bottom to get going quickly.

---

## 🤖 AI Provider — API Keys & Endpoints

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENAI_API_KEY` | **Yes** | — | API key for the OpenAI provider. At least one AI provider key must be set. |
| `GROK_API_KEY` | No | — | API key for the Grok (xAI) provider. Enables Grok as a fallback or forced provider. |
| `GROK_BASE_URL` | No | `https://api.x.ai/v1` | Base URL for the Grok API endpoint. |
| `OPENROUTER_API_KEY` | No | — | API key for the OpenRouter provider. Enables OpenRouter as a fallback or forced provider. |
| `OPENROUTER_BASE_URL` | No | `https://openrouter.ai/api/v1` | Base URL for the OpenRouter API endpoint. |

## 🧠 AI Provider — Model Selection

Each provider has a default model that can be overridden via env var. Per-call overrides in code take the highest priority.

| Variable | Default | Description |
|---|---|---|
| `OPENAI_RESPONSES_MODEL` | `gpt-5.2` | Default text/responses model for OpenAI. Used across all services (moderation, fact-checking, analysis, ontology, simulation scripts). |
| `OPENAI_MODERATION_MODEL` | Value of `OPENAI_RESPONSES_MODEL` → `gpt-5.2` | Model used specifically for AI content moderation. Falls back to the general OpenAI model. |
| `OPENAI_EMBED_MODEL` | — | Model used for generating text embeddings (ontology classification). |
| `OPENAI_IMAGE_MODEL` | `gpt-image-1.5` | Model used for OpenAI image generation. |
| `GROK_RESPONSES_MODEL` | `grok-4-1-fast-non-reasoning` | Default text model for Grok responses. |
| `GROK_IMAGE_MODEL` | — | Model used for Grok image generation. |
| `OPENROUTER_RESPONSES_MODEL` | `openai/gpt-5.2` | Default text model for OpenRouter responses. |

## 🔀 AI Provider — Routing & Fallback

The routing service tries providers in this order: **forced provider → OpenAI → Grok → OpenRouter**. OpenAI requests are gated by a moderation check when fallback providers are available — if the content is flagged, the next provider in the chain is tried.

| Variable | Default | Description |
|---|---|---|
| `FORCED_AI_PROVIDER` | — | Force all AI requests to a specific provider: `openai`, `grok`, or `openrouter`. The forced provider is tried first; if unavailable (no API key), the remaining providers are tried as fallbacks. |
| `FORCED_AI_MODEL` | Provider's default model | When `FORCED_AI_PROVIDER` is set, use this specific model instead of the provider's default. |

### Examples

**Use Grok for everything:**
```env
FORCED_AI_PROVIDER=grok
FORCED_AI_MODEL=grok-4
GROK_API_KEY=xai-...
```

**Use OpenAI with Grok fallback (for moderation-flagged content):**
```env
OPENAI_API_KEY=sk-...
GROK_API_KEY=xai-...
```

**Override the default model for a single provider:**
```env
OPENAI_API_KEY=sk-...
OPENAI_RESPONSES_MODEL=gpt-4o
```

### Making AI calls with `executeWithFallback`

The routing service exposes two ways to make AI calls:

| Function | Use case |
|---|---|
| `routeResponsesClient()` | Returns a single `RoutedClient`. You call `routed.client.responses.create()` yourself. No automatic retry on request failure. |
| `executeWithFallback()` | **Recommended.** Picks the best provider, runs your callback, and automatically retries with the next provider if the request fails. |

Both functions accept the same `RoutingParams` and apply the same provider ordering, moderation gating, and forced-provider logic described above.

#### Basic usage

```ts
import { executeWithFallback } from "@/app/services/aiRoutingService";

const response = await executeWithFallback(
  { text: userInput, userId },
  async (routed) =>
    routed.client.responses.create({
      model: routed.model,
      input: [{ role: "user", content: userInput }],
      // Strip reasoning for Grok (it doesn't support the param)
      ...(routed.provider === "grok" ? {} : { reasoning: { effort: "low" } }),
    }),
);
```

If OpenAI returns a 500, the call is transparently retried against Grok (and then OpenRouter) — no extra code needed.

#### How the fallback chain works

1. Build the ordered candidate list (forced → openai → grok → openrouter), skipping any provider without an API key.
2. If OpenAI is up first **and** fallbacks exist, run a moderation check. If flagged, skip to the next candidate.
3. Call your callback with the selected `RoutedClient`.
4. If the callback **throws**, log a warning and move to the next candidate.
5. If **all** candidates fail, throw the last error.
6. If **no** providers are configured, throw `"No AI providers configured"`.

#### Using `routeResponsesClient` instead

If you need the `RoutedClient` for something other than a single request (e.g. streaming, or making multiple calls with the same provider), use `routeResponsesClient` directly:

```ts
import { routeResponsesClient } from "@/app/services/aiRoutingService";

const routed = await routeResponsesClient({ text: userInput });
if (!routed) throw new Error("No AI provider available");

const response = await routed.client.responses.create({
  model: routed.model,
  input: [{ role: "user", content: userInput }],
});
```

Note: this does **not** retry on request failure — you only get the first eligible provider.

## 🗄️ Database

| Variable | Required | Default | Description |
|---|---|---|---|
| `MONGODB_URI` | **Yes** | — | MongoDB connection string (e.g. `mongodb+srv://user:pass@cluster.mongodb.net/dbname`). |

## 🔐 Authentication

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXTAUTH_SECRET` | **Yes** | — | Secret used by NextAuth.js for JWT signing and session encryption. Generate with `openssl rand -base64 32`. |
| `AUTH_SECRET` | No | — | Fallback for `NEXTAUTH_SECRET` (NextAuth v5 naming convention). Only used if `NEXTAUTH_SECRET` is not set. |

## 🌐 Application URL

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXTAUTH_URL` | **Yes** | — | Server-side base URL of the app (e.g. `http://localhost:3000`). Used for API calls, email links, password reset URLs, and SSR pages. |
| `NEXT_PUBLIC_APP_URL` | No | `""` | Client-exposed app URL. Used as a fallback in email templates. Prefix `NEXT_PUBLIC_` makes it available in browser code. |

## 📧 Email (Azure Communication Services)

| Variable | Required | Default | Description |
|---|---|---|---|
| `AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING` | For emails | — | Azure Communication Services connection string. Required to send transactional emails (password reset, account notifications). |
| `EMAIL_SENDER_ADDRESS` | No | `DoNotReply@m.dukedan.uk` | "From" address used for outgoing emails. |
| `DISABLE_SENDING_EMAILS` | No | `false` | When set to `true`, prevents actual emails from being sent (useful for local development and testing). |

## ☁️ Google Cloud Storage

| Variable | Required | Default | Description |
|---|---|---|---|
| `GCS_BUCKET_NAME` | For uploads | — | GCS bucket name for storing uploaded images. |
| `GCS_SERVICE_ACCOUNT_KEY` | For uploads | — | GCS service account key (JSON string or base64-encoded). Also used for Google Vision SafeSearch. |
| `GCS_PROCESSED_PREFIX` | No | — | GCS path prefix for processed images. |
| `GCS_THUMB_PREFIX` | No | `thumbs/128/` | GCS path prefix for thumbnail images. |
| `GCS_ORIGINAL_PREFIX` | No | `originals/` | GCS path prefix for original uploads. |
| `GCS_ORIGINAL_THUMB_PREFIX` | No | `originals/thumbs/128/` | GCS path prefix for original-image thumbnails. |

## 🖼️ Image Processing & Safety

| Variable | Default | Description |
|---|---|---|
| `IMAGE_PROCESSING_ENABLED` | `true` | Master toggle for the image processing pipeline on upload. Set to `false` to disable. |
| `IMAGE_SAFETY_ENABLED` | `true` | Enables Google Vision SafeSearch on uploaded images. Requires `GCS_SERVICE_ACCOUNT_KEY`. Set to `false` to disable. |
| `IMAGE_BLUR_SIGMA` | `50` | Gaussian blur sigma applied to images flagged as sensitive by SafeSearch. |
| `IMAGE_THUMB_SIZE` | `128` | Thumbnail dimension in pixels (minimum `32`). |
| `IMAGE_SAFETY_THRESHOLD` | `VERY_LIKELY` | SafeSearch likelihood threshold for flagging images. Options: `POSSIBLE`, `LIKELY`, `VERY_LIKELY`. Lower values are more aggressive. |
| `IMAGE_SENSITIVE_FIELDS` | `adult,violence,racy,medical` | Comma-separated SafeSearch categories to check. |

## 🚦 Feature Flags

| Variable | Default | Description |
|---|---|---|
| `MODERATION_ENABLED` | `true` | Toggle for AI content moderation on user-submitted text. Set to `false` to disable. |
| `CONTENT_FACT_CHECK_ENABLED` | `true` | Toggle for AI fact-checking on arguments and comments. Set to `false` to disable. |
| `EVIDENCE_FACT_CHECK_ENABLED` | `true` | Toggle for AI fact-checking on evidence/citation attachments. Set to `false` to disable. |
| `FACT_RECHECK_ENABLED` | `false` | Toggle for periodic (daily) AI reassessment of facts based on user votes and feedback. Set to `true` to enable. Requires a cron job calling `POST /api/admin/facts-recheck`. |

## 🐳 Infrastructure (Docker)

These are set in the `Dockerfile` and generally don't need to be changed.

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `production` | Node.js environment mode. |
| `PORT` | `8080` | Port the Next.js server listens on inside the container. |

---

## Starter `.env`

Copy this to `.env` in the project root and fill in the required values:

```env
# ── Database ──
MONGODB_URI=

# ── Auth ──
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000

# ── AI Provider (at least one key required) ──
OPENAI_API_KEY=
# GROK_API_KEY=
# OPENROUTER_API_KEY=

# ── AI Model Overrides (optional) ──
# OPENAI_RESPONSES_MODEL=gpt-5.2
# GROK_RESPONSES_MODEL=grok-4-1-fast-non-reasoning
# OPENROUTER_RESPONSES_MODEL=openai/gpt-5.2

# ── Force a specific provider (optional) ──
# FORCED_AI_PROVIDER=openai
# FORCED_AI_MODEL=gpt-5.2

# ── Email (optional) ──
# AZURE_COMMUNICATION_CONNECTION_STRING=
# EMAIL_SENDER_ADDRESS=DoNotReply@m.dukedan.uk

# ── Image uploads (optional) ──
# GCS_BUCKET_NAME=
# GCS_SERVICE_ACCOUNT_KEY=

# ── Feature Flags (all default to true) ──
# MODERATION_ENABLED=true
# CONTENT_FACT_CHECK_ENABLED=true
# EVIDENCE_FACT_CHECK_ENABLED=true
```
