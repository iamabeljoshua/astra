import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('closed_accounts')
export class ClosedAccountEntity {
  @PrimaryColumn('uuid', { name: 'auth_user_id' })
  authUserId!: string;

  @CreateDateColumn({ name: 'closed_at', type: 'timestamptz' })
  closedAt!: Date;
}
