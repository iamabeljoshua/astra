import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('students')
export class StudentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'auth_user_id', unique: true })
  authUserId!: string;

  @Column('text', { nullable: true })
  name!: string | null;

  @Column('date', { name: 'birth_date' })
  birthDate!: string;

  /** When the tutor told this student they can talk. It is only ever said once. */
  @Column('timestamptz', { name: 'talk_invited_at', nullable: true })
  talkInvitedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
