import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface TraccarDevice {
  id: number;
  name: string;
  uniqueId: string;
  status: string;
  lastUpdate: string | null;
}

export interface TraccarPosition {
  id: number;
  deviceId: number;
  latitude: number;
  longitude: number;
  speed: number; // knots (Traccar internal unit)
  course: number;
  fixTime: string;
  attributes: Record<string, unknown>;
}

export type TraccarCommandType = 'engineStop' | 'engineResume' | 'positionSingle';

const KNOTS_TO_KMH = 1.852;

@Injectable()
export class TraccarClient {
  private readonly logger = new Logger('TraccarClient');
  readonly baseUrl: string | undefined;
  readonly token: string | undefined;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('TRACCAR_URL') || undefined;
    this.token = config.get<string>('TRACCAR_TOKEN') || undefined;
  }

  get enabled(): boolean {
    return Boolean(this.baseUrl && this.token);
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    if (!this.enabled) {
      throw new ServiceUnavailableException('Tracking engine not configured (TRACCAR_URL/TRACCAR_TOKEN)');
    }
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`Traccar ${init?.method ?? 'GET'} ${path} → HTTP ${res.status} ${text}`);
      throw new ServiceUnavailableException(`Tracking engine error (HTTP ${res.status})`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  createDevice(name: string, imei: string): Promise<TraccarDevice> {
    return this.request<TraccarDevice>('/api/devices', {
      method: 'POST',
      body: JSON.stringify({ name, uniqueId: imei }),
    });
  }

  async disableDevice(traccarDeviceId: number, name: string, imei: string): Promise<void> {
    await this.request(`/api/devices/${traccarDeviceId}`, {
      method: 'PUT',
      body: JSON.stringify({ id: traccarDeviceId, name, uniqueId: imei, disabled: true }),
    });
  }

  async latestPosition(traccarDeviceId: number): Promise<TraccarPosition | null> {
    const positions = await this.request<TraccarPosition[]>(
      `/api/positions?deviceId=${traccarDeviceId}`,
    );
    return positions[0] ?? null;
  }

  route(traccarDeviceId: number, from: Date, to: Date): Promise<TraccarPosition[]> {
    const qs = new URLSearchParams({
      deviceId: String(traccarDeviceId),
      from: from.toISOString(),
      to: to.toISOString(),
    });
    return this.request<TraccarPosition[]>(`/api/positions?${qs}`);
  }

  async sendCommand(traccarDeviceId: number, type: TraccarCommandType): Promise<void> {
    await this.request('/api/commands/send', {
      method: 'POST',
      body: JSON.stringify({ deviceId: traccarDeviceId, type }),
    });
  }

  /** Convert Traccar's knots to km/h, rounded to 1 decimal. */
  static speedKmh(position: TraccarPosition): number {
    return Math.round(position.speed * KNOTS_TO_KMH * 10) / 10;
  }
}
