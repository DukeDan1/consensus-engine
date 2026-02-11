# User Simulation

End-to-end simulation tooling that creates realistic users, populates the platform with AI-generated discussion content, and evaluates every AI system running on the site.

## Prerequisites

- The app must be running locally (default `http://localhost:3000`)
- Environment variables configured in `.env`: `OPENAI_API_KEY` (required unless forcing Grok), plus optionally `GROK_API_KEY`, `USE_GROK_AS_BACKUP`, `FORCE_GROK_PROVIDER`, `OPENAI_RESPONSES_MODEL`, `GROK_RESPONSES_MODEL`
- MongoDB connected and accessible

## Configuration

All simulation settings live in [`config.json`](./config.json):

| Key                | Default                        | Description                                       |
|--------------------|--------------------------------|---------------------------------------------------|
| `appUrl`           | `http://localhost:3000`        | Base URL of the running app                       |
| `baseEmailAddress` | `danieltshields@yahoo.com`     | Email template — usernames are inserted as `+` aliases |
| `numUsers`         | `10`                           | Number of users to create (Step 1 only)           |
| `concurrency`      | `10`                           | Max parallel API requests per batch               |

## Step 1: Create Users

Generates simulated user profiles via AI, registers them, logs in, generates + uploads AI avatars, and sets bios.

```bash
npm run user-simulation-create-users
```

**What it does:**

1. Calls OpenAI/Grok to generate realistic user profiles (name, age, gender, bio)
2. Registers each user via `POST /api/register`
3. Logs in via `POST /api/auth/login` to get a bearer token
4. Generates an AI avatar via `POST /api/profile/avatar/generate`
5. Uploads the avatar via `POST /api/uploads`
6. Updates the user profile with avatar + bio via `POST /api/user/update`

**Output:** `simulation_<timestamp>.json` in the project root, containing all user credentials and profile data. This file is used as input for Step 2.

## Step 2: Simulate Content & Evaluate AI

Loads saved users, generates discussion content, and evaluates every AI system on the platform.

```bash
npm run user-simulation-content -- simulation_<timestamp>.json
```

### Pipeline Phases

#### Phase 1 — Authentication
Logs in all registered users from the saved file using batched `Promise.all`.

#### Phase 2 — Topic Creation
AI generates 5 diverse debate topics spanning politics, technology, environment, ethics, etc. Each is posted by a randomly selected user via `POST /api/topics`.

#### Phase 3 — Argument Creation
For each topic, AI generates 6 arguments with **deliberately varied quality**:
- Well-reasoned arguments with evidence
- Passionate opinions
- Low-effort one-liners
- Dubious factual claims (to test fact-checking)

Arguments are spread across `for`, `against`, and `neutral` sides.

#### Phase 4 — Comment Creation
For each argument, AI generates 3 natural comments — agreements, rebuttals, questions, short reactions — posted by random users.

#### Phase 5 — Voting
Every user randomly votes (60% probability, upvote-biased) on topics, arguments, and comments. This exercises the trust system and score calculations.

#### Phase 6 — AI Evaluation
Waits 8 seconds for background AI tasks to finish, then fetches full topic details and evaluates:

| AI System                | Metrics                                                                 |
|--------------------------|-------------------------------------------------------------------------|
| **Moderation**           | Visible / needs_review / noise / blocked / hidden breakdown             |
| **Ontology Classification** | Coverage rate, categories per item, total categories assigned       |
| **Content Fact-Checking**| Verified / inaccurate / mixed / unverified verdict distribution         |
| **AI Analysis**          | Fact vs opinion classification, justification presence                  |
| **Evidence Fact-Checking** | Per-evidence verdict breakdown                                       |

Finally, the aggregate stats and sample content are sent to AI for a structured effectiveness summary with strengths, weaknesses, and recommendations.

### Output

`content_simulation_<timestamp>.json` containing:

```
{
  timestamp, usersFile, usersLoaded, usersAuthenticated,
  topicsCreated,       // all created topics
  argumentsCreated,    // all created arguments
  commentsCreated,     // all created comments
  votesCast,           // all votes with resulting counts
  aiEvaluations,       // per-topic AI decisions on every item
  aiSystemReport,      // aggregate statistics across all AI systems
  aiSummary,           // AI-generated effectiveness analysis
  errors               // any failures during the run
}
```

## Full Simulation Run

```bash
# 1. Start the app
npm run dev

# 2. Create simulated users
npm run user-simulation-create-users

# 3. Run content simulation (use the output file from step 2)
npm run user-simulation-content -- simulation_1739212345678.json
```

## Simulation Constants

These are defined at the top of `simulateContent.ts` and can be adjusted:

| Constant                  | Default | Description                                    |
|---------------------------|---------|------------------------------------------------|
| `TOPICS_PER_SIMULATION`   | `5`     | Number of debate topics to create              |
| `ARGUMENTS_PER_TOPIC`     | `6`     | Arguments generated per topic                  |
| `COMMENTS_PER_ARGUMENT`   | `3`     | Comments generated per argument                |
| `AI_PROCESSING_WAIT_MS`   | `8000`  | Wait time (ms) for background AI tasks         |
| `VOTE_PROBABILITY`        | `0.6`   | Probability each user votes on each item       |

With defaults, a single run creates approximately **5 topics, 30 arguments, 90 comments, and 400+ votes**.
