import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Index, CreateDateColumn, UpdateDateColumn, Unique } from 'typeorm';
import { User } from './user.entity';

@Entity('api_keys')
@Index(['user'])
@Unique(['secretDigest'])
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, (user: User) => user.apiKeys, { onDelete: 'CASCADE' })
  user!: User;

  @Column()
  secret!: string; // bcrypt hash of the secret

  // Constant-time lookup key (e.g., sha256(secret) hex). Never returns to clients.
  @Column({ nullable: true })
  secretDigest!: string | null;

  @Column()
  prefix!: string;

  @Column()
  last4!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt!: Date | null;
}
