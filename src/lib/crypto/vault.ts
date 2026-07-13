import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma';

/**
 * Integration credential vault (DEV_PLAN_100 Sprint 1; SECURITY_BASELINE credential-vault).
 *
 * Envelope encryption, AES-256-GCM throughout:
 *   1. A fresh 256-bit data key is generated per stored secret.
 *   2. The secret is encrypted under that data key (ciphertext + iv + authTag).
 *   3. The data key is itself encrypted ("wrapped") under the master key (wrappedKey + keyIv + keyAuthTag).
 * Only the wrapped key is persisted, so rotating the master key re-wraps data keys without touching
 * ciphertext. Plaintext exists only transiently in memory here — never logged, never sent to a client.
 *
 * The master key comes from CRED_VAULT_MASTER_KEY (32 bytes, base64). In production this env value is
 * injected from a real KMS/secret manager; this module is the boundary that a KMS-backed wrap/unwrap
 * would slot behind unchanged.
 */

const ALGO = 'aes-256-gcm';
const KEY_VERSION = 1;

function masterKey(): Buffer {
  const raw = process.env.CRED_VAULT_MASTER_KEY;
  if (!raw) {
    throw new Error('CRED_VAULT_MASTER_KEY is not set — cannot encrypt or decrypt integration credentials');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('CRED_VAULT_MASTER_KEY must be 32 bytes (base64-encoded) for AES-256');
  }
  return key;
}

function encryptWith(key: Buffer, plaintext: Buffer): { ciphertext: string; iv: string; authTag: string } {
  const iv = randomBytes(12); // 96-bit nonce, the GCM standard
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

function decryptWith(key: Buffer, ciphertext: string, iv: string, authTag: string): Buffer {
  const decipher = createDecipheriv(ALGO, key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]);
}

type Sealed = {
  ciphertext: string;
  wrappedKey: string;
  iv: string;
  authTag: string;
  keyIv: string;
  keyAuthTag: string;
  keyVersion: number;
};

/** Encrypt a plaintext secret into the envelope columns. Pure — does not touch the DB. */
export function seal(plaintext: string): Sealed {
  const dataKey = randomBytes(32);
  const body = encryptWith(dataKey, Buffer.from(plaintext, 'utf8'));
  const wrapped = encryptWith(masterKey(), dataKey);
  return {
    ciphertext: body.ciphertext,
    iv: body.iv,
    authTag: body.authTag,
    wrappedKey: wrapped.ciphertext,
    keyIv: wrapped.iv,
    keyAuthTag: wrapped.authTag,
    keyVersion: KEY_VERSION,
  };
}

/** Decrypt the envelope columns back to plaintext. Pure — does not touch the DB. */
export function open(sealed: Sealed): string {
  const dataKey = decryptWith(masterKey(), sealed.wrappedKey, sealed.keyIv, sealed.keyAuthTag);
  const plaintext = decryptWith(dataKey, sealed.ciphertext, sealed.iv, sealed.authTag);
  return plaintext.toString('utf8');
}

/** Store (or replace) a tenant integration credential. `secret` is any string — an OAuth token bundle
 * is typically JSON.stringify'd before calling this. */
export async function storeCredential(input: {
  tenantId: string;
  kind: string;
  account?: string | null;
  secret: string;
}): Promise<{ id: string }> {
  const sealed = seal(input.secret);
  const account = input.account ?? '';
  const row = await prisma.integrationCredential.upsert({
    where: { tenantId_kind_account: { tenantId: input.tenantId, kind: input.kind, account } },
    create: { tenantId: input.tenantId, kind: input.kind, account, status: 'active', ...sealed },
    update: { ...sealed, status: 'active' },
    select: { id: true },
  });
  return { id: row.id };
}

/** Fetch and decrypt a tenant integration credential, or null if none is stored. Tenant-scoped by
 * construction — the tenantId is part of the lookup, never trusted from ambient context. */
export async function getCredential(input: {
  tenantId: string;
  kind: string;
  account?: string | null;
}): Promise<string | null> {
  const account = input.account ?? '';
  const row = await prisma.integrationCredential.findUnique({
    where: { tenantId_kind_account: { tenantId: input.tenantId, kind: input.kind, account } },
  });
  if (!row || row.status !== 'active') return null;
  return open(row);
}

export async function revokeCredential(input: {
  tenantId: string;
  kind: string;
  account?: string | null;
}): Promise<void> {
  const account = input.account ?? '';
  await prisma.integrationCredential.updateMany({
    where: { tenantId: input.tenantId, kind: input.kind, account },
    data: { status: 'revoked' },
  });
}

/** Generate a fresh master key (base64) for CRED_VAULT_MASTER_KEY. Ops helper, not called at runtime. */
export function generateMasterKey(): string {
  return randomBytes(32).toString('base64');
}
