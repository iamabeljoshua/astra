import { isDetailOnTheList, isTopicOnTheList } from '@astra/contracts/topic-words';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { LearnerNoteEntity } from '../infrastructure/orm/entities/learner-note.entity';
import { LearnerRecordRepository } from '../infrastructure/orm/repositories/learner-record.repository';
import { getTopicKey, isBackedByEvidence } from './learner-note-options';
import type { LearnerRecordDto, LearnerNoteDto, NewLearnerNoteDto } from './learner-record.dto';

const MOST_NOTES_READ = 200;
function toNoteDto({ id, kind, topic, detail, evidence, sessionId, session, notedAt }: LearnerNoteEntity): LearnerNoteDto {
  return { id, kind, topic, detail, evidence, sessionId, sessionTitle: session?.title ?? '', notedAt };
}

// Every call names the student, so one student's record can never answer for another.
@Injectable()
export class LearnerRecordService {
  private readonly logger = new Logger(LearnerRecordService.name);

  constructor(private readonly records: LearnerRecordRepository) {}

  /** What the tutor remembers about this student, newest first. This is the read that the tutor's brief and Home use. */
  async getRecord(studentId: string): Promise<LearnerRecordDto> {
    return { notes: (await this.records.listNewestForStudent(studentId, MOST_NOTES_READ)).map(toNoteDto) };
  }

  /** Adds one room's notes once. A repeat of the same update key changes nothing and answers false. Each note is judged alone, so one off the closed list costs only itself, and an update with nothing on the list is refused. */
  async applyUpdate({ studentId, sessionId, updateKey, notes }: { studentId: string; sessionId: string; updateKey: string; notes: NewLearnerNoteDto[] }): Promise<boolean> {
    const listedNotes = notes.filter(({ kind, topic }) => isTopicOnTheList(kind, topic));
    if (listedNotes.length < notes.length) this.logger.warn(`Refused ${notes.length - listedNotes.length} of ${notes.length} notes off the closed list.`);
    if (notes.length > 0 && listedNotes.length === 0) throw new BadRequestException('No topic in this update is on the closed list.');
    const newNotes = listedNotes
      .filter(({ kind, evidence }) => isBackedByEvidence(kind, evidence))
      .map(({ kind, topic, detail, evidence }) => ({ kind, topic, topicKey: getTopicKey(topic), detail: detail && isDetailOnTheList(detail) ? detail : null, evidence }));
    return this.records.applyUpdateOnce({ studentId, sessionId, updateKey, notes: newNotes });
  }

  async deleteNote(studentId: string, noteId: string): Promise<void> {
    const wasDeleted = await this.records.deleteForStudent(studentId, noteId);
    if (!wasDeleted) throw new NotFoundException('That note was not found.');
  }

  deleteAll(studentId: string): Promise<void> {
    return this.records.deleteAllForStudent(studentId);
  }
}
