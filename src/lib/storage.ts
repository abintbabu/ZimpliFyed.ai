import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const BUCKET = process.env.STORAGE_BUCKET;
const ENDPOINT = process.env.STORAGE_ENDPOINT; // e.g. Cloudflare R2 account endpoint
const REGION = process.env.STORAGE_REGION || 'auto';
const ACCESS_KEY_ID = process.env.STORAGE_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.STORAGE_SECRET_ACCESS_KEY;

const s3Configured = Boolean(BUCKET && ENDPOINT && ACCESS_KEY_ID && SECRET_ACCESS_KEY);

const s3 = s3Configured
  ? new S3Client({
      region: REGION,
      endpoint: ENDPOINT,
      credentials: { accessKeyId: ACCESS_KEY_ID!, secretAccessKey: SECRET_ACCESS_KEY! },
    })
  : null;

// Local-disk fallback so dev works without cloud credentials configured.
const LOCAL_DIR = path.join(process.cwd(), '.storage');

function localPath(key: string) {
  return path.join(LOCAL_DIR, key.replace(/\.\./g, ''));
}

export function newStorageKey(tenantId: string, fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${tenantId}/${randomUUID()}-${safeName}`;
}

export async function putObject(key: string, body: Buffer, mimeType: string): Promise<void> {
  if (s3) {
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: mimeType }));
    return;
  }
  const file = localPath(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}

export async function getObject(key: string): Promise<Buffer> {
  if (s3) {
    const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }
  return readFile(localPath(key));
}

export async function getDownloadUrl(key: string, expiresInSec = 300): Promise<string> {
  if (s3) {
    return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: expiresInSec });
  }
  // Local dev: route through an app API endpoint that reads from disk.
  return `/api/files/${encodeURIComponent(key)}`;
}

export async function deleteObject(key: string): Promise<void> {
  if (s3) {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    return;
  }
  await unlink(localPath(key)).catch(() => {});
}
