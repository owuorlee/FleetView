import { describe, expect, it } from 'vitest';
import { evaluateSafety } from '../src/commands/safety-gate';
import { TraccarPosition } from '../src/traccar/traccar.client';

const NOW = new Date('2026-07-08T09:00:00Z').getTime();

function position(overrides: Partial<TraccarPosition> = {}): TraccarPosition {
  return {
    id: 1,
    deviceId: 42,
    latitude: -0.0917,
    longitude: 34.768,
    speed: 0, // knots
    course: 0,
    fixTime: new Date(NOW - 60_000).toISOString(), // 1 min old
    attributes: {},
    ...overrides,
  };
}

describe('evaluateSafety', () => {
  it('blocks when there is no position at all', () => {
    expect(evaluateSafety(null, NOW)).toEqual({
      safe: false,
      reason: 'no_position',
      snapshot: null,
    });
  });

  it('blocks on a stale fix (> 10 min)', () => {
    const verdict = evaluateSafety(
      position({ fixTime: new Date(NOW - 11 * 60_000).toISOString() }),
      NOW,
    );
    expect(verdict.safe).toBe(false);
    expect(!verdict.safe && verdict.reason).toBe('stale_fix');
  });

  it('blocks a moving vehicle (> 10 km/h)', () => {
    // 20 knots ≈ 37 km/h
    const verdict = evaluateSafety(position({ speed: 20 }), NOW);
    expect(verdict.safe).toBe(false);
    expect(!verdict.safe && verdict.reason).toBe('moving');
    expect(verdict.snapshot?.speedKmh).toBeCloseTo(37, 0);
  });

  it('allows crawling below the threshold (≤ 10 km/h)', () => {
    // 5 knots ≈ 9.3 km/h
    expect(evaluateSafety(position({ speed: 5 }), NOW).safe).toBe(true);
  });

  it('allows a stationary vehicle with a fresh fix', () => {
    const verdict = evaluateSafety(position(), NOW);
    expect(verdict.safe).toBe(true);
    expect(verdict.snapshot.speedKmh).toBe(0);
  });

  it('blocks on unparseable fix time', () => {
    const verdict = evaluateSafety(position({ fixTime: 'garbage' }), NOW);
    expect(verdict.safe).toBe(false);
    expect(!verdict.safe && verdict.reason).toBe('stale_fix');
  });
});
