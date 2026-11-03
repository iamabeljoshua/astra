import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

// Holds only the Supabase user ID, so the stop outlives every sign-in and keeps nothing else about the person.
@Entity('closed_accounts')
export class ClosedAccountEntity {
  @PrimaryColumn('uuid', { name: 'auth_user_id' })
  authUserId!: string;

  @CreateDateColumn({ name: 'closed_at', type: 'timestamptz' })
  closedAt!: Date;
}
