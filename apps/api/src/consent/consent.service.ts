import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ParentConsentRepository } from '../infrastructure/orm/repositories/parent-consent.repository';
import type { ConsentLinkRecord } from '../infrastructure/orm/repositories/parent-consent.repository';
import type { AccountResponseDto } from '../students/student.dto';
import { StudentsService } from '../students/students.service';
import { createLinkToken, getLocalConsentLink, hashLinkToken } from './consent-link';
import { ConsentLinkDelivery } from './consent-link-delivery';
import type { ConsentLinkResponseDto } from './consent.dto';

function toLinkResponse(record: ConsentLinkRecord | null): ConsentLinkResponseDto {
  if (!record) throw new NotFoundException();
  return { studentName: record.studentName, isAccepted: record.parentConsentAt !== null };
}

@Injectable()
export class ConsentService {
  constructor(
    private readonly students: StudentsService,
    private readonly consent: ParentConsentRepository,
    private readonly delivery: ConsentLinkDelivery,
  ) {}

  async askParent(authUserId: string, parentEmail: string): Promise<AccountResponseDto> {
    const account = await this.students.getAccount(authUserId);
    if (!account.student?.parentConsent) throw new ConflictException();
    if (account.student.parentConsent.status === 'given') return account;

    const address = parentEmail.toLowerCase();
    const token = createLinkToken();
    const fields = { studentId: account.student.id, parentEmail: address, linkTokenHash: hashLinkToken(token) };
    const { isNewLink } = await this.consent.saveRequest(fields);
    if (isNewLink) this.delivery.logInPlaceOfEmail(address, getLocalConsentLink(token, process.env));
    return this.students.getAccount(authUserId);
  }

  async readLink(token: string): Promise<ConsentLinkResponseDto> {
    return toLinkResponse(await this.consent.findLinkRecord(hashLinkToken(token)));
  }

  async acceptLink(token: string): Promise<ConsentLinkResponseDto> {
    return toLinkResponse(await this.consent.accept(hashLinkToken(token)));
  }
}
