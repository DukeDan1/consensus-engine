import { Storage } from '@google-cloud/storage';
import { Buffer } from 'buffer';

const bucketName = process.env.GOOGLE_STORAGE_BUCKET_NAME;
const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

let storage: Storage | null = null;

function parseServiceAccount(jsonish: string) {
  try {
    return JSON.parse(jsonish);
  } catch {
    try {
      const decoded = Buffer.from(jsonish, 'base64').toString('utf8');
      return JSON.parse(decoded);
    } catch (inner) {
      console.error('Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY', inner);
      return null;
    }
  }
}

function normalizePrivateKey(key: string | undefined) {
  if (!key) return undefined;
  return key.includes('\\n') ? key.replace(/\\n/g, '\n') : key;
}

function getStorage(): Storage | null {
  if (!bucketName || !rawKey) return null;
  if (storage) return storage;

  const keyObj = parseServiceAccount(rawKey);
  if (!keyObj) return null;

  const privateKey = normalizePrivateKey(keyObj.private_key as string | undefined);
  if (!privateKey) {
    console.error('GCS service account key missing private_key');
    return null;
  }

  storage = new Storage({
    projectId: keyObj.project_id,
    credentials: {
      client_email: keyObj.client_email,
      private_key: privateKey,
    },
  });
  return storage;
}

export async function getSignedUploadUrl(params: {
  fileName: string;
  contentType: string;
  expiresInSeconds?: number;
}) {
  const { fileName, contentType, expiresInSeconds = 15 * 60 } = params;
  if (!bucketName) throw new Error('Missing GOOGLE_STORAGE_BUCKET_NAME');

  const client = getStorage();
  if (!client) throw new Error('Google Storage is not configured');

  const bucket = client.bucket(bucketName);
  const file = bucket.file(fileName);

  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + expiresInSeconds * 1000,
    contentType,
    extensionHeaders: {
      'x-goog-acl': 'public-read',
    },
  });

  const publicUrl = `https://storage.googleapis.com/${bucketName}/${encodeURIComponent(fileName)}`;

  return { uploadUrl: url, publicUrl };
}

export async function uploadFileToBucket(params: {
  fileName: string;
  contentType: string;
  data: Buffer;
  signedReadExpiresSeconds?: number;
}) {
  const { fileName, contentType, data, signedReadExpiresSeconds = 7 * 24 * 60 * 60 } = params;
  if (!bucketName) throw new Error('Missing GOOGLE_STORAGE_BUCKET_NAME');

  const client = getStorage();
  if (!client) throw new Error('Google Storage is not configured');

  const bucket = client.bucket(bucketName);
  const file = bucket.file(fileName);

  await file.save(data, {
    contentType,
    resumable: false,
    metadata: {
      contentType,
      cacheControl: 'private, max-age=0, no-transform',
    },
  });

  const storageUrl = `https://storage.googleapis.com/${bucketName}/${encodeURIComponent(fileName)}`;

  const [signedUrl] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + signedReadExpiresSeconds * 1000,
  });

  return { storageUrl, signedUrl };
}

export async function getSignedReadUrlFromUrl(objectUrl: string, expiresInSeconds = 7 * 24 * 60 * 60) {
  if (!bucketName) throw new Error('Missing GOOGLE_STORAGE_BUCKET_NAME');
  const client = getStorage();
  if (!client) throw new Error('Google Storage is not configured');

  try {
    const url = new URL(objectUrl);
    const host = url.host;
    let objectPath = url.pathname.replace(/^\//, '');

    if (host.includes('storage.googleapis.com')) {
      // Path form: /<bucket>/<object>
      const [bucketInUrl, ...rest] = objectPath.split('/');
      if (bucketInUrl !== bucketName) return objectUrl; // different bucket
      objectPath = rest.join('/');
    } else if (host === 'storage.cloud.google.com') {
      // Path form: /<bucket>/<object>
      const [bucketInUrl, ...rest] = objectPath.split('/');
      if (bucketInUrl !== bucketName) return objectUrl;
      objectPath = rest.join('/');
    } else {
      // Could be a bare object path
      if (objectPath.startsWith(bucketName + '/')) {
        objectPath = objectPath.slice(bucketName.length + 1);
      } else {
        return objectUrl; // not a GCS URL we recognize
      }
    }

    const bucket = client.bucket(bucketName);
    const file = bucket.file(objectPath);
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + expiresInSeconds * 1000,
    });
    return signedUrl;
  } catch (err) {
    console.error('Failed to sign read URL', err);
    return objectUrl;
  }
}
