import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { AgentKeyGuard } from '../agent-channel/agent-key.guard';
import { PublicRoute } from '../auth/route-access';
import { AddSafetyFlagBodyDto } from './safety.dto';
import { SafetyService } from './safety.service';

// No browser calls this, so it stays out of the API document and the generated types.
@PublicRoute()
@ApiExcludeController()
@UseGuards(AgentKeyGuard)
@Controller('agent/sessions')
export class SafetyAgentController {
  constructor(private readonly safety: SafetyService) {}

  /** Records that a turn raised a safety concern. A finished session takes it too, because a turn can end as its room closes. */
  @Post(':id/flags')
  @HttpCode(HttpStatus.OK)
  async addFlag(@Param('id') sessionId: string, @Body() body: AddSafetyFlagBodyDto): Promise<{ flagged: true }> {
    await this.safety.addFlag(sessionId, body);
    return { flagged: true };
  }
}
