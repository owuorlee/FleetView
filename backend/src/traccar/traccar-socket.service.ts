import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Subject } from 'rxjs';
import WebSocket from 'ws';
import { TraccarClient, TraccarPosition } from './traccar.client';

export interface TraccarEvent {
  id: number;
  deviceId: number;
  type: string;
  eventTime: string;
  positionId?: number;
  geofenceId?: number;
  attributes: Record<string, unknown>;
}

export type ConnectionState = 'disabled' | 'connecting' | 'connected' | 'reconnecting';

const MAX_BACKOFF_MS = 60_000;

/**
 * Maintains the single upstream WebSocket to Traccar (/api/socket) and
 * re-publishes positions/events as RxJS streams for the alert pipeline
 * and the client-facing fan-out (spec §2.2, §6).
 */
@Injectable()
export class TraccarSocketService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('TraccarSocket');
  private ws: WebSocket | null = null;
  private backoffMs = 1_000;
  private stopped = false;

  readonly positions$ = new Subject<TraccarPosition>();
  readonly events$ = new Subject<TraccarEvent>();
  connectionState: ConnectionState = 'disabled';

  constructor(private readonly client: TraccarClient) {}

  onModuleInit() {
    if (!this.client.enabled) {
      this.logger.warn('Traccar not configured — live stream disabled');
      return;
    }
    void this.connect();
  }

  onModuleDestroy() {
    this.stopped = true;
    this.ws?.close();
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    this.connectionState = 'connecting';
    try {
      // A WebSocket connection needs a session cookie; exchange the API token for one.
      const res = await fetch(
        `${this.client.baseUrl}/api/session?token=${encodeURIComponent(this.client.token!)}`,
      );
      if (!res.ok) throw new Error(`session exchange failed: HTTP ${res.status}`);
      const cookie = res.headers.get('set-cookie');
      if (!cookie) throw new Error('no session cookie returned');

      const wsUrl = `${this.client.baseUrl!.replace(/^http/, 'ws')}/api/socket`;
      const ws = new WebSocket(wsUrl, { headers: { Cookie: cookie.split(';')[0] } });
      this.ws = ws;

      ws.on('open', () => {
        this.connectionState = 'connected';
        this.backoffMs = 1_000;
        this.logger.log('Connected to Traccar live stream');
      });

      ws.on('message', (data) => {
        try {
          const payload = JSON.parse(data.toString());
          for (const p of payload.positions ?? []) this.positions$.next(p);
          for (const e of payload.events ?? []) this.events$.next(e);
        } catch {
          this.logger.warn('Unparseable frame from Traccar socket');
        }
      });

      ws.on('close', () => this.scheduleReconnect());
      ws.on('error', (err) => {
        this.logger.error(`Socket error: ${err.message}`);
        ws.close();
      });
    } catch (err) {
      this.logger.error(`Connect failed: ${(err as Error).message}`);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.connectionState = 'reconnecting';
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
    this.logger.warn(`Reconnecting to Traccar in ${Math.round(delay / 1000)}s`);
    setTimeout(() => void this.connect(), delay).unref();
  }
}
