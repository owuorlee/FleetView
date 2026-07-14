import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Subscription } from 'rxjs';
import { TraccarSocketService } from '../traccar/traccar-socket.service';
import { CommandsService } from './commands.service';

/** Watches the position stream to confirm relay-command delivery from device feedback. */
@Injectable()
export class CommandDeliveryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('CommandDelivery');
  private subscription?: Subscription;

  constructor(
    private readonly socket: TraccarSocketService,
    private readonly commands: CommandsService,
  ) {}

  onModuleInit() {
    this.subscription = this.socket.positions$.subscribe((pos) => {
      this.commands.confirmDeliveryFromPosition(pos.deviceId, pos.attributes).catch((err) => {
        this.logger.error(`Delivery check failed for device ${pos.deviceId}: ${err.message}`);
      });
    });
  }

  onModuleDestroy() {
    this.subscription?.unsubscribe();
  }
}
