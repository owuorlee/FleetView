import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Subscription } from 'rxjs';
import { IncomingMessage } from 'http';
import { Duplex } from 'stream';
import { WebSocket, WebSocketServer } from 'ws';
import { PrismaService } from '../prisma/prisma.service';
import { TraccarSocketService } from '../traccar/traccar-socket.service';
import { AlertsService } from '../alerts/alerts.service';
import { ClientScope, alertMessage, positionMessage } from './stream-filter';

const HEARTBEAT_MS = 30_000;

interface ScopedSocket extends WebSocket {
  scope?: ClientScope;
  isAlive?: boolean;
}

/**
 * Client-facing live stream (spec §4.1 `/v1/stream`). One upstream Traccar
 * socket (via TraccarSocketService) is fanned out to many authenticated app
 * clients, each filtered to the vehicles they own. Auth is the JWT passed as
 * ?token= on the WebSocket URL (browsers can't set headers on WS).
 */
@Injectable()
export class StreamGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Stream');
  private wss?: WebSocketServer;
  private subs: Subscription[] = [];
  private heartbeat?: NodeJS.Timeout;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly traccarSocket: TraccarSocketService,
    private readonly alerts: AlertsService,
  ) {}

  onModuleInit() {
    this.wss = new WebSocketServer({ noServer: true });

    // Fan out positions and alerts to every client whose scope allows them.
    this.subs.push(
      this.traccarSocket.positions$.subscribe((pos) => {
        this.broadcast((scope) => positionMessage(scope, pos));
      }),
    );
    this.subs.push(
      this.alerts.created$.subscribe((alert) => {
        this.broadcast((scope) => alertMessage(scope, alert));
      }),
    );

    // Drop dead connections so scopes don't leak.
    this.heartbeat = setInterval(() => {
      this.wss?.clients.forEach((raw) => {
        const client = raw as ScopedSocket;
        if (client.isAlive === false) return client.terminate();
        client.isAlive = false;
        client.ping();
      });
    }, HEARTBEAT_MS);
    this.heartbeat.unref?.();
  }

  onModuleDestroy() {
    this.subs.forEach((s) => s.unsubscribe());
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.wss?.close();
  }

  /** Wired into the HTTP server's 'upgrade' event in main.ts. */
  async handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    const { pathname, searchParams } = new URL(req.url ?? '', 'http://localhost');
    if (pathname !== '/v1/stream') {
      socket.destroy();
      return;
    }
    const token = searchParams.get('token');
    const scope = token ? await this.buildScope(token) : null;
    if (!scope) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    this.wss!.handleUpgrade(req, socket, head, (ws) => {
      const client = ws as ScopedSocket;
      client.scope = scope;
      client.isAlive = true;
      client.on('pong', () => (client.isAlive = true));
      client.send(JSON.stringify({ type: 'ready', vehicles: [...scope.vehicleIds] }));
      this.logger.log(`Client connected: user ${scope.userId}, ${scope.vehicleIds.size} vehicle(s)`);
    });
  }

  private async buildScope(token: string): Promise<ClientScope | null> {
    let userId: string;
    try {
      userId = (await this.jwt.verifyAsync(token)).sub;
    } catch {
      return null;
    }
    // Vehicles the user owns directly. (Org-scoped fan-out extends this later.)
    const vehicles = await this.prisma.vehicle.findMany({
      where: { ownerUserId: userId },
      include: { device: { select: { traccarDeviceId: true } } },
    });
    const deviceToVehicle = new Map<number, string>();
    const vehicleIds = new Set<string>();
    for (const v of vehicles) {
      vehicleIds.add(v.id);
      if (v.device?.traccarDeviceId != null) {
        deviceToVehicle.set(v.device.traccarDeviceId, v.id);
      }
    }
    return { userId, deviceToVehicle, vehicleIds };
  }

  private broadcast(render: (scope: ClientScope) => string | null) {
    if (!this.wss) return;
    for (const raw of this.wss.clients) {
      const client = raw as ScopedSocket;
      if (client.readyState !== WebSocket.OPEN || !client.scope) continue;
      const msg = render(client.scope);
      if (msg) client.send(msg);
    }
  }
}
