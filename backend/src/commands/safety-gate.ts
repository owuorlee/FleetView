import { TraccarClient, TraccarPosition } from '../traccar/traccar.client';

// Spec §5: block engine cut unless the vehicle is stationary with a fresh fix.
export const SAFETY_MAX_SPEED_KMH = 10;
export const SAFETY_MAX_FIX_AGE_MIN = 10;

export type PositionSnapshot = {
  latitude: number;
  longitude: number;
  speedKmh: number;
  fixTime: string;
};

export type SafetyVerdict =
  | { safe: true; snapshot: PositionSnapshot }
  | { safe: false; reason: 'no_position' | 'stale_fix' | 'moving'; snapshot: PositionSnapshot | null };

export function evaluateSafety(
  position: TraccarPosition | null,
  now: number = Date.now(),
): SafetyVerdict {
  if (!position) return { safe: false, reason: 'no_position', snapshot: null };

  const snapshot: PositionSnapshot = {
    latitude: position.latitude,
    longitude: position.longitude,
    speedKmh: TraccarClient.speedKmh(position),
    fixTime: position.fixTime,
  };

  const fixAgeMin = (now - new Date(position.fixTime).getTime()) / 60_000;
  if (!Number.isFinite(fixAgeMin) || fixAgeMin > SAFETY_MAX_FIX_AGE_MIN) {
    return { safe: false, reason: 'stale_fix', snapshot };
  }
  if (snapshot.speedKmh > SAFETY_MAX_SPEED_KMH) {
    return { safe: false, reason: 'moving', snapshot };
  }
  return { safe: true, snapshot };
}
