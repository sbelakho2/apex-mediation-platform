import 'dotenv/config';
import { createClient } from 'redis';

async function main() {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.error('[verify:redis] REDIS_URL is not set');
    process.exit(2);
  }

  const client = createClient({ url, socket: { reconnectStrategy: () => 0, connectTimeout: 3000 } });
  client.on('error', (err) => {
    console.error('[verify:redis] client error:', err);
  });
  try {
    await client.connect();
    const pong = await client.ping();
    if (pong !== 'PONG') throw new Error('PING failed');

    const key = `verify:${Date.now()}`;
    await client.set(key, 'ok', { EX: 5 });
    const val = await client.get(key);
    if (val !== 'ok') throw new Error('SET/GET failed');
    await client.del(key);

    console.log('[verify:redis] OK');
    process.exit(0);
  } catch (err) {
    console.error('[verify:redis] FAILED:', err);
    process.exit(1);
  } finally {
    try { await client.quit(); } catch {}
  }
}

main().catch((err) => {
  console.error('[verify:redis] Unexpected error:', err);
  process.exit(1);
});
