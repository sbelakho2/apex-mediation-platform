import type { Counter, Gauge, Histogram, Summary } from 'prom-client';

// Use generic label type as string to satisfy prom-client constraints while remaining flexible
type Metric = Counter<string> | Gauge<string> | Histogram<string> | Summary<string>;

export function safeInc(metric: Metric | undefined, labels?: Record<string, string>, value?: number): void {
  try {
    if (!metric) return;
    const incFn = (metric as unknown as { inc?: (...args: unknown[]) => void }).inc;
    if (typeof incFn !== 'function') return;
    if (labels && value != null) {
      incFn(labels, value);
    } else if (labels) {
      incFn(labels);
    } else if (value != null) {
      incFn(value);
    } else {
      incFn();
    }
  } catch {
    // swallow metrics errors
  }
}

export function safeObserve(metric: Metric | undefined, labels: Record<string, string> | number, value?: number): void {
  try {
    if (!metric) return;
    const observe = (metric as unknown as { observe?: (...args: unknown[]) => void }).observe;
    if (typeof observe !== 'function') return;
    if (typeof labels === 'number') {
      observe(labels);
    } else if (value != null) {
      observe(labels, value);
    }
  } catch {
    // swallow metrics errors
  }
}
