import { CommandType } from '@prisma/client';

/** Only match a 'sent' command against device feedback for this long after dispatch. */
export const DELIVERY_CONFIRM_WINDOW_MIN = 30;

export type RelayState = 'cut' | 'restored';

/**
 * Interpret Traccar position attributes into the device's relay/output state.
 * Traccar computes `blocked` for many protocols (GT06 engine cut); Teltonika
 * reports the digital output as `out1` (boolean) or in an `output` bitmask.
 * Returns null when the position carries no relay information.
 */
export function relayStateFromAttributes(attrs: Record<string, unknown> | undefined): RelayState | null {
  if (!attrs) return null;
  if (typeof attrs.blocked === 'boolean') return attrs.blocked ? 'cut' : 'restored';
  if (typeof attrs.out1 === 'boolean') return attrs.out1 ? 'cut' : 'restored';
  if (typeof attrs.output === 'number') return (attrs.output & 1) === 1 ? 'cut' : 'restored';
  return null;
}

/** The relay state that confirms a given command type was actually carried out. */
export function expectedRelayState(type: CommandType): RelayState | null {
  if (type === 'engine_cut') return 'cut';
  if (type === 'engine_restore') return 'restored';
  return null;
}
