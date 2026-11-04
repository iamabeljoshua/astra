import { compute, plotValues } from './compute.ts';
import type { FindSource } from './find-source.ts';
import type { ToolCall } from './tool-call.ts';

export interface ToolResult {
  note: Record<string, unknown>;
  costUsd: number;
}

const FREE = 0;

// Code owns the numbers, so what a tool returns is what the student hears, and no tool can touch the board.
export async function runTool(call: ToolCall, { findSource, signal }: { findSource: FindSource | null; signal: AbortSignal }): Promise<ToolResult> {
  switch (call.tool) {
    case 'compute':
      return { note: { tool: call.tool, expression: call.expression, ...compute(call) }, costUsd: FREE };
    case 'plotValues':
      return { note: { tool: call.tool, expression: call.expression, ...plotValues(call) }, costUsd: FREE };
    case 'findSource': {
      if (!findSource) return { note: { tool: call.tool, found: false }, costUsd: FREE };
      const { costUsd, ...answer } = await findSource(call.claim, signal);
      return { note: { tool: call.tool, ...answer }, costUsd };
    }
  }
}
