import logger from './logger';

export type OpsAlertSeverity = 'info' | 'warning' | 'critical';

export type OpsAlertDetails = Record<string, unknown>;

const severityToLogLevel: Record<OpsAlertSeverity, string> = {
  info: 'info',
  warning: 'warn',
  critical: 'error',
};

export function emitOpsAlert(event: string, severity: OpsAlertSeverity, details: OpsAlertDetails = {}): void {
  logger.log({
    level: severityToLogLevel[severity],
    message: 'OpsAlert',
    alert_event: event,
    severity,
    ...details,
  });
}
