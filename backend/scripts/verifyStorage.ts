import 'dotenv/config';
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { fromEnv } from '@aws-sdk/credential-providers';

function getEnv(key: string, required = true) {
  const val = process.env[key];
  if (required && !val) throw new Error(`[verify:storage] Missing env ${key}`);
  return val || '';
}

async function streamToString(stream: any): Promise<string> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

async function main() {
  const bucket = getEnv('SPACES_BUCKET', !!process.env.B2_BUCKET ? false : true) || getEnv('B2_BUCKET', false);
  const endpoint = process.env.SPACES_ENDPOINT || process.env.B2_ENDPOINT; // B2 may not be provided; SDK can infer from region in some setups
  const region = process.env.SPACES_REGION || process.env.B2_REGION || 'us-east-1';
  const keyId = process.env.SPACES_ACCESS_KEY_ID || process.env.B2_KEY_ID;
  const secret = process.env.SPACES_SECRET_ACCESS_KEY || process.env.B2_APPLICATION_KEY;

  if (!bucket) throw new Error('[verify:storage] No bucket provided (SPACES_BUCKET or B2_BUCKET)');
  if (!keyId || !secret) throw new Error('[verify:storage] No credentials provided (SPACES_ACCESS_KEY_ID/SECRET or B2_KEY_ID/APPLICATION_KEY)');

  const client = new S3Client({
    region,
    endpoint: endpoint ? `https://${endpoint}` : undefined,
    forcePathStyle: !!process.env.B2_BUCKET, // safer for some S3-compatible providers
    credentials: fromEnv(),
  });

  // Inject creds to env provider
  process.env.AWS_ACCESS_KEY_ID = keyId;
  process.env.AWS_SECRET_ACCESS_KEY = secret;

  const testKey = `test/verify-${Date.now()}.txt`;
  const body = 'apex verify storage';

  try {
    // Put
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: testKey, Body: body, ContentType: 'text/plain' }));

    // Head
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: testKey }));

    // Get
    const got = await client.send(new GetObjectCommand({ Bucket: bucket, Key: testKey }));
    const text = await streamToString(got.Body as any);
    if (text !== body) throw new Error('Downloaded contents mismatch');

    // Delete
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: testKey }));

    console.log('[verify:storage] OK');
    process.exit(0);
  } catch (err) {
    console.error('[verify:storage] FAILED:', err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[verify:storage] Unexpected error:', err);
  process.exit(1);
});
