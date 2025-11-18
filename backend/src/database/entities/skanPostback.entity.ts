import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, Unique } from 'typeorm';

@Entity('skan_postbacks')
@Unique(['fingerprint'])
export class SkanPostback {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn()
  receivedAt!: Date;

  @Column({ name: 'network_id', length: 128 })
  networkId!: string;

  @Column({ name: 'campaign_id', length: 128 })
  campaignId!: string;

  @Column({ length: 16, nullable: true })
  version!: string | null;

  @Column({ type: 'boolean', default: false })
  redownload!: boolean;

  // Stable hash of selected Apple fields to block replay inserts
  @Index()
  @Column({ length: 128 })
  fingerprint!: string;

  // Selected signature fields for diagnostics/verification
  @Column({ type: 'jsonb', nullable: true })
  signatureFields!: Record<string, unknown> | null;

  // Entire original postback (redacted where necessary upstream)
  @Column({ type: 'jsonb' })
  raw!: Record<string, unknown>;
}
