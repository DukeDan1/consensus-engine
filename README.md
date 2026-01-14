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
- OpenAI API for AI-assisted moderation and summarisation
- Vitest for unit tests, ESLint for linting
- Bootstrap/Bootswatch UI, NextAuth-based authentication, Azure Communication Email for outbound email

## Getting started
1) Install Node.js 22+ and npm.
2) Install dependencies: `npm install` (or `npm ci`).
3) Create `.env` with at least:
	- `MONGODB_URI` — MongoDB connection string
	- `OPENAI_API_KEY` — OpenAI key for AI features
	- `AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING` — required if you want email functionality. Emails are sent out when a user registers or requests a password reset. See Microsoft Azure Communication Services docs for setup.
	- Optional: `OPENAI_RESPONSES_MODEL` to override the default model
	- `GOOGLE_STORAGE_BUCKET_NAME` and `GOOGLE_SERVICE_ACCOUNT_KEY` if you want to enable Google Cloud Storage for file uploads. Without this, the file upload functionality will not work. Set up a Google Cloud project, create a storage bucket, and generate a service account key JSON file for authentication. Ensure that the service account has appropriate permissions to access the storage bucket and populate the environment variable `GOOGLE_SERVICE_ACCOUNT_KEY` with the content of the JSON key file.
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

## Admin users
Admins have access to the moderation queue and can delete any topic, argument, or comment. They can also view and manage content that is held for review or flagged as spam by the moderation system.

### Add an admin user
You can promote a user via the CLI script (requires `MONGODB_URI`):

```bash
npm run set-admin -- user@example.com
# or
npm run set-admin -- 64f0c2a7a3b5c2a123456789
```

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
- `OPENAI_RESPONSES_MODEL` (optional): Override the default model used for AI responses (defaults to `gpt-5.2`).
- `AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING`: Azure Communication Services connection string for sending email.
- `NEXTAUTH_SECRET`: Secret used by NextAuth for signing/encrypting auth tokens.
- `NEXTAUTH_URL`: Base URL for NextAuth callbacks (e.g., `http://localhost:3000`).
- `NEXTJS_APP_BASE_URL`: Base URL used by the frontend for links/emails.
- `NODE_ENV`: Node environment (`development`, `production`, etc.).
- `DATABASE_URL`: (Optional/legacy) Prisma-style connection string; not used by the current Mongo-backed app.
- `EMAIL_SENDER_ADDRESS`: Email address used as the sender for outbound emails.
