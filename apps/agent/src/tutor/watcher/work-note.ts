import type { StudentWork } from '@astra/contracts';
import { type CheckedWork, getPointFacts, type WorkContext } from '@astra/board/shared';

// Lines of code usually pass with no reply, so the tutor would otherwise never see them. Everything else with words in it comes as the turn's own text.
function getLineFacts(work: StudentWork & { way: 'write' }, { reading }: CheckedWork) {
  const math = reading?.parts.flatMap((part) => (part.type === 'math' ? [part.tex] : [])) ?? [];
  const [first] = reading?.parts ?? [];
  const code = reading?.kind === 'code' && first?.type === 'words' ? { code: first.text } : {};
  const hand = work.ink ? { written_by_hand: true, reader_said: work.text, ...(work.ink.isUnsure ? { reader_is_unsure: true } : {}) } : {};
  return { line: work.id, kind: reading?.kind, ...(math.length > 0 ? { read_as: math } : {}), ...code, ...hand, ...(reading?.isAsking ? { is_asking: true } : {}) };
}

function getWayFacts(work: StudentWork, checked: CheckedWork, context: WorkContext): Record<string, unknown> {
  switch (work.way) {
    case 'write':
      return getLineFacts(work, checked);
    case 'pick':
      return { picked: work.part };
    case 'place':
      return { placed: work.placed };
    case 'drag': {
      const curve = context.task?.way === 'drag' ? context.getCurve(context.task.on) : null;
      return { point: curve ? getPointFacts(curve, work.x) : { x: work.x } };
    }
  }
}

/** What the tutor is told, built by code, so it holds facts and no judgment of the model's own. */
export function getWorkNote(work: StudentWork, checked: CheckedWork, context: WorkContext) {
  const { verdict, closesTask } = checked;
  return {
    way: work.way,
    ...(context.task ? { task: context.task.id } : {}),
    ...getWayFacts(work, checked, context),
    check: verdict.status,
    ...(verdict.status === 'wrong' ? { why: verdict.why } : {}),
    ...(verdict.status === 'wrong' && verdict.isBuiltOnWrongLine ? { built_on_wrong_line: true } : {}),
    ...(closesTask ? { task_done: true } : {}),
  };
}
