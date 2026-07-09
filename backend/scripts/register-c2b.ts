// One-time C2B URL registration: npm run daraja:register-c2b
// Requires all DARAJA_* env vars (reads .env like the app does).
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { DarajaClient } from '../src/billing/daraja.client';

async function main() {
  const config = new ConfigService(process.env as Record<string, string>);
  const daraja = new DarajaClient(config);
  if (!daraja.enabled) {
    console.error('DARAJA_* env vars incomplete — fill .env first.');
    process.exit(1);
  }
  await daraja.registerC2bUrls();
  console.log('C2B confirmation/validation URLs registered for shortcode', daraja.shortcode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
