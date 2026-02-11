# Consensus Engine

## Overview
The project builds an online consensus management platform that structures debates, reduces misinformation, and helps users reach agreement through AI-assisted mediation. It uses LLMs for neutral moderation, argument summarisation, conflict detection, and guidance toward compromise. Users can tag evidence from credible sources, browse ongoing discussions, and view final consensus outcomes with supporting references. The system runs on Next.js/React with a MongoDB backend for arguments, evidence, and consensus data.

## Core capabilities
- Structured debates with topics, arguments, comments, votes, and ontology tags for consistent categorisation
- AI assistance for summarisation, conflict detection, neutrality checks, and guidance toward compromise via OpenAI
- Evidence tagging with source links and visibility into supporting references for consensus outcomes
- User accounts and profiles to participate in discussions and track contributions
- Pre-computed ontology embeddings to speed classification and reduce API calls

## Tech stack
- Next.js (App Router) + React + TypeScript
- MongoDB with Mongoose for persistence
- OpenAI and xAI (Grok) APIs for AI-assisted moderation and summarisation
- Vitest for unit tests, ESLint for linting
- Bootstrap/Bootswatch UI, NextAuth-based authentication, Azure Communication Email for outbound email

## Getting started
1) Install Node.js 22+ and npm.
2) Install dependencies: `npm install` (or `npm ci`).
3) Create `.env` with at least:
	- `MONGODB_URI` — MongoDB connection string
	- `OPENAI_API_KEY` — OpenAI key for AI features
	- `AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING` — required if you want email functionality. Emails are sent out when a user registers or requests a password reset. See Microsoft Azure Communication Services docs for setup.
	- Optional: `GROK_API_KEY` to enable Grok routing
	- Optional: `FORCE_GROK_PROVIDER=true` to force all AI responses through Grok
	- Optional: `OPENAI_RESPONSES_MODEL` to override the default OpenAI responses model
	- Optional: `GROK_RESPONSES_MODEL` to override the default Grok responses model
- `GOOGLE_STORAGE_BUCKET_NAME` and `GOOGLE_SERVICE_ACCOUNT_KEY` if you want to enable Google Cloud Storage for file uploads. Without this, the file upload functionality will not work. Set up a Google Cloud project, create a storage bucket, and generate a service account key JSON file for authentication. Ensure that the service account has appropriate permissions to access the storage bucket and populate the environment variable `GOOGLE_SERVICE_ACCOUNT_KEY` with the content of the JSON key file.
- `IMAGE_PROCESSING_ENABLED` (optional; set to `false` to skip image processing on upload).
- `IMAGE_OUTPUT_PREFIX`, `IMAGE_THUMB_PREFIX`, `IMAGE_ORIGINAL_PREFIX`, `IMAGE_ORIGINAL_THUMB_PREFIX` (optional overrides for image storage prefixes).
- `IMAGE_SAFETY_CHECKS_ENABLED`, `IMAGE_SENSITIVE_LIKELIHOOD`, `IMAGE_SENSITIVE_FIELDS`, `IMAGE_BLUR_SIGMA`, `IMAGE_THUMB_SIZE` (optional controls for sensitive-image blur and thumbnails).
4) Run the app: `npm run dev` and open http://localhost:3000.

## Deployment
See `README.cloud.md` for instructions on deploying to Google Cloud Run using GitHub Actions.
This application can also be deployed to other platforms that support Next.js, such as Vercel.

## Project scripts
- `npm run dev` — start the dev server
- `npm run build` / `npm run start` — production build and serve
- `npm run lint` — lint `src/app/**/*.{js,ts,tsx}`
- `npm run test` — run unit tests
- `npm run test:ci` — run tests with coverage and JUnit report to `reports/junit.xml`
- `npm run populate` — seed the database (requires `MONGODB_URI`)
- `npm run generate-data` — generate sample data fixtures
- `npm run generate-embeddings` — rebuild ontology embeddings after category changes
- `npm run set-admin -- <userId|email>` — promote a user to admin (sets `isAdmin=true`)

## User roles and moderation
There are three types of user:

