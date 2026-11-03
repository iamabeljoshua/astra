import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ConsentLinkDelivery {
  private readonly logger = new Logger(ConsentLinkDelivery.name);

  // Stands in for the email. Real email must ship before any real student under 18 signs up.
  send(parentEmail: string, link: string): void {
    this.logger.log(`Consent link for ${parentEmail}: ${link}`);
  }
}
