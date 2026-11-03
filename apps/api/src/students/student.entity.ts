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

  // Supabase's user ID. A plain uuid, because app databases have no auth schema to point a foreign key at.
  @Column('uuid', { name: 'auth_user_id', unique: true })
  authUserId!: string;

  @Column('text', { nullable: true })
  name!: string | null;

  @Column('date', { name: 'birth_date' })
  birthDate!: string;

  @Column('timestamptz', { name: 'parent_consent_at', nullable: true })
  parentConsentAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
