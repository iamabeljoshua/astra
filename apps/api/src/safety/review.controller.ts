import { Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';
import { CurrentAuthUserId, SignedInRoute } from '../auth/route-access';
import { ReviewerGuard } from './reviewer.guard';
import { SafetyFlagResponseDto } from './safety.dto';
import { SafetyService } from './safety.service';

@SignedInRoute()
@UseGuards(ReviewerGuard)
@Controller('review/flags')
export class ReviewController {
  constructor(private readonly safety: SafetyService) {}

  /** Lists every safety flag for a named reviewer, unreviewed first and then newest first. */
  @Get()
  listFlags(): Promise<SafetyFlagResponseDto[]> {
    return this.safety.listFlags();
  }

  /** Marks one flag reviewed. The first reviewer stays on the record. */
  @ApiParam({ name: 'id', description: 'The ID of the flag.' })
  @Post(':id/reviewed')
  @HttpCode(HttpStatus.OK)
  markReviewed(@Param('id') flagId: string, @CurrentAuthUserId() reviewerId: string): Promise<SafetyFlagResponseDto> {
    return this.safety.markReviewed({ flagId, reviewerId });
  }
}
