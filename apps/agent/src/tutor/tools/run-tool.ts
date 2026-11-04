import type { FindSource } from '../../providers/types.ts';
import { compute, plotValues } from './compute.ts';
import { sayComputeAnswer, sayPlotAnswer, saySourceAnswer } from './spoken-result.ts';
import type { ToolCall } from './tool-call.ts';

export interface ToolResult {
  note: Record<string, unknown>;
  costUsd: number;
  /** What code says itself if the model will not say the result. Null means code has no words for it. */
  spoken: string | null;
}

const FREE = 0;

// Code owns the numbers, so what a tool returns is what the student hears, and no tool can touch the board.
export async function runTool(call: ToolCall, { findSource, signal }: { findSource: FindSource | null; signal: AbortSignal }): Promise<ToolResult> {
  switch (call.tool) {
    case 'compute': {
      const answer = compute(call);
      return { note: { tool: call.tool, expression: call.expression, ...answer }, costUsd: FREE, spoken: sayComputeAnswer(answer) };
    }
    case 'plotValues': {
      const answer = plotValues(call);
      return { note: { tool: call.tool, expression: call.expression, ...answer }, costUsd: FREE, spoken: sayPlotAnswer(answer) };
    }
    case 'findSource': {
      if (!findSource) return { note: { tool: call.tool, found: false }, costUsd: FREE, spoken: saySourceAnswer({ found: false }) };
      const { costUsd, ...answer } = await findSource(call.claim, signal);
      return { note: { tool: call.tool, ...answer }, costUsd, spoken: saySourceAnswer(answer) };
    }
  }
}
