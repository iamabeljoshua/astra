import { useState } from 'react';
import { formatSessionDate } from '../session/formatSession';
import { API_ERROR_LABELS, RECORD_LABELS } from '../strings';
import { type LearnerNote, useDeleteNote, useDeleteRecord, useLearnerRecord } from './useLearnerRecord';

function getEvidenceLine({ source, text, check }: LearnerNote['evidence'][number]): string {
  if (source === 'words') return RECORD_LABELS.fromYourWords;
  return check === 'right' ? RECORD_LABELS.markedRight(text) : RECORD_LABELS.markedWrong(text);
}

function NoteRow({ note }: { note: LearnerNote }) {
  const deleteNote = useDeleteNote();
  return (
    <li className="flex flex-col gap-1.5 border-t border-line py-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <p>
          <span className="text-ink-2">{RECORD_LABELS.kinds[note.kind]} </span>
          <span className="font-semibold">{note.topic}</span>
        </p>
        <button type="button" aria-disabled={deleteNote.isPending} aria-label={RECORD_LABELS.removeNamed(note.topic)} onClick={() => !deleteNote.isPending && deleteNote.mutate(note.id)} className="button button-outline shrink-0">
          {RECORD_LABELS.remove}
        </button>
      </div>
      {note.detail && <p>{note.detail}</p>}
      <ul className="flex flex-col gap-0.5 text-fine text-ink-2">
        {note.evidence.map((evidence, index) => (
          <li key={index}>{getEvidenceLine(evidence)}</li>
        ))}
      </ul>
      <p className="text-fine text-ink-2">{RECORD_LABELS.fromSession(note.sessionTitle, formatSessionDate(note.notedAt))}</p>
      {deleteNote.error && <p role="alert" className="stop-note">{API_ERROR_LABELS[deleteNote.error.kind]}</p>}
    </li>
  );
}

function ForgetEverything() {
  const [isAsking, setIsAsking] = useState(false);
  const deleteRecord = useDeleteRecord();
  if (!isAsking) {
    return (
      <button type="button" onClick={() => setIsAsking(true)} className="button button-outline self-start">
        {RECORD_LABELS.forgetAll}
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p>{RECORD_LABELS.forgetAllCheck}</p>
      <button type="button" aria-disabled={deleteRecord.isPending} onClick={() => !deleteRecord.isPending && deleteRecord.mutate(undefined, { onSuccess: () => setIsAsking(false) })} className="button button-solid">
        {RECORD_LABELS.forgetAllYes}
      </button>
      <button type="button" onClick={() => setIsAsking(false)} className="button button-outline">
        {RECORD_LABELS.forgetAllNo}
      </button>
      {deleteRecord.error && <p role="alert" className="stop-note">{API_ERROR_LABELS[deleteRecord.error.kind]}</p>}
    </div>
  );
}

// Shows everything the tutor remembers, each note with the evidence behind it, so a student can see why it is there and remove it.
export function RecordSection() {
  const { data: record, error } = useLearnerRecord();
  return (
    <section aria-labelledby="record-title" className="flex max-w-onboarding flex-col gap-3 border-t border-line pt-4.5">
      <h2 id="record-title" className="label text-ink-2">{RECORD_LABELS.title}</h2>
      <p className="text-ink-2">{RECORD_LABELS.about}</p>
      {error && <p role="alert" className="stop-note">{API_ERROR_LABELS[error.kind]}</p>}
      {record?.notes.length === 0 && <p>{RECORD_LABELS.empty}</p>}
      {record && record.notes.length > 0 && (
        <>
          <ul className="flex flex-col border-b border-line">
            {record.notes.map((note) => (
              <NoteRow key={note.id} note={note} />
            ))}
          </ul>
          <ForgetEverything />
        </>
      )}
    </section>
  );
}
