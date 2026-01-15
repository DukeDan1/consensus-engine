import { Storage } from '@google-cloud/storage';
import { Buffer } from 'buffer';

const bucketName = process.env.GOOGLE_STORAGE_BUCKET_NAME;
const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

let storage: Storage | null = null;

const imageOutputPrefix = normalisePrefix(process.env.IMAGE_OUTPUT_PREFIX || "processed/");
const imageThumbPrefix = normalisePrefix(process.env.IMAGE_THUMB_PREFIX || "thumbs/128/");
const imageOriginalPrefix = normalisePrefix(process.env.IMAGE_ORIGINAL_PREFIX || "originals/");
const imageOriginalThumbPrefix = normalisePrefix(process.env.IMAGE_ORIGINAL_THUMB_PREFIX || "originals/thumbs/128/");

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

function normalisePrefix(value: string) {
  const trimmed = value.replace(/^\/+/, "");
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

function normaliseObjectName(value: string) {
  return value.replace(/^\/+/, "");
}

function encodeObjectPath(objectName: string) {
  return objectName
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function buildStorageUrl(objectName: string) {
  if (!bucketName) throw new Error("Missing GOOGLE_STORAGE_BUCKET_NAME");
  return `https://storage.googleapis.com/${bucketName}/${encodeObjectPath(objectName)}`;
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

export function buildImageVariantNames(fileName: string) {
  const normalisedName = normaliseObjectName(fileName);
  return {
    processedName: `${imageOutputPrefix}${normalisedName}`,
    thumbName: `${imageThumbPrefix}${normalisedName}`,
    originalName: `${imageOriginalPrefix}${normalisedName}`,
    originalThumbName: `${imageOriginalThumbPrefix}${normalisedName}`,
  };
}

async function getSignedReadUrlForObjectPath(objectPath: string, expiresInSeconds: number) {
  if (!bucketName) throw new Error("Missing GOOGLE_STORAGE_BUCKET_NAME");
  const client = getStorage();
  if (!client) throw new Error("Google Storage is not configured");
  const bucket = client.bucket(bucketName);
  const file = bucket.file(objectPath);
  const [signedUrl] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + expiresInSeconds * 1000,
  });
  return signedUrl;
}

async function saveFileToBucket(params: {
  fileName: string;
  contentType: string;
  data: Buffer;
}) {
  const { fileName, contentType, data } = params;
  if (!bucketName) throw new Error("Missing GOOGLE_STORAGE_BUCKET_NAME");

  const client = getStorage();
  if (!client) throw new Error("Google Storage is not configured");

  const bucket = client.bucket(bucketName);
  const file = bucket.file(fileName);

  await file.save(data, {
    contentType,
    resumable: false,
    metadata: {
      contentType,
      cacheControl: "private, max-age=0, no-transform",
    },
  });

  return { storageUrl: buildStorageUrl(fileName) };
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

  const publicUrl = buildStorageUrl(fileName);

  return { uploadUrl: url, publicUrl };
}

export async function uploadFileToBucket(params: {
  fileName: string;
  contentType: string;
  data: Buffer;
  signedReadExpiresSeconds?: number;
}) {
  const { fileName, contentType, data, signedReadExpiresSeconds = 7 * 24 * 60 * 60 } = params;
  const { storageUrl } = await saveFileToBucket({ fileName, contentType, data });
  const signedUrl = await getSignedReadUrlForObjectPath(fileName, signedReadExpiresSeconds);
  return { storageUrl, signedUrl };
}

export async function uploadProcessedImageVariants(params: {
  fileName: string;
  contentType: string;
  processedBuffer: Buffer;
  thumbBuffer: Buffer;
  originalBuffer: Buffer;
  originalThumbBuffer: Buffer;
  signedReadExpiresSeconds?: number;
}) {
  const {
    fileName,
    contentType,
    processedBuffer,
    thumbBuffer,
    originalBuffer,
    originalThumbBuffer,
    signedReadExpiresSeconds = 7 * 24 * 60 * 60,
  } = params;
  const { processedName, thumbName, originalName, originalThumbName } = buildImageVariantNames(fileName);

  const [processed, thumb, original, originalThumb] = await Promise.all([
    uploadFileToBucket({
      fileName: processedName,
      contentType,
      data: processedBuffer,
      signedReadExpiresSeconds,
    }),
    uploadFileToBucket({
      fileName: thumbName,
      contentType,
      data: thumbBuffer,
      signedReadExpiresSeconds,
    }),
    uploadFileToBucket({
      fileName: originalName,
      contentType,
      data: originalBuffer,
      signedReadExpiresSeconds,
    }),
    uploadFileToBucket({
      fileName: originalThumbName,
      contentType,
      data: originalThumbBuffer,
      signedReadExpiresSeconds,
    }),
  ]);

  return {
    storageUrl: processed.storageUrl,
    signedUrl: processed.signedUrl,
    previewUrl: thumb.storageUrl,
    signedPreviewUrl: thumb.signedUrl,
    originalUrl: original.storageUrl,
    signedOriginalUrl: original.signedUrl,
    originalPreviewUrl: originalThumb.storageUrl,
    signedOriginalPreviewUrl: originalThumb.signedUrl,
  };
}

export async function getSignedReadUrlFromUrl(objectUrl: string, expiresInSeconds = 7 * 24 * 60 * 60) {
  if (!bucketName) throw new Error('Missing GOOGLE_STORAGE_BUCKET_NAME');
  const client = getStorage();
  if (!client) throw new Error('Google Storage is not configured');

  const parseResult = parseGcsObjectUrl(objectUrl);
  if ('error' in parseResult) {
    if (parseResult.error === 'invalid') {
      console.warn('getSignedReadUrlFromUrl: invalid URL, returning original', { objectUrl, err: parseResult.err });
      return objectUrl;
    }
    if (parseResult.error === 'non-gcs') {
      console.warn('getSignedReadUrlFromUrl: non-GCS URL, returning original', { objectUrl, host: parseResult.host });
      return objectUrl;
    }
    console.warn('getSignedReadUrlFromUrl: different bucket in URL, returning original', { objectUrl, bucketInUrl: parseResult.bucketInUrl });
    return objectUrl;
  }
  const { objectPath } = parseResult;

  try {
    const bucket = client.bucket(bucketName);
    const file = bucket.file(objectPath);
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + expiresInSeconds * 1000,
    });
    return signedUrl;
  } catch (err) {
    console.error('getSignedReadUrlFromUrl: failed to sign read URL', { objectUrl, objectPath, err });
    return objectUrl;
  }
}

