import { Module } from '@nestjs/common';
import { TraccarClient } from './traccar.client';
import { TraccarSocketService } from './traccar-socket.service';

@Module({
  providers: [TraccarClient, TraccarSocketService],
  exports: [TraccarClient, TraccarSocketService],
})
export class TraccarModule {}
