import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { PublicRoute } from '../auth/route-access';
import { AddSpendBodyDto } from './agent-channel.dto';
import type { TutorBrief } from './agent-channel.dto';
import { WriteLearnerNotesBodyDto } from '../learner-record/learner-record.dto';
import type { LearnerRecordDto } from '../learner-record/learner-record.dto';
import { AgentChannelService } from './agent-channel.service';
import { AgentKeyGuard } from './agent-key.guard';

const OK_STATUS = 200;

// What the agent needs from the API. No browser calls these, so they stay out of the API document and the generated types.
@PublicRoute()
@ApiExcludeController()
@UseGuards(AgentKeyGuard)
@Controller('agent/sessions')
export class AgentChannelController {
  constructor(private readonly agentChannel: AgentChannelService) {}

  /** What the tutor may know about the session's student. A student with no profile answers null, an empty list, and null. */
  @Get(':id/brief')
  getBrief(@Param('id') sessionId: string): Promise<TutorBrief> {
    return this.agentChannel.getBrief(sessionId);
  }

  /** Adds what a turn cost to the student's total for today. A finished session takes it too, because a turn can end as its room closes. */
  @Post(':id/spend')
  @HttpCode(OK_STATUS)
  addSpend(@Param('id') sessionId: string, @Body() { usd }: AddSpendBodyDto): Promise<{ isOverDailyLimit: boolean }> {
    return this.agentChannel.addSpend(sessionId, usd);
  }

  /** What the tutor remembers about the session's student, and only that student. */
  @Get(':id/record')
  getRecord(@Param('id') sessionId: string): Promise<LearnerRecordDto> {
    return this.agentChannel.getRecord(sessionId);
  }

  /** Adds what one room's after-session pass found. A repeat of the same update key adds nothing. */
  @Post(':id/record')
  @HttpCode(OK_STATUS)
  writeRecord(@Param('id') sessionId: string, @Body() body: WriteLearnerNotesBodyDto): Promise<{ wasApplied: boolean }> {
    return this.agentChannel.writeRecord(sessionId, body);
  }
}
