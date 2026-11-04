import type { StudentWork } from '@astra/contracts';
import { type CheckedWork, getLineTex, getNod, getPointFacts, isFinishedAnswer, wantsSomethingElse, type WorkContext } from '@astra/board/shared';

function getLineFacts(work: StudentWork & { way: 'write' }, { reading }: CheckedWork) {
  const math = reading?.parts.flatMap((part) => (part.type === 'math' ? [part.tex] : [])) ?? [];
  const [first] = reading?.parts ?? [];
  const code = reading?.kind === 'code' && first?.type === 'words' ? { code: first.text } : {};
  const voice = work.heard ? { said_aloud: true, heard: work.text, ...(work.heard.isUnsure ? { reader_is_unsure: true } : {}) } : {};
  const hand = work.ink ? { written_by_hand: true, reader_said: work.text, ...(work.ink.isUnsure ? { reader_is_unsure: true } : {}) } : {};
  return { line: work.id, kind: reading?.kind, ...(math.length > 0 ? { read_as: math } : {}), ...code, ...hand, ...voice, ...(reading?.isAsking ? { is_asking: true } : {}) };
}

function getWayFacts(work: StudentWork, checked: CheckedWork, context: WorkContext): Record<string, unknown> {
  switch (work.way) {
    case 'write':
      return getLineFacts(work, checked);
    case 'leave':
      return { left_the_task: true };
    case 'pick':
      return { picked: work.part };
    case 'place':
      return { placed: work.placed };
    case 'drag': {
      const curve = context.task?.way === 'drag' ? context.getCurve(context.task.on) : null;
      return { point: curve ? getPointFacts(curve.value, work.x) : { x: work.x } };
    }
  }
}

const isLeaving = (work: StudentWork) => work.way === 'leave' || (work.way === 'write' && wantsSomethingElse(work.text));

function isFinishedLine({ reading, verdict }: CheckedWork): boolean {
  const tex = reading ? getLineTex(reading) : null;
  return verdict.status === 'right' && tex !== null && isFinishedAnswer(tex);
}

export function getWorkNote(work: StudentWork, checked: CheckedWork, context: WorkContext) {
  const { verdict, closesTask } = checked;
  const nod = getNod(work, checked);
  return {
    way: work.way,
    ...(context.task ? { task: context.task.id } : {}),
    ...getWayFacts(work, checked, context),
    check: verdict.status,
    ...(verdict.status === 'wrong' ? { why: verdict.why } : {}),
    ...(verdict.status === 'wrong' && verdict.isBuiltOnWrongLine ? { built_on_wrong_line: true } : {}),
    ...(verdict.status === 'unknown' && verdict.offProblem !== undefined ? { does_not_follow_from: verdict.offProblem } : {}),
    ...(nod ? { already_reacted: { said: nod } } : {}),
    ...(closesTask && isLeaving(work) ? { left_the_task: true } : closesTask || isFinishedLine(checked) ? { task_done: true } : {}),
  };
}
