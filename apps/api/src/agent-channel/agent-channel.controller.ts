import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { PublicRoute } from '../auth/route-access';
import { AddSpendBodyDto, SetTitleBodyDto } from './agent-channel.dto';
import type { TutorBrief } from './agent-channel.dto';
import { AgentChannelService } from './agent-channel.service';
import { AgentKeyGuard } from './agent-key.guard';

const OK_STATUS = 200;
const NO_CONTENT_STATUS = 204;

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

  /** Renames a running session, when the student moved to another topic in it. A finished session keeps its title. */
  @Post(':id/title')
  @HttpCode(NO_CONTENT_STATUS)
  setTitle(@Param('id') sessionId: string, @Body() { title }: SetTitleBodyDto): Promise<void> {
    return this.agentChannel.setTitle(sessionId, title);
  }
}
