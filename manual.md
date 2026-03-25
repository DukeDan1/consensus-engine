# User manual

## Outline
- [Introduction](#introduction)
- [Accessing the application](#accessing-the-application)
- [Creating an account and signing in](#creating-an-account-and-signing-in)
- [Using the application](#using-the-application)
- [Profile and account management](#profile-and-account-management)
- [Moderation and administration](#moderation-and-administration)
- [Deploying locally](#deploying-locally)
- [Troubleshooting](#troubleshooting)

## Introduction

Consensus Engine is a web application for structured public discussion. Users create debate topics, post arguments, reply with comments, vote on contributions, and review AI-generated summaries and extracted facts. The system is designed to make large discussions easier to follow and to surface factual claims that can later be reassessed as more votes and discussion are added.

## Accessing the application

The recommended way to use the system is the deployed application:

- https://ce.dukedan.uk

This instance is already configured and does not require any setup. It is the best option if you want to evaluate the platform as an end user.

If you need to run the project yourself, see [Deploying locally](#deploying-locally).

## Creating an account and signing in

When you open the deployed site, the landing page offers two options:

- `Get Started` / `Create Free Account` to register
- `Log In` to access an existing account

To register:

1. Open the registration page.
2. Enter your email address.
3. Enter a password.
4. Enter your name.
5. Submit the form.

After registration, the system can send a welcome email if email delivery is configured.

If you already have an account:

1. Open the login page.
2. Enter your email and password.
3. Submit the form.

If you forget your password:

1. Open `Forgot password`.
2. Enter your email address.
3. Follow the reset link sent by email.
4. Set a new password on the reset page.

## Using the application

### Main navigation

After signing in, the main entry point is the `Debates` page at `/topics`.

The header gives access to:

- Search
- Notifications
- Your profile
- The moderation queue if you are an administrator
- Logout

### Browsing debates

The debates page lists available topics. From here you can:

- Open an existing debate
- Search for content
- Filter or browse by topic
- Create a new topic with the `New Topic` button

When creating a topic, you provide:

- A title
- An optional description

The application then suggests ontology categories automatically based on the text you entered.

### Inside a debate

Opening a topic takes you to the main discussion page for that debate. This page shows:

- The topic title and description
- The topic creator
- Ontology/category badges
- The discussion feed
- Controls to open the AI summary and facts views

You can switch the discussion ordering between:

- `Top`
- `New`

Depending on your permissions, you may also see:

- `Moderator mode`
- Topic administration controls

### Posting arguments and comments

Within a topic, users contribute to the discussion by adding arguments and comments.

- Arguments are top-level contributions to the debate.
- Comments are replies beneath an argument.

As you use the application, you should expect AI assistance to be involved in the background for:

- Identifying whether a post contains factual claims
- Producing shorter summaries of arguments where useful
- Moderation checks
- Extracting factual highlights from the discussion

Some content may be hidden or require moderator review if it is flagged by moderation checks.

### Voting

Users can vote on discussion content to indicate support or disagreement.

- Posts and comments can receive upvotes and downvotes.
- Facts can also be voted on.
- Fact votes may include reasoning, which can later inform reassessment.

Voting helps rank discussion content and contributes to the system’s confidence in extracted facts.

### AI summary view

Each topic has a summary page available from the `Summary` button.

The summary page groups discussion points into:

- `For`
- `Against`
- `Neutral`

This is intended to help users understand the overall shape of a discussion without reading every post in full.

### Facts view

Each topic also has a `Facts` page.

This page displays factual highlights extracted from the debate, along with:

- Vote counts
- Overall score
- Reassessment information when available

If no facts have been extracted yet, the page will say so explicitly. Facts are based on AI-backed analysis of the discussion and should be treated as discussion aids rather than unquestionable truth.

### Notifications

Signed-in users can subscribe to topic notifications. Depending on configuration and profile preferences, the system can notify users about activity such as:

- Topic updates
- New arguments
- User-related activity
- Moderation-related events

## Profile and account management

Every user has a profile page.

From your profile, you can:

- View your avatar, display name, account age, and contribution statistics
- Edit your bio
- Upload or change your avatar
- Review recent posts
- Review recent comments
- Change notification preferences
- Delete your account

Avatar uploads may be processed and safety-checked automatically. If an avatar is flagged, it can require administrator review.

Administrators also see additional controls on user profile pages, such as account suspension actions.

## Moderation and administration

The system supports three practical permission levels:

- `User`
- `Moderator`
- `Administrator`

### Users

Ordinary users can:

- Create topics
- Post arguments
- Add comments
- Vote
- Manage their own profile

### Moderators

Moderators operate on specific topics. A moderator can:

- Review content within topics they moderate
- Remove posts or comments within those topics
- Review flagged content within those topics
- Use moderator mode on the topic page

Moderator status can be assigned automatically based on participation and trust, or manually by an administrator.

### Administrators

Administrators have site-wide control. They can:

- Access the global moderation queue at `/moderation`
- Review flagged topics, arguments, comments, and avatars
- Suspend users
- Promote or demote moderators
- Remove inappropriate content

Administrators are not created through the web interface. A user must be promoted from the command line with:

```bash
npm run set-admin -- user@example.com
```

You can also use a MongoDB user id instead of an email address.

## Deploying locally

### Requirements

Install the following first:

- Node.js 22 or later
- npm
- A MongoDB instance

Optional external services:

- OpenAI, Grok, or OpenRouter for AI features
- Azure Communication Services for email
- Google Cloud Storage for avatar and image uploads

### 1. Install dependencies

From the project root:

```bash
npm install
```

### 2. Create your `.env` file

Create a `.env` file in the repository root. At minimum, the application needs:

```env
MONGODB_URI=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
NEXTJS_APP_BASE_URL=http://localhost:3000
OPENAI_API_KEY=
```

Additional commonly used variables:

```env
EMAIL_SENDER_ADDRESS=DoNotReply@m.dukedan.uk
DISABLE_SENDING_EMAILS=true

# Optional alternative AI providers
# GROK_API_KEY=
# OPENROUTER_API_KEY=

# Optional model overrides
# OPENAI_RESPONSES_MODEL=gpt-5.4
# OPENAI_MODERATION_MODEL=gpt-5.4
# OPENAI_EMBED_MODEL=

# Optional image upload support
# GOOGLE_STORAGE_BUCKET_NAME=
# GOOGLE_SERVICE_ACCOUNT_KEY=

# Optional image processing controls
# IMAGE_PROCESSING_ENABLED=true
# IMAGE_SAFETY_CHECKS_ENABLED=true
# IMAGE_OUTPUT_PREFIX=processed/
# IMAGE_THUMB_PREFIX=thumbs/128/
# IMAGE_ORIGINAL_PREFIX=originals/
# IMAGE_ORIGINAL_THUMB_PREFIX=originals/thumbs/128/
# IMAGE_BLUR_SIGMA=50
# IMAGE_THUMB_SIZE=128
# IMAGE_SENSITIVE_LIKELIHOOD=VERY_LIKELY
# IMAGE_SENSITIVE_FIELDS=adult,violence,racy,medical

# Optional feature flags
# MODERATION_ENABLED=true
# CONTENT_FACT_CHECK_ENABLED=true
# EVIDENCE_FACT_CHECK_ENABLED=true
# FACT_RECHECK_ENABLED=false
```

Notes:

- `NEXTAUTH_SECRET` is required for authentication.
- `NEXTAUTH_URL` and `NEXTJS_APP_BASE_URL` should both be `http://localhost:3000` for a standard local setup.
- If `DISABLE_SENDING_EMAILS=true`, the app will not try to send real emails.
- Without storage credentials, image upload features will not work.
- Without an AI provider key, AI-assisted features such as summaries, moderation, and fact extraction will not function correctly.

### 3. Ensure the ontology embeddings file exists

If you received the project without `ontology_embeddings.json`, obtain it before running the app.

You can download it directly:

```bash
curl -o ontology_embeddings.json "https://storage.googleapis.com/consensus-engine-public/ontology_embeddings.json"
```

Or generate it yourself:

```bash
npm run generate-embeddings
```

Generating embeddings requires a configured AI API key.

### 4. Start the development server

Run:

```bash
npm run dev
```

Then open:

- http://localhost:3000

### 5. Optional setup scripts

Useful project scripts include:

```bash
npm run populate
npm run generate-data
npm run set-admin -- user@example.com
```

There are also user simulation scripts for load and scenario testing:

```bash
npm run user-simulation-create-users
npm run user-simulation-content
npm run user-simulation-scenarios
npm run user-simulation-fact-voting
```

## Troubleshooting

### The app starts but AI features fail

Check that at least one supported AI provider key is configured:

- `OPENAI_API_KEY`
- `GROK_API_KEY`
- `OPENROUTER_API_KEY`

### Registration or password reset does not send email

For local development, set:

```env
DISABLE_SENDING_EMAILS=true
```

If you want real email delivery, configure:

- `AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING`
- `EMAIL_SENDER_ADDRESS`

### Image uploads fail

Check:

- `GOOGLE_STORAGE_BUCKET_NAME`
- `GOOGLE_SERVICE_ACCOUNT_KEY`

If these are not configured, upload-related features will fail.

### Authentication behaves incorrectly

Verify:

- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `NEXTJS_APP_BASE_URL`

For local use, all application URLs should consistently point to `http://localhost:3000`.

### Facts or summaries are missing

This can happen when:

- There is not enough discussion content yet
- AI configuration is missing
- Fact extraction or moderation feature flags have been disabled

In early testing, it is normal for a new topic to have no extracted facts or summary data until users begin posting.
