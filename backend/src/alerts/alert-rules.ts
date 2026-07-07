import { AlertSeverity, AlertType } from '@prisma/client';
import { TraccarEvent } from '../traccar/traccar-socket.service';

export interface AlertRule {
  type: AlertType;
  severity: AlertSeverity;
  /** Dedup bucket: repeats within the same bucket increment a counter instead of re-alerting. */
  bucketMinutes: number;
}

const ALARM_RULES: Record<string, AlertRule> = {
  powerCut: { type: 'power_cut', severity: 'critical', bucketMinutes: 30 },
  jamming: { type: 'jamming', severity: 'critical', bucketMinutes: 30 },
  tampering: { type: 'tamper', severity: 'critical', bucketMinutes: 30 },
  tamper: { type: 'tamper', severity: 'critical', bucketMinutes: 30 },
  sos: { type: 'sos', severity: 'critical', bucketMinutes: 5 },
  lowBattery: { type: 'low_battery', severity: 'warning', bucketMinutes: 720 },
};

const EVENT_RULES: Record<string, AlertRule> = {
  deviceOverspeed: { type: 'overspeed', severity: 'warning', bucketMinutes: 10 },
  geofenceEnter: { type: 'geofence_in', severity: 'info', bucketMinutes: 15 },
  geofenceExit: { type: 'geofence_out', severity: 'warning', bucketMinutes: 15 },
  ignitionOn: { type: 'ignition_on', severity: 'info', bucketMinutes: 5 },
  ignitionOff: { type: 'ignition_off', severity: 'info', bucketMinutes: 5 },
  deviceOffline: { type: 'offline', severity: 'warning', bucketMinutes: 60 },
};

/** Map a raw Traccar event to an alert rule, or null if not customer-meaningful. */
export function mapTraccarEvent(event: TraccarEvent): AlertRule | null {
  if (event.type === 'alarm') {
    const alarm = String(event.attributes?.['alarm'] ?? '');
    return ALARM_RULES[alarm] ?? null;
  }
  return EVENT_RULES[event.type] ?? null;
}

/** Stable key for one (type, vehicle, time-bucket) triple. */
export function dedupKey(
  type: AlertType,
  vehicleId: string,
  eventTime: Date,
  bucketMinutes: number,
): string {
  const bucketMs = bucketMinutes * 60_000;
  const bucketStart = Math.floor(eventTime.getTime() / bucketMs) * bucketMs;
  return `${type}:${vehicleId}:${bucketStart}`;
}

/** Bilingual titles for SMS/push copy (doc 03 §5); falls back to English. */
export const ALERT_TITLES: Record<AlertType, { en: string; sw: string }> = {
  power_cut: { en: '⚠ Power disconnected!', sw: '⚠ Umeme umekatwa!' },
  jamming: { en: 'Possible GPS jamming detected', sw: 'Huenda GPS inazuiliwa' },
  tamper: { en: 'Tampering detected', sw: 'Kifaa kinaguswa bila ruhusa' },
  sos: { en: 'SOS pressed', sw: 'SOS imebonyezwa' },
  low_battery: { en: 'Tracker battery low', sw: 'Betri ya kifaa iko chini' },
  overspeed: { en: 'Overspeed', sw: 'Mwendo kasi' },
  geofence_in: { en: 'Entered zone', sw: 'Imeingia eneo' },
  geofence_out: { en: 'Left zone', sw: 'Imetoka eneo' },
  ignition_on: { en: 'Engine ON', sw: 'Injini imewashwa' },
  ignition_off: { en: 'Engine OFF', sw: 'Injini imezimwa' },
  offline: { en: 'Tracker offline', sw: 'Kifaa hakipatikani' },
  restricted_hours: {
    en: 'Engine ON outside allowed hours',
    sw: 'Injini imewashwa nje ya saa zilizoruhusiwa',
  },
};