type ParsedGcsUrl =
  | { objectPath: string; host: string; bucketInUrl: string }
  | { error: 'invalid'; err: unknown }
  | { error: 'non-gcs'; host: string }
  | { error: 'bucket-mismatch'; host: string; bucketInUrl: string };

function parseGcsObjectUrl(objectUrl: string): ParsedGcsUrl {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(objectUrl);
  } catch (err) {
    return { error: 'invalid', err };
  }

  const host = parsedUrl.hostname.toLowerCase();
  const rawPath = parsedUrl.pathname.replace(/^\/+/, '');
  let objectPath = '';
  let bucketInUrl = '';

  if (host === 'storage.googleapis.com') {
    const [bucket, ...rest] = rawPath.split('/');
    bucketInUrl = bucket;
    objectPath = rest.join('/');
  } else if (host === 'storage.cloud.google.com') {
    const parts = rawPath.split('/');
    if (parts[0] === 'storage' && parts[1] === 'browser' && parts[2] === '_details') {
      bucketInUrl = parts[3] ?? '';
      objectPath = parts.slice(4).join('/');
    } else if (parts[0] === 'storage' && parts[1] === 'browser') {
      bucketInUrl = parts[2] ?? '';
      objectPath = parts.slice(3).join('/');
    } else {
      bucketInUrl = parts[0] ?? '';
      objectPath = parts.slice(1).join('/');
    }
  } else if (host.endsWith('.storage.googleapis.com')) {
    bucketInUrl = host.replace('.storage.googleapis.com', '');
    objectPath = rawPath;
  } else if (bucketName && rawPath.startsWith(bucketName + '/')) {
    bucketInUrl = bucketName;
    objectPath = rawPath.slice(bucketName.length + 1);
  } else {
    return { error: 'non-gcs', host };
  }

  if (!bucketName || bucketInUrl !== bucketName) {
    return { error: 'bucket-mismatch', host, bucketInUrl };
  }

  return { objectPath, host, bucketInUrl };
}

export async function deleteFileFromUrl(objectUrl: string) {
  if (!bucketName) throw new Error('Missing GOOGLE_STORAGE_BUCKET_NAME');
  const client = getStorage();
  if (!client) throw new Error('Google Storage is not configured');

  const parseResult = parseGcsObjectUrl(objectUrl);
  if ('error' in parseResult) {
    return { deleted: false, reason: parseResult.error, host: 'host' in parseResult ? parseResult.host : undefined };
  }

  const bucket = client.bucket(bucketName);
  const file = bucket.file(parseResult.objectPath);
  await file.delete({ ignoreNotFound: true });
  return { deleted: true };
}
