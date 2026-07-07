import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsProvider } from './sms.provider';

const AT_ENDPOINT = 'https://api.africastalking.com/version1/messaging';

@Injectable()
export class AfricasTalkingProvider implements SmsProvider {
  private readonly logger = new Logger('AfricasTalking');

  constructor(private readonly config: ConfigService) {}

  async send(to: string, message: string): Promise<void> {
    const username = this.config.getOrThrow<string>('AT_USERNAME');
    const apiKey = this.config.getOrThrow<string>('AT_API_KEY');
    const from = this.config.get<string>('AT_SENDER_ID');

    const body = new URLSearchParams({
      username,
      to: `+${to}`,
      message,
      ...(from ? { from } : {}),
    });

    const res = await fetch(AT_ENDPOINT, {
      method: 'POST',
      headers: {
        apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`SMS to ${to} failed: HTTP ${res.status} ${text}`);
      throw new Error(`Africa's Talking send failed (HTTP ${res.status})`);
    }
  }
}
