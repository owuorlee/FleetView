import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Endpoint paths per Safaricom Daraja docs (developer.safaricom.co.ke).
// Base URL comes from env: sandbox https://sandbox.safaricom.co.ke,
// production https://api.safaricom.co.ke.
const OAUTH_PATH = '/oauth/v1/generate?grant_type=client_credentials';
const STK_PUSH_PATH = '/mpesa/stkpush/v1/processrequest';
const STK_QUERY_PATH = '/mpesa/stkpushquery/v1/query';
const C2B_REGISTER_PATH = '/mpesa/c2b/v1/registerurl';

/** yyyyMMddHHmmss in East Africa Time — the format Daraja requires. */
export function darajaTimestamp(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}${get('month')}${get('day')}${get('hour')}${get('minute')}${get('second')}`;
}

/** Password = base64(Shortcode + Passkey + Timestamp). */
export function darajaPassword(shortcode: string, passkey: string, timestamp: string): string {
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
}

export interface StkPushResult {
  merchantRequestId: string;
  checkoutRequestId: string;
}

@Injectable()
export class DarajaClient {
  private readonly logger = new Logger('Daraja');
  private token: { value: string; expiresAt: number } | null = null;

  private readonly baseUrl: string;
  private readonly consumerKey?: string;
  private readonly consumerSecret?: string;
  readonly shortcode?: string;
  private readonly passkey?: string;
  private readonly callbackBase?: string;
  readonly webhookSecret?: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get('DARAJA_BASE_URL') || 'https://sandbox.safaricom.co.ke';
    this.consumerKey = config.get('DARAJA_CONSUMER_KEY') || undefined;
    this.consumerSecret = config.get('DARAJA_CONSUMER_SECRET') || undefined;
    this.shortcode = config.get('DARAJA_SHORTCODE') || undefined;
    this.passkey = config.get('DARAJA_PASSKEY') || undefined;
    this.callbackBase = config.get('DARAJA_CALLBACK_BASE_URL') || undefined;
    this.webhookSecret = config.get('DARAJA_WEBHOOK_SECRET') || undefined;
  }

  get enabled(): boolean {
    return Boolean(
      this.consumerKey &&
        this.consumerSecret &&
        this.shortcode &&
        this.passkey &&
        this.callbackBase &&
        this.webhookSecret,
    );
  }

  private assertEnabled() {
    if (!this.enabled) {
      throw new ServiceUnavailableException(
        'M-Pesa not configured (DARAJA_* env vars missing)',
      );
    }
  }

  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt) return this.token.value;

    const basic = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
    const res = await fetch(`${this.baseUrl}${OAUTH_PATH}`, {
      headers: { Authorization: `Basic ${basic}` },
    });
    if (!res.ok) {
      this.logger.error(`OAuth failed: HTTP ${res.status}`);
      throw new ServiceUnavailableException('M-Pesa auth failed');
    }
    const body = (await res.json()) as { access_token: string; expires_in: string };
    // Refresh 5 minutes early.
    this.token = {
      value: body.access_token,
      expiresAt: Date.now() + (Number(body.expires_in) - 300) * 1000,
    };
    return this.token.value;
  }

  private async post<T>(path: string, payload: unknown): Promise<T> {
    const token = await this.accessToken();
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) {
      this.logger.error(`Daraja ${path} → HTTP ${res.status}: ${text}`);
      throw new ServiceUnavailableException('M-Pesa request failed');
    }
    return JSON.parse(text) as T;
  }

  /** Fire an STK Push. AccountReference is capped at 12 chars by Daraja. */
  async stkPush(input: {
    amountKsh: number;
    payerPhone: string; // 2547XXXXXXXX
    accountRef: string;
    description: string;
  }): Promise<StkPushResult> {
    this.assertEnabled();
    const timestamp = darajaTimestamp();
    const body = await this.post<{
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResponseCode: string;
    }>(STK_PUSH_PATH, {
      BusinessShortCode: this.shortcode,
      Password: darajaPassword(this.shortcode!, this.passkey!, timestamp),
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: input.amountKsh,
      PartyA: input.payerPhone,
      PartyB: this.shortcode,
      PhoneNumber: input.payerPhone,
      CallBackURL: `${this.callbackBase}/v1/webhooks/daraja/${this.webhookSecret}/stk`,
      AccountReference: input.accountRef.slice(0, 12),
      TransactionDesc: input.description.slice(0, 13),
    });
    return {
      merchantRequestId: body.MerchantRequestID,
      checkoutRequestId: body.CheckoutRequestID,
    };
  }

  /** Query the outcome of an STK push that never called back. */
  async stkQuery(checkoutRequestId: string): Promise<{ resultCode: string; resultDesc: string }> {
    this.assertEnabled();
    const timestamp = darajaTimestamp();
    const body = await this.post<{ ResultCode: string; ResultDesc: string }>(STK_QUERY_PATH, {
      BusinessShortCode: this.shortcode,
      Password: darajaPassword(this.shortcode!, this.passkey!, timestamp),
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    });
    return { resultCode: body.ResultCode, resultDesc: body.ResultDesc };
  }

  /** One-time registration of C2B confirmation/validation URLs (run via `npm run daraja:register-c2b`). */
  async registerC2bUrls(): Promise<void> {
    this.assertEnabled();
    await this.post(C2B_REGISTER_PATH, {
      ShortCode: this.shortcode,
      ResponseType: 'Completed',
      ConfirmationURL: `${this.callbackBase}/v1/webhooks/daraja/${this.webhookSecret}/c2b`,
      ValidationURL: `${this.callbackBase}/v1/webhooks/daraja/${this.webhookSecret}/c2b-validate`,
    });
    this.logger.log('C2B URLs registered');
  }
}
