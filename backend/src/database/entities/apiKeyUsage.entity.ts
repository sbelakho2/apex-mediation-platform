import { Entity, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn, Column, Index } from 'typeorm';
import { ApiKey } from './apiKey.entity';

@Entity('api_key_usages')
@Index(['apiKey'])
export class ApiKeyUsage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ApiKey, (k: ApiKey) => k.id, { onDelete: 'CASCADE' })
  apiKey!: ApiKey;

  @CreateDateColumn()
  ts!: Date;

  @Column({ type: 'varchar', length: 128, nullable: true })
  route!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  method!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ipHash!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  uaHash!: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  status!: string | null; // e.g., '200', '401'
}
