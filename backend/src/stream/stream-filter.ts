import { TraccarPosition } from '../traccar/traccar.client';
import { TraccarClient } from '../traccar/traccar.client';

/** What one connected client is allowed to see, snapshotted at connect time. */
export interface ClientScope {
  userId: string;
  /** traccarDeviceId → vehicleId */
  deviceToVehicle: Map<number, string>;
  vehicleIds: Set<string>;
}

export interface CreatedAlert {
  alertId: string;
  vehicleId: string;
  type: string;
  severity: string;
  positionSnapshot?: unknown;
}

/** Format a Traccar position for a client, or null if outside their scope. */
export function positionMessage(scope: ClientScope, pos: TraccarPosition): string | null {
  const vehicleId = scope.deviceToVehicle.get(pos.deviceId);
  if (!vehicleId) return null;
  return JSON.stringify({
    type: 'position',
    vehicleId,
    latitude: pos.latitude,
    longitude: pos.longitude,
    speedKmh: TraccarClient.speedKmh(pos),
    course: pos.course,
    fixTime: pos.fixTime,
    ignition: pos.attributes?.['ignition'] ?? null,
    batteryVolts: pos.attributes?.['power'] ?? null,
  });
}

/** Format an alert for a client, or null if outside their scope. */
export function alertMessage(scope: ClientScope, alert: CreatedAlert): string | null {
  if (!scope.vehicleIds.has(alert.vehicleId)) return null;
  return JSON.stringify({
    type: 'alert',
    alertId: alert.alertId,
    vehicleId: alert.vehicleId,
    alertType: alert.type,
    severity: alert.severity,
    positionSnapshot: alert.positionSnapshot ?? null,
  });
}
