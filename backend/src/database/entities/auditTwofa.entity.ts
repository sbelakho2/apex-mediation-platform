import { Entity, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn, Column, Index } from 'typeorm';
import { User } from './user.entity';

@Entity('audit_twofa')
export class AuditTwofa {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, (user: User) => user.id, { onDelete: 'CASCADE' })
  user!: User;

  @CreateDateColumn()
  ts!: Date;

  @Column({ length: 64 })
  action!: string; // enroll|enable|regen|disable

  @Column({ type: 'varchar', length: 320, nullable: true })
  actorEmail!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  ipHash!: string | null;
}