- **Administrator** — has **global access to all moderator capabilities** and can:
  - Delete any comment, post, or topic
  - Delete any user
  - Suspend any user (prevents them from logging in but preserves the content they posted)
  - Remove or change any user avatar
  - Review and approve/remove an avatar flagged by Google Vision AI as inappropriate
  - Approve or remove a post, topic, or comment flagged by the automated moderation system and hidden from view
  - Access the global **Moderation** page from the menu
  - Access moderator mode on any topic
  - Manually promote or demote a moderator on any topic
  - Disable automatic moderator promotion on a topic (preventing new moderators unless manually added)
  - Enable automatic moderator promotion on a topic (allowing the system to create moderators again)

  Administrators must be promoted using a command line script (`npm run set-admin -- <userId|email>`) and are intended to be a small number of users who manage the site.

- **Moderator** — a trusted user with moderation capabilities on **specific topics** they moderate, and can:
  - Delete any comments or posts within the topic
  - Approve or remove a post or comment flagged by the automated moderation system and hidden from view within the topic
  - Access moderator mode on the topic

- **User** — an ordinary user with no extra privileges, but with a hidden trust score that influences automated moderation decisions. A moderator is treated as an ordinary user in topics where they are not a moderator.

### Promote an administrator
You can promote a user via the CLI script (requires `MONGODB_URI`):

```bash
npm run set-admin -- user@example.com
# or
npm run set-admin -- 64f0c2a7a3b5c2a123456789
```

### Automatic moderator promotion/demotion
To be automatically promoted to **Moderator** for a topic, a user must meet all of the following criteria:

- At least 5 posts/comments in the topic, unless they created the topic
- Member of the site for at least a month
- At least 50 posts/comments globally
- High trust score

A moderator should be automatically **demoted** for a topic if:

- They receive a high number of downvotes and have a downvote-upvote ratio greater than 40% downvotes, with at least 50 total upvotes/downvotes on their posts in that topic

Additional rules:

- If a user meets the global requirements and they create the topic or make one of the first 5 posts/comments, they can be promoted without meeting the minimum post requirement for that topic.
- Administrators may manually promote or demote a moderator on any topic at their discretion, without these requirements being satisfied.

## Data and embeddings
The ontology classification service categorizes topics and arguments. Embeddings are pre-computed and checked into the repo to avoid runtime generation.

To regenerate embeddings after updating `ontology_categories.json`:

```bash
npm run generate-embeddings
```

This will:
1. Read categories from `ontology_categories.json`
2. Generate embeddings using the OpenAI API
3. Save them to `ontology_embeddings.json`

**Note:** set `OPENAI_API_KEY` before running the script. If the embeddings file is missing or invalid, the service falls back to runtime generation.

## Testing and CI
- `npm run test` / `npm run test:ci` use Vitest (jsdom) with coverage. CI publishes JUnit results from `reports/junit.xml` and coverage to Codecov.
- `npm run lint` enforces the TypeScript/Next.js style guide.

## Project layout (high level)
- `src/app` — App Router pages, components, API routes, services, models, and scripts
- `src/app/services` — domain services (auth, email, ontology, OpenAI, OTP, password)
- `src/app/models` — Mongoose schemas for topics, arguments, comments, votes, users
- `public` — static assets
- `ontology_categories.json` / `ontology_embeddings.json` — ontology data used by the classifier

## Environment variables
- `MONGODB_URI`: MongoDB connection string for application data.
- `OPENAI_API_KEY`: OpenAI API key enabling AI summarisation, moderation, and embeddings.
- `OPENAI_RESPONSES_MODEL` (optional): Override the default model used for OpenAI responses (defaults to `gpt-5.2`).
- `GROK_API_KEY` (optional): xAI API key used when routing AI requests to Grok.
- `GROK_RESPONSES_MODEL` (optional): Override the default model used for Grok responses (defaults to `grok-4-1-fast-non-reasoning`).
- `FORCE_GROK_PROVIDER` (optional): Set to `true` to send all AI response requests to Grok instead of OpenAI.
- `AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING`: Azure Communication Services connection string for sending email.
- `NEXTAUTH_SECRET`: Secret used by NextAuth for signing/encrypting auth tokens.
- `NEXTAUTH_URL`: Base URL for NextAuth callbacks (e.g., `http://localhost:3000`).
- `NEXTJS_APP_BASE_URL`: Base URL used by the frontend for links/emails.
- `NODE_ENV`: Node environment (`development`, `production`, etc.).
- `DATABASE_URL`: (Optional/legacy) Prisma-style connection string; not used by the current Mongo-backed app.
- `EMAIL_SENDER_ADDRESS`: Email address used as the sender for outbound emails.
