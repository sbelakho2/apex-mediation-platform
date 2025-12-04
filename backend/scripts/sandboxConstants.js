const SANDBOX_PUBLISHER_ID = '138f62be-5cee-4c73-aba4-ba78ea77ab44';
const SANDBOX_COMPANY_NAME = 'Apex Sandbox Studio';
const DEFAULT_SANDBOX_PASSWORD = 'SandboxPass!2025';

const SANDBOX_USERS = [
  {
    id: '821cd756-d945-4efd-8f7c-3e7d3520a899',
    email: 'owner@apex-sandbox.test',
    role: 'owner',
    needsStripe: true,
  },
  {
    id: '6348ae56-dcd1-474a-9563-f6cf5f96395e',
    email: 'dev@apex-sandbox.test',
    role: 'developer',
    needsStripe: false,
  },
  {
    id: '1f13d605-e292-4a31-9532-5eeace27d601',
    email: 'finance@apex-sandbox.test',
    role: 'finance',
    needsStripe: false,
  },
];

const FAKE_ADAPTERS = [
  {
    id: 'a7f66258-6c5c-462f-9ff4-126886c1d7d3',
    configId: '038fec38-d1c4-4bc0-8745-33d3289b2839',
    name: 'FakeNetworkA',
    behavior: 'always_fill',
    timeoutMs: 180,
    ecpm: 12.5,
  },
  {
    id: 'ca13eef0-bdbd-4475-823f-93c5b2932d6d',
    configId: '6f4b66b9-c7a1-42df-92b7-c3b5808140ea',
    name: 'FakeNetworkB',
    behavior: 'random_fill',
    timeoutMs: 450,
    ecpm: 8.1,
  },
  {
    id: 'dc801f21-749c-46ae-ad33-ded15da2f5f0',
    configId: '69ac363f-73cb-46b1-afc3-a9db2d2b1f99',
    name: 'FakeNetworkC',
    behavior: 'slow_timeout',
    timeoutMs: 1500,
    ecpm: 5.3,
  },
];

module.exports = {
  SANDBOX_PUBLISHER_ID,
  SANDBOX_COMPANY_NAME,
  SANDBOX_USERS,
  DEFAULT_SANDBOX_PASSWORD,
  FAKE_ADAPTERS,
};
