import { randomUUID } from 'crypto';
import { logger } from '../../utils/logger';

export type MigrationChannel = 'sandbox' | 'production';

export interface MigrationRequestInput {
  customerId: string;
  accountEmail?: string | null;
  channel: MigrationChannel;
  notes: string;
}

export interface MigrationRequest {
  requestId: string;
  status: 'queued';
  submittedAt: string;
  channel: MigrationChannel;
  notesPreview: string;
}

class MigrationAssistantService {
  async createRequest(input: MigrationRequestInput): Promise<MigrationRequest> {
    const request: MigrationRequest = {
      requestId: randomUUID(),
      status: 'queued',
      submittedAt: new Date().toISOString(),
      channel: input.channel,
      notesPreview: input.notes.slice(0, 240),
    };

    logger.info('Billing migration request queued', {
      requestId: request.requestId,
      customerId: input.customerId,
      actor: input.accountEmail ?? 'unknown',
      channel: input.channel,
      notesLength: input.notes.length,
    });

    return request;
  }
}

export const migrationAssistantService = new MigrationAssistantService();
