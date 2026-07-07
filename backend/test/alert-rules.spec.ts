import { describe, expect, it } from 'vitest';
import { dedupKey, mapTraccarEvent } from '../src/alerts/alert-rules';
import { TraccarEvent } from '../src/traccar/traccar-socket.service';

function event(type: string, attributes: Record<string, unknown> = {}): TraccarEvent {
  return { id: 1, deviceId: 42, type, eventTime: '2026-07-08T09:00:00Z', attributes };
}

describe('mapTraccarEvent', () => {
  it('maps powerCut alarm to critical power_cut', () => {
    const rule = mapTraccarEvent(event('alarm', { alarm: 'powerCut' }));
    expect(rule).toMatchObject({ type: 'power_cut', severity: 'critical' });
  });

  it('maps jamming alarm to critical', () => {
    expect(mapTraccarEvent(event('alarm', { alarm: 'jamming' }))).toMatchObject({
      type: 'jamming',
      severity: 'critical',
    });
  });

  it('maps deviceOverspeed to warning overspeed', () => {
    expect(mapTraccarEvent(event('deviceOverspeed'))).toMatchObject({
      type: 'overspeed',
      severity: 'warning',
    });
  });

  it('maps geofence events', () => {
    expect(mapTraccarEvent(event('geofenceEnter'))!.type).toBe('geofence_in');
    expect(mapTraccarEvent(event('geofenceExit'))!.type).toBe('geofence_out');
  });

  it('drops non-customer-meaningful events', () => {
    expect(mapTraccarEvent(event('commandResult'))).toBeNull();
    expect(mapTraccarEvent(event('deviceUnknown'))).toBeNull();
    expect(mapTraccarEvent(event('alarm', { alarm: 'somethingWeird' }))).toBeNull();
  });
});

describe('dedupKey', () => {
  it('is stable within a bucket', () => {
    const a = dedupKey('overspeed', 'v1', new Date('2026-07-08T09:01:00Z'), 10);
    const b = dedupKey('overspeed', 'v1', new Date('2026-07-08T09:09:59Z'), 10);
    expect(a).toBe(b);
  });

  it('changes across buckets', () => {
    const a = dedupKey('overspeed', 'v1', new Date('2026-07-08T09:09:59Z'), 10);
    const b = dedupKey('overspeed', 'v1', new Date('2026-07-08T09:10:00Z'), 10);
    expect(a).not.toBe(b);
  });

  it('separates vehicles and types', () => {
    const t = new Date('2026-07-08T09:00:00Z');
    expect(dedupKey('overspeed', 'v1', t, 10)).not.toBe(dedupKey('overspeed', 'v2', t, 10));
    expect(dedupKey('overspeed', 'v1', t, 10)).not.toBe(dedupKey('offline', 'v1', t, 10));
  });
});
