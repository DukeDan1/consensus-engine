# Cloud Deployment Guide (GCP + Azure Comms)

This guide shows how to set up Google Cloud for this app and deploy to Cloud Run with minimal workflow changes, plus how to configure Azure Communication Services (ACS) for email.

## 1) Prerequisites
- Node 22 locally (for testing) and npm.
- A MongoDB instance reachable from Cloud Run (e.g., Atlas). Note the connection string for `MONGODB_URI`.
- A Google Cloud project you can administer.
- A GitHub repository with Actions enabled.

## 2) Google Cloud project setup
1. **Create / select project** in the Cloud Console.
2. **Enable APIs**: Artifact Registry, Cloud Run, Cloud Build (for auth), Secret Manager (if you will store secrets there).
3. **Create Artifact Registry repo** (Docker format):
   - Name: `consensusengine-repo` (or adjust to match `REPO` in the workflow).
   - Location: `europe-west1` (or your chosen region — keep consistent with `REGION`).
4. **Create Cloud Storage bucket** for attachments:
   - Name: e.g., `consensus-engine-attachments`.
   - Enforce private access (no public ACLs). Note the bucket name for `GOOGLE_STORAGE_BUCKET_NAME`.
5. **Service account for CI/CD**:
   - Create a service account, e.g., `consensusengine-deployer`.
   - Grant roles: `roles/run.admin`, `roles/artifactregistry.writer`, `roles/iam.serviceAccountUser`, `roles/storage.admin` (for the attachment bucket), and `roles/secretmanager.secretAccessor` if using Secret Manager.
   - Generate a JSON key and store it as a GitHub Actions secret `GCP_CREDENTIALS` (the workflow already expects this).
   - Minimal workflow edits: update `env` values in `.github/workflows/main.yml` (see Section 4) if your project/region/repo differ.
## 2) Google Cloud project setup
1. **Create / select project** in the Cloud Console.
2. **Enable APIs**: Artifact Registry, Cloud Run, Cloud Build (for auth), Secret Manager (if you will store secrets there), Cloud Storage.
3. **Create Artifact Registry repo** (Docker format):
   - Name: `consensusengine-repo` (or adjust to match `REPO` in the workflow).
   - Location: `europe-west1` (or your chosen region — keep consistent with `REGION`).
4. **Create Cloud Storage bucket** for attachments:
   - Name: e.g., `consensus-engine-attachments`.
   - Location: align with your region (e.g., `eu`/`europe-west1`).
   - Access: uniform bucket-level access ON, public access prevention ON, no public ACLs.
   - Lifecycle (optional): add retention or auto-delete if desired.
   - Note the bucket name for `GOOGLE_STORAGE_BUCKET_NAME`.
5. **Enable Vision API (for sensitive-image detection)**:
   - Enable `vision.googleapis.com` in your project.
6. **Service account for CI/CD and signing URLs**:
   - Create a service account, e.g., `consensusengine-deployer`.
   - Grant roles: `roles/run.admin`, `roles/artifactregistry.writer`, `roles/iam.serviceAccountUser`, `roles/storage.objectAdmin` (bucket object access/signing), and `roles/secretmanager.secretAccessor` if using Secret Manager.
   - (Optional) Create a second narrower SA just for signing upload/read URLs with `roles/storage.objectAdmin` on the bucket; use its key for `GOOGLE_SERVICE_ACCOUNT_KEY_STORAGE`.
   - Generate a JSON key for the deployer (and signer if separate).
   - Store the deployer key JSON as GitHub secret `GCP_CREDENTIALS` (workflow expects this).
   - Store the signer key JSON as GitHub secret `GOOGLE_SERVICE_ACCOUNT_KEY_STORAGE` or put it in Secret Manager under that name (see below).
   - Minimal workflow edits: update `env` values in `.github/workflows/main.yml` (see Section 4) if your project/region/repo differ.
3. **Service account for CI/CD**:
   - Create a service account, e.g., `consensusengine-deployer`.
   - Grant roles: `roles/run.admin`, `roles/artifactregistry.writer`, `roles/iam.serviceAccountUser`, `roles/storage.objectAdmin`, `roles/secretmanager.secretAccessor` (if using Secret Manager).
   - Generate a JSON key; add it to GitHub as secret `GCP_CREDENTIALS`.
   - Minimal workflow edits: update `env` values in `.github/workflows/main.yml` (Section 4) if your project/region/repo differ.

### Adding service account credentials
- **GitHub secrets**: in repo Settings → Secrets and variables → Actions → New repository secret. Name it `GCP_CREDENTIALS` and paste the full JSON key. If using a separate signer key, add `GOOGLE_SERVICE_ACCOUNT_KEY_STORAGE`.
- **Google Secret Manager**: `gcloud secrets create GOOGLE_SERVICE_ACCOUNT_KEY_STORAGE --data-file=key.json` (or upload in console). Grant the deployer SA `roles/secretmanager.secretAccessor`. The deploy step already reads this name via `--set-secrets`.

