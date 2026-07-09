import { ConflictException } from '@nestjs/common';
import { DeviceProtocol } from '@prisma/client';
import { TraccarPosition } from '../traccar/traccar.client';

/** Fix younger than this ⇒ device considered online ⇒ command goes over GPRS, else SMS fallback. */
export const ONLINE_FIX_MAX_AGE_MIN = 5;

// Provider-specific SMS command strings (doc 02 §8; Teltonika needs the two-space
// empty-credentials prefix).
export const SMS_COMMANDS: Record<DeviceProtocol, { cut: string; restore: string }> = {
  gt06: { cut: 'RELAY,1#', restore: 'RELAY,0#' },
  teltonika: { cut: '  setdigout 1', restore: '  setdigout 0' },
};

export type DispatchAction = 'cut' | 'restore';
export type DispatchChannel = 'gprs' | 'sms_fallback';

export interface DispatchDeps {
  traccar: {
    enabled: boolean;
    sendCommand(traccarDeviceId: number, type: 'engineStop' | 'engineResume'): Promise<void>;
  };
  sms: { send(to: string, message: string): Promise<void> };
}

export interface DispatchDevice {
  traccarDeviceId: number | null;
  protocol: DeviceProtocol;
  simCard: { msisdn: string } | null;
}

/**
 * Deliver a relay command: GPRS on the live socket if the device is online
 * (fresh fix), otherwise the protocol-specific SMS to the tracker SIM.
 * Shared by CommandsService (owner-initiated) and FinancierService (batch).
 */
export async function dispatchCommand(
  deps: DispatchDeps,
  device: DispatchDevice,
  action: DispatchAction,
  position: TraccarPosition | null,
): Promise<DispatchChannel> {
  const fixAgeMin = position
    ? (Date.now() - new Date(position.fixTime).getTime()) / 60_000
    : Infinity;
  const online = device.traccarDeviceId !== null && fixAgeMin <= ONLINE_FIX_MAX_AGE_MIN;

  if (online && deps.traccar.enabled) {
    await deps.traccar.sendCommand(
      device.traccarDeviceId!,
      action === 'cut' ? 'engineStop' : 'engineResume',
    );
    return 'gprs';
  }

  if (!device.simCard) {
    throw new ConflictException('Device offline and no SIM registered for SMS fallback');
  }
  await deps.sms.send(device.simCard.msisdn, SMS_COMMANDS[device.protocol][action]);
  return 'sms_fallback';
}
