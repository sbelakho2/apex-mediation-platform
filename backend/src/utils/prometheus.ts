import { collectDefaultMetrics, register } from 'prom-client';

const collectDefaults = process.env.PROMETHEUS_COLLECT_DEFAULTS !== '0';

if (collectDefaults) {
  collectDefaultMetrics();
}

export const promRegister = register;

export async function getPrometheusMetrics(): Promise<string> {
  return register.metrics();
}