## 3) Secrets and environment
You can supply env directly via `--set-env-vars` and secrets via `--set-secrets` (as the workflow does). Create these in Google Secret Manager (or replace with GitHub secrets + env vars):
- `DATABASE_URL` or `MONGODB_URI` (the workflow uses `MONGODB_URI` via secret name `DATABASE_URL:latest`).
- `AUTH_SECRET` (for `NEXTAUTH_SECRET`).
- `OPENAI_API_KEY`.
- `GOOGLE_SERVICE_ACCOUNT_KEY_STORAGE` (service account JSON for the storage bucket signer; can be the same key as `GCP_CREDENTIALS` or a narrower one with Storage Object Admin).
- `AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING` (for ACS email).

### Non-secret env to set in the deploy step
- `GOOGLE_STORAGE_BUCKET_NAME` (bucket created in step 2.4).
- `IMAGE_PROCESSING_ENABLED` (optional; set to `false` to skip image processing on upload).
- `IMAGE_OUTPUT_PREFIX` (defaults to `processed/`).
- `IMAGE_THUMB_PREFIX` (defaults to `thumbs/128/`).
- `IMAGE_ORIGINAL_PREFIX` (defaults to `originals/`).
- `IMAGE_ORIGINAL_THUMB_PREFIX` (defaults to `originals/thumbs/128/`).
- `IMAGE_SAFETY_CHECKS_ENABLED` (set `false` to skip SafeSearch).
- `IMAGE_SENSITIVE_LIKELIHOOD` (threshold like `POSSIBLE`, `LIKELY`, `VERY_LIKELY`).
- `IMAGE_SENSITIVE_FIELDS` (comma-separated fields, defaults to `adult,violence,racy,medical`).
- `IMAGE_BLUR_SIGMA` (blur strength; higher is stronger).
- `IMAGE_THUMB_SIZE` (thumbnail size, defaults to `128`).
- `NEXTJS_APP_BASE_URL` and `NEXTAUTH_URL` (your Cloud Run HTTPS URL after first deploy; you can redeploy to update).
- `OPENAI_RESPONSES_MODEL` (optional, defaults to `gpt-5.4`).
- `EMAIL_SENDER_ADDRESS` (from ACS setup below).
- `NODE_OPTIONS=--dns-result-order=ipv4first` (already in workflow).

## 4) Minimal workflow changes (GitHub Actions)
File: `.github/workflows/main.yml`
- Update `env` at the top if needed:
  - `GCP_PROJECT`: your project ID
  - `REGION`: Cloud Run region (e.g., `europe-west1`)
  - `AR_HOST`: `<region>-docker.pkg.dev`
  - `REPO`: Artifact Registry repo name
  - `WEB_SERVICE`: Cloud Run service name
- Ensure secret `GCP_CREDENTIALS` is set in GitHub with the service account key JSON.
- Ensure the Secret Manager secret names in `--set-secrets` exist (Section 3).
- No other job changes are required; the workflow already builds, pushes, and deploys using those vars.

## 5) First deployment
1. Commit your changes and push to `main` (the workflow runs on push to `main`).
2. After deploy, note the Cloud Run URL. Set `NEXTJS_APP_BASE_URL` and `NEXTAUTH_URL` to that value and redeploy (or update the workflow env for future runs).
3. Confirm the app can reach MongoDB (allowlisted IPs / SRV).
4. Verify file uploads to the GCS bucket using the app.

## 6) Azure Communication Services (Email) setup
1. In Azure Portal, create an **Azure Communication Services** resource in your subscription.
2. In ACS, set up an email domain (or use the default sandbox if acceptable). Add and verify your sender address.
3. From ACS, copy the **connection string**.
4. Set environment values:
   - `AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING`: the connection string.
   - `EMAIL_SENDER_ADDRESS`: the verified sender (e.g., `DoNotReply@example.com`).
5. In GitHub/Secret Manager, store the connection string as `AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING` so the deploy step can inject it. Keep `EMAIL_SENDER_ADDRESS` as a plain env var in the deploy step.
6. Test by registering a user or triggering a password reset; check that the email arrives. If blocked, ensure the sender is verified and DNS records (SPF/DKIM) are in place per ACS guidance.

## 7) Local testing checklist
- `npm run dev` with `.env` containing `MONGODB_URI`, `OPENAI_API_KEY`, `GOOGLE_STORAGE_BUCKET_NAME`, `GOOGLE_SERVICE_ACCOUNT_KEY`, `AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING`, `EMAIL_SENDER_ADDRESS`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `NEXTJS_APP_BASE_URL`.
- `npm run lint` and `npm test` before pushing.

## 8) Troubleshooting
- **Deploy fails auth**: confirm `GCP_CREDENTIALS` matches the service account with required roles.
- **Image push denied**: verify Artifact Registry repo name/region matches `AR_HOST`/`REPO`.
- **Runtime 500s on uploads**: check bucket name/permissions and `GOOGLE_SERVICE_ACCOUNT_KEY` content; ensure `GOOGLE_STORAGE_BUCKET_NAME` is set.
- **SafeSearch errors**: enable the Vision API or set `IMAGE_SAFETY_CHECKS_ENABLED=false` to skip blur detection.
- **Emails not sent**: ensure ACS connection string and sender are valid; check ACS email domain verification.
