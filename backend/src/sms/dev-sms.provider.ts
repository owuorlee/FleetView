import { Injectable, Logger } from '@nestjs/common';
import { SmsProvider } from './sms.provider';

/** Dev/test provider: prints messages to the server log instead of sending. */
@Injectable()
export class DevSmsProvider implements SmsProvider {
  private readonly logger = new Logger('DevSms');

  async send(to: string, message: string): Promise<void> {
    this.logger.log(`[SMS → ${to}] ${message}`);
  }
}
