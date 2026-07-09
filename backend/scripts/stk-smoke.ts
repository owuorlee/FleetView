// Sandbox smoke test: OAuth + STK Push initiation against Daraja.
// Usage: npx tsx scripts/stk-smoke.ts [payerPhone]
// Defaults to Safaricom's public sandbox test MSISDN.
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { DarajaClient } from '../src/billing/daraja.client';

const SANDBOX_TEST_MSISDN = '254708374149';

async function main() {
  const daraja = new DarajaClient(new ConfigService(process.env as Record<string, string>));
  if (!daraja.enabled) {
    console.error('DARAJA_* env vars incomplete — fill .env first.');
    process.exit(1);
  }
  const payer = process.argv[2] ?? SANDBOX_TEST_MSISDN;
  console.log(`Firing sandbox STK Push: KSh 1 from ${payer}, shortcode ${daraja.shortcode} ...`);
  const result = await daraja.stkPush({
    amountKsh: 1,
    payerPhone: payer,
    accountRef: 'SMOKETEST',
    description: 'FleetView',
  });
  console.log('ACCEPTED by Daraja:');
  console.log('  MerchantRequestID:', result.merchantRequestId);
  console.log('  CheckoutRequestID:', result.checkoutRequestId);
  console.log('OAuth + STK request signing verified end-to-end.');
}

main().catch((err) => {
  console.error('FAILED:', err.message ?? err);
  process.exit(1);
});
