import { Module } from '@nestjs/common';
import { TraccarModule } from '../traccar/traccar.module';
import { AlertsModule } from '../alerts/alerts.module';
import { StreamGateway } from './stream.gateway';

@Module({
  imports: [TraccarModule, AlertsModule],
  providers: [StreamGateway],
  exports: [StreamGateway],
})
export class StreamModule {}
