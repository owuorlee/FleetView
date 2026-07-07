import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SMS_PROVIDER } from './sms.provider';
import { DevSmsProvider } from './dev-sms.provider';
import { AfricasTalkingProvider } from './africas-talking.provider';

@Module({
  providers: [
    DevSmsProvider,
    AfricasTalkingProvider,
    {
      provide: SMS_PROVIDER,
      inject: [ConfigService, DevSmsProvider, AfricasTalkingProvider],
      useFactory: (
        config: ConfigService,
        dev: DevSmsProvider,
        at: AfricasTalkingProvider,
      ) => (config.get('SMS_PROVIDER') === 'africastalking' ? at : dev),
    },
  ],
  exports: [SMS_PROVIDER],
})
export class SmsModule {}
