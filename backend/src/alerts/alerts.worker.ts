import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Subscription } from 'rxjs';
import { TraccarSocketService } from '../traccar/traccar-socket.service';
import { AlertsService } from './alerts.service';

/** Bridges the Traccar event stream into the alert pipeline. */
@Injectable()
export class AlertsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('AlertsWorker');
  private subscription?: Subscription;

  constructor(
    private readonly socket: TraccarSocketService,
    private readonly alerts: AlertsService,
  ) {}

  onModuleInit() {
    this.subscription = this.socket.events$.subscribe((event) => {
      this.alerts.ingestEvent(event).catch((err) => {
        this.logger.error(`Ingest failed for event ${event.id} (${event.type}): ${err.message}`);
      });
    });
  }

  onModuleDestroy() {
    this.subscription?.unsubscribe();
  }
}
