import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Unique, Index } from 'typeorm';

@Entity('adapter_configs')
@Unique(['name'])
export class AdapterConfig {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ length: 64 })
  name!: string; // adapter name, e.g., 'mockAdmob'

  @Column({ default: true })
  enabled!: boolean;

  @Column({ type: 'int', default: 800 })
  timeoutMs!: number;

  @Column({ type: 'jsonb', nullable: true })
  weights!: Record<string, unknown> | null; // e.g., geo weights

  // Encrypted credentials blob (AES-GCM) — store base64 ciphertext
  @Column({ type: 'text', nullable: true })
  credentialsCiphertext!: string | null;

  @UpdateDateColumn()
  updatedAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;
}
