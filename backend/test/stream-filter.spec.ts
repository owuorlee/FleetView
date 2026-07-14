import { describe, expect, it } from 'vitest';
import { alertMessage, ClientScope, positionMessage } from '../src/stream/stream-filter';
import { TraccarPosition } from '../src/traccar/traccar.client';

function scope(): ClientScope {
  return {
    userId: 'u1',
    deviceToVehicle: new Map([[42, 'v1']]),
    vehicleIds: new Set(['v1']),
  };
}

function pos(deviceId: number, over: Partial<TraccarPosition> = {}): TraccarPosition {
  return {
    id: 1,
    deviceId,
    latitude: -1.29,
    longitude: 36.82,
    speed: 10, // knots
    course: 90,
    fixTime: '2026-07-14T09:00:00Z',
    attributes: { ignition: true, power: 12.4 },
    ...over,
  };
}

describe('positionMessage', () => {
  it('emits a scoped position for an owned device, converting knots to km/h', () => {
    const msg = positionMessage(scope(), pos(42));
    expect(msg).not.toBeNull();
    const parsed = JSON.parse(msg!);
    expect(parsed).toMatchObject({
      type: 'position',
      vehicleId: 'v1',
      speedKmh: 18.5, // 10 knots
      ignition: true,
      batteryVolts: 12.4,
    });
  });

  it('returns null for a device the client does not own (no leak)', () => {
    expect(positionMessage(scope(), pos(99))).toBeNull();
  });
});

describe('alertMessage', () => {
  it('emits a scoped alert for an owned vehicle', () => {
    const msg = alertMessage(scope(), {
      alertId: 'a1',
      vehicleId: 'v1',
      type: 'power_cut',
      severity: 'critical',
      positionSnapshot: { latitude: -1.29, longitude: 36.82 },
    });
    expect(JSON.parse(msg!)).toMatchObject({
      type: 'alert',
      alertId: 'a1',
      vehicleId: 'v1',
      alertType: 'power_cut',
      severity: 'critical',
    });
  });

  it('returns null for an alert on an unowned vehicle', () => {
    const msg = alertMessage(scope(), {
      alertId: 'a2',
      vehicleId: 'v-other',
      type: 'overspeed',
      severity: 'warning',
    });
    expect(msg).toBeNull();
  });
});
