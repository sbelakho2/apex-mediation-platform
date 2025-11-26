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
  // Generic S3-compatible configuration (MinIO-first)
  // Required: S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
  // Optional: S3_ENDPOINT (e.g., http://minio:9000 or https://fra1.digitaloceanspaces.com), AWS_DEFAULT_REGION
  const bucket = getEnv('S3_BUCKET');
  const endpoint = process.env.S3_ENDPOINT || '';
  const region = process.env.AWS_DEFAULT_REGION || 'us-east-1';
  const keyId = getEnv('AWS_ACCESS_KEY_ID');
  const secret = getEnv('AWS_SECRET_ACCESS_KEY');

  // Inject creds for fromEnv() to pick up
  process.env.AWS_ACCESS_KEY_ID = keyId;
  process.env.AWS_SECRET_ACCESS_KEY = secret;

  const client = new S3Client({
    region,
    // Allow plain HTTP for MinIO on internal network; SDK accepts full URL
    endpoint: endpoint || undefined,
    // Force path-style by default for broad S3-compatibility (MinIO, Spaces)
    forcePathStyle: true,
    credentials: fromEnv(),
  });

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
