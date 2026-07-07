export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

export interface SmsProvider {
  /** Send an SMS. `to` must already be normalized (2547XXXXXXXX). */
  send(to: string, message: string): Promise<void>;
}
