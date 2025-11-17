import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';

export const options = {
  vus: Number(__ENV.VUS || 50),
  duration: __ENV.DURATION || '1m',
  thresholds: {
    http_req_failed: ['rate<0.01'],
  },
};

const API_BASE_URL = stripTrailingSlash(__ENV.API_BASE_URL || __ENV.BASE_URL || 'http://localhost:4000/api/v1');
const TRACKING_BASE_URL = stripTrailingSlash(__ENV.TRACKING_BASE_URL || API_BASE_URL);
const THINK_TIME = Number(__ENV.THINK_TIME || 0.05);
const TOKEN_POOL_SIZE = Math.max(Number(__ENV.TOKEN_POOL_SIZE || 32), 1);
const AUTH_EMAIL = (__ENV.AUTH_EMAIL || '').trim();
const AUTH_PASSWORD = (__ENV.AUTH_PASSWORD || '').trim();

const manualTokenPool = (() => {
  const imp = (__ENV.TOKEN_IMP || '').trim();
  const click = (__ENV.TOKEN_CLICK || '').trim();
  if (imp && click) {
    const base = TRACKING_BASE_URL;
    return [
      {
        impressionUrl: `${base}/rtb/t/imp?token=${encodeURIComponent(imp)}`,
        clickUrl: `${base}/rtb/t/click?token=${encodeURIComponent(click)}`,
        impressionToken: imp,
        clickToken: click,
      },
    ];
  }
  return [];
})();

export function setup() {
  if (manualTokenPool.length) {
    return { tokenPool: manualTokenPool };
  }

  if (!AUTH_EMAIL || !AUTH_PASSWORD) {
    throw new Error(
      'Tracking tokens not provided. Supply TOKEN_IMP/TOKEN_CLICK or AUTH_EMAIL/AUTH_PASSWORD to mint them automatically.'
    );
  }

  const accessToken = loginAndGetToken(AUTH_EMAIL, AUTH_PASSWORD);
  const pool = mintTrackingTokenPool(accessToken, TOKEN_POOL_SIZE);
  return { tokenPool: pool };
}

export default function (data) {
  const pair = selectTokenPair(data);

  const imp = http.get(pair.impressionUrl);
  const click = http.get(pair.clickUrl);

  const impOk = check(imp, { 'impression accepted (204)': (r) => r.status === 204 });
  const clickOk = check(click, { 'click redirected (302)': (r) => r.status === 302 });

  if (!impOk || !clickOk) {
    exec.test.abort(
      `Tracking endpoints failed (imp=${imp.status}, click=${click.status}). Ensure minted tokens remained valid or rerun the setup.`
    );
  }

  sleep(THINK_TIME);
}

function stripTrailingSlash(url) {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function loginAndGetToken(email, password) {
  const payload = JSON.stringify({ email, password });
  const res = http.post(`${API_BASE_URL}/auth/login`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (res.status !== 200) {
    throw new Error(`Auth login failed (${res.status}). Verify credentials and backend availability.`);
  }

  const body = parseJson(res);

  if (body?.data?.twofaRequired) {
    throw new Error('Provided credentials require 2FA. Use a non-2FA user or supply manual TOKEN_IMP/TOKEN_CLICK values.');
  }

  const token = body?.data?.token;
  if (!token) {
    throw new Error('Login succeeded but no JWT was returned. Check backend auth configuration.');
  }

  return token;
}

function mintTrackingTokenPool(accessToken, poolSize) {
  const pool = [];
  const maxAttempts = Math.max(poolSize * 5, poolSize);
  let attempts = 0;

  while (pool.length < poolSize && attempts < maxAttempts) {
    const minted = mintTrackingTokensOnce(accessToken);
    attempts += 1;
    if (minted) {
      pool.push(minted);
    }
  }

  if (!pool.length) {
    throw new Error('Unable to mint tracking tokens. Ensure ENABLE_PRODUCTION_RTB=1 and placements/adapters are configured.');
  }

  return pool;
}

function mintTrackingTokensOnce(accessToken) {
  const payload = JSON.stringify(buildAuctionPayload());
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };

  const res = http.post(`${API_BASE_URL}/rtb/bid`, payload, { headers });

  if (res.status === 204) {
    return null; // no fill, try again
  }

  if (res.status !== 200) {
    throw new Error(`RTB bid failed (${res.status}) while minting tokens.`);
  }

  const body = parseJson(res);
  const impressionUrl = body?.tracking?.impression;
  const clickUrl = body?.tracking?.click;
  const impressionToken = extractToken(impressionUrl);
  const clickToken = extractToken(clickUrl);

  if (!impressionUrl || !clickUrl || !impressionToken || !clickToken) {
    throw new Error('Bid response missing tracking URLs or tokens. Confirm real tracking tokens are enabled.');
  }

  return {
    impressionUrl,
    clickUrl,
    impressionToken,
    clickToken,
  };
}

function buildAuctionPayload() {
  return {
    requestId: `k6-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    placementId: __ENV.PLACEMENT_ID || 'k6-loadtest-placement',
    adFormat: __ENV.AD_FORMAT || 'interstitial',
    floorCpm: Number(__ENV.FLOOR_CPM || 0),
    device: {
      platform: __ENV.DEVICE_PLATFORM || 'ios',
      osVersion: __ENV.DEVICE_OS_VERSION || '17.0',
      model: __ENV.DEVICE_MODEL || 'iPhone15,4',
    },
    user: {
      country: __ENV.USER_COUNTRY || 'US',
      language: __ENV.USER_LANGUAGE || 'en',
    },
    app: {
      id: __ENV.APP_ID || 'app.k6.loadtest',
      name: __ENV.APP_NAME || 'K6 Load Test',
      bundle: __ENV.APP_BUNDLE || 'com.apexmediation.loadtest',
      version: __ENV.APP_VERSION || '1.0.0',
    },
  };
}

function parseJson(res) {
  try {
    return res.json();
  } catch (error) {
    throw new Error(`Failed to parse JSON response: ${(error && error.message) || error}`);
  }
}

function extractToken(url) {
  if (!url) return '';
  const idx = url.indexOf('token=');
  if (idx === -1) {
    return '';
  }
  return decodeURIComponent(url.slice(idx + 6).split('&')[0]);
}

function selectTokenPair(data) {
  const pool = (data && data.tokenPool) || [];
  if (!pool.length) {
    exec.test.abort('Tracking token pool is empty. Rerun the test with manual tokens or valid auth credentials.');
  }

  const idx = (exec.scenario.iterationInInstance + exec.vu.idInInstance) % pool.length;
  return pool[idx];
}
