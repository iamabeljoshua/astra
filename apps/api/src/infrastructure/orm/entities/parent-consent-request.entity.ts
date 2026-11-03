import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StudentEntity } from './student.entity';

@Entity('parent_consent_requests')
export class ParentConsentRequestEntity {
  @PrimaryColumn('uuid', { name: 'student_id' })
  studentId!: string;

  @OneToOne(() => StudentEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student?: StudentEntity;

  @Column('text', { name: 'parent_email' })
  parentEmail!: string;

  @Column('text', { name: 'link_token_hash', unique: true })
  linkTokenHash!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
