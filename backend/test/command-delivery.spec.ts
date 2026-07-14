import { describe, expect, it, vi } from 'vitest';
import {
  expectedRelayState,
  relayStateFromAttributes,
} from '../src/commands/command-delivery';
import { CommandsService } from '../src/commands/commands.service';

describe('relayStateFromAttributes', () => {
  it('reads Traccar blocked boolean (GT06 engine cut)', () => {
    expect(relayStateFromAttributes({ blocked: true })).toBe('cut');
    expect(relayStateFromAttributes({ blocked: false })).toBe('restored');
  });

  it('reads Teltonika out1 boolean', () => {
    expect(relayStateFromAttributes({ out1: true })).toBe('cut');
    expect(relayStateFromAttributes({ out1: false })).toBe('restored');
  });

  it('reads an output bitmask (bit0 = out1)', () => {
    expect(relayStateFromAttributes({ output: 1 })).toBe('cut');
    expect(relayStateFromAttributes({ output: 0 })).toBe('restored');
    expect(relayStateFromAttributes({ output: 2 })).toBe('restored'); // bit0 clear
  });

  it('returns null when no relay info present', () => {
    expect(relayStateFromAttributes({ speed: 10, ignition: true })).toBeNull();
    expect(relayStateFromAttributes(undefined)).toBeNull();
  });

  it('prefers blocked over other signals', () => {
    expect(relayStateFromAttributes({ blocked: true, out1: false })).toBe('cut');
  });
});

describe('expectedRelayState', () => {
  it('maps command types to the confirming state', () => {
    expect(expectedRelayState('engine_cut')).toBe('cut');
    expect(expectedRelayState('engine_restore')).toBe('restored');
    expect(expectedRelayState('reboot')).toBeNull();
  });
});

describe('CommandsService.confirmDeliveryFromPosition', () => {
  function build(command: unknown) {
    const prisma = {
      device: { findUnique: vi.fn(async () => ({ id: 'd1', traccarDeviceId: 42 })) },
      command: {
        findFirst: vi.fn(async () => command),
        update: vi.fn(async ({ data }: never) => ({ id: 'c1', ...(data as object) })),
      },
    };
    const service = new CommandsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, prisma };
  }

  it('marks a matching sent engine_cut as delivered when blocked=true', async () => {
    const { service, prisma } = build({ id: 'c1', type: 'engine_cut', status: 'sent' });
    const res = await service.confirmDeliveryFromPosition(42, { blocked: true });
    expect(res).toMatchObject({ status: 'delivered', deliveredAt: expect.any(Date) });
    expect(prisma.command.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deviceId: 'd1', type: 'engine_cut', status: 'sent' }),
      }),
    );
  });

  it('does nothing when the position has no relay info', async () => {
    const { service, prisma } = build(null);
    const res = await service.confirmDeliveryFromPosition(42, { speed: 5 });
    expect(res).toBeNull();
    expect(prisma.command.findFirst).not.toHaveBeenCalled();
  });

  it('does nothing when no matching sent command exists', async () => {
    const { service, prisma } = build(null);
    const res = await service.confirmDeliveryFromPosition(42, { blocked: true });
    expect(res).toBeNull();
    expect(prisma.command.update).not.toHaveBeenCalled();
  });

  it('confirms a restore when blocked=false', async () => {
    const { service } = build({ id: 'c2', type: 'engine_restore', status: 'sent' });
    const res = await service.confirmDeliveryFromPosition(42, { blocked: false });
    expect(res).toMatchObject({ status: 'delivered' });
  });
});
