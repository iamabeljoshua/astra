import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Repository } from 'typeorm';
import { LearnerNoteEntity } from '../entities/learner-note.entity';
import { LearnerRecordUpdateEntity } from '../entities/learner-record-update.entity';

export type NewLearnerNote = Pick<LearnerNoteEntity, 'kind' | 'topic' | 'topicKey' | 'detail' | 'evidence'>;

export interface LearnerRecordUpdate {
  studentId: string;
  sessionId: string;
  updateKey: string;
  notes: NewLearnerNote[];
}

const MOST_NOTES_KEPT = 200;

const DELETE_OLDEST_PAST_LIMIT = `
  DELETE FROM "learner_notes"
  WHERE "student_id" = $1 AND "id" NOT IN (
    SELECT "id" FROM "learner_notes" WHERE "student_id" = $1 ORDER BY "noted_at" DESC, "id" DESC LIMIT $2
  )`;

@Injectable()
export class LearnerRecordRepository {
  private readonly notes: Repository<LearnerNoteEntity>;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    this.notes = dataSource.getRepository(LearnerNoteEntity);
  }

  listNewestForStudent(studentId: string, limit: number): Promise<LearnerNoteEntity[]> {
    return this.notes.find({
      where: { studentId },
      relations: { session: true },
      order: { notedAt: 'DESC', id: 'DESC' },
      take: limit,
    });
  }

  // The marker and the notes commit together, so a repeat of the same update adds nothing, even after the student deleted a note it wrote.
  applyUpdateOnce({ studentId, sessionId, updateKey, notes }: LearnerRecordUpdate): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const { raw } = await manager
        .createQueryBuilder()
        .insert()
        .into(LearnerRecordUpdateEntity)
        .values({ sessionId, updateKey })
        .orIgnore()
        .returning('"session_id"')
        .execute();
      if ((raw as unknown[]).length === 0) return false;
      if (notes.length > 0) {
        await manager
          .createQueryBuilder()
          .insert()
          .into(LearnerNoteEntity)
          .values(notes.map((note) => ({ ...note, studentId, sessionId })))
          .orIgnore()
          .execute();
      }
      await manager.query(DELETE_OLDEST_PAST_LIMIT, [studentId, MOST_NOTES_KEPT]);
      return true;
    });
  }

  async deleteForStudent(studentId: string, noteId: string): Promise<boolean> {
    const { affected } = await this.notes.delete({ id: noteId, studentId });
    return Boolean(affected);
  }

  async deleteAllForStudent(studentId: string): Promise<void> {
    await this.notes.delete({ studentId });
  }
}
