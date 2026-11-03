import { Body, Controller, Get, Header, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { CurrentAuthUserId, PublicRoute, StudentBeforeConsentRoute } from '../auth/route-access';
import { AccountResponseDto } from '../students/student.dto';
import { AskParentBodyDto, ConsentLinkResponseDto, ConsentLinkTokenDto } from './consent.dto';
import { ConsentService } from './consent.service';

@Controller()
export class ConsentController {
  constructor(private readonly consentService: ConsentService) {}

  /** Asks a parent or guardian to approve this student. The same address keeps its link, and a new address replaces it. */
  @StudentBeforeConsentRoute()
  @Put('me/parent-consent')
  askParent(@CurrentAuthUserId() authUserId: string, @Body() body: AskParentBodyDto): Promise<AccountResponseDto> {
    return this.consentService.askParent(authUserId, body.parentEmail);
  }

  /** Reads what a consent link is asking. A parent opens this with no account, and reading it accepts nothing. */
  @PublicRoute()
  @Header('Cache-Control', 'no-store')
  @Get('parent-consent/:token')
  readLink(@Param() { token }: ConsentLinkTokenDto): Promise<ConsentLinkResponseDto> {
    return this.consentService.readLink(token);
  }

  /** Records the parent or guardian's acceptance. The first acceptance stands. */
  @PublicRoute()
  @Header('Cache-Control', 'no-store')
  @Post('parent-consent/accept')
  @HttpCode(HttpStatus.OK)
  acceptLink(@Body() { token }: ConsentLinkTokenDto): Promise<ConsentLinkResponseDto> {
    return this.consentService.acceptLink(token);
  }
}
