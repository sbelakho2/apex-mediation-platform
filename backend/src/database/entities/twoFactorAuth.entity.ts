import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Index } from 'typeorm';
import { User } from './user.entity';

@Entity('two_factor_auth')
@Index(['user', 'enabled'])
export class TwoFactorAuth {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, (user: User) => user.twoFactorAuth, { onDelete: 'CASCADE' })
  user!: User;

  @Column()
  secret!: string;

  @Column({ default: false })
  enabled!: boolean;

  @Column('simple-array', { nullable: true })
  backupCodes!: string[]; // Store hashed backup codes
}
