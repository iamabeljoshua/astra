import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ConsentLinkDelivery {
  private readonly logger = new Logger(ConsentLinkDelivery.name);

  logInPlaceOfEmail(parentEmail: string, link: string): void {
    this.logger.log(`Consent link for ${parentEmail}: ${link}`);
  }
}
