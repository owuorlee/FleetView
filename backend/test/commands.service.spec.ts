import { describe, expect, it, vi } from 'vitest';
import { OtpStore } from '../src/auth/otp.store';
import { CommandsService } from '../src/commands/commands.service';
import { TraccarPosition } from '../src/traccar/traccar.client';

const USER = { id: 'u1', phone: '254712345678' };

function freshPosition(overrides: Partial<TraccarPosition> = {}): TraccarPosition {
  return {
    id: 1,
    deviceId: 42,
    latitude: -0.09,
    longitude: 34.76,
    speed: 0,
    course: 0,
    fixTime: new Date().toISOString(),
    attributes: {},
    ...overrides,
  };
}

function build(opts: { position?: TraccarPosition | null } = {}) {
  const prisma = {
    command: {
      create: vi.fn(async ({ data }: never) => ({ id: 'c1', createdAt: new Date(), ...(data as object) })),
      findUnique: vi.fn(),
      update: vi.fn(async ({ data }: never) => ({ id: 'c1', ...(data as object) })),
    },
    vehicle: { update: vi.fn(async () => ({})) },
    device: {
      findUniqueOrThrow: vi.fn(async () => ({
        id: 'd1',
        traccarDeviceId: 42,
        protocol: 'gt06',
        simCard: { msisdn: '254799000001' },
      })),
    },
  };
  const traccar = {
    enabled: true,
    latestPosition: vi.fn(async () => opts.position ?? null),
    sendCommand: vi.fn(async () => undefined),
  };
  const vehicles = {
    getOwned: vi.fn(async () => ({
      id: 'v1',
      regPlate: 'KDA 123A',
      device: { id: 'd1', traccarDeviceId: 42, relayFitted: true, protocol: 'gt06' },
    })),
  };
  const sms = { send: vi.fn(async () => undefined) };
  const otpStore = new OtpStore();
  const service = new CommandsService(
    prisma as never,
    traccar as never,
    vehicles as never,
    otpStore,
    sms,
  );
  return { service, prisma, traccar, vehicles, sms, otpStore };
}

describe('requestImmobilize', () => {
  it('blocks and audits when the vehicle is moving', async () => {
    const { service, prisma } = build({ position: freshPosition({ speed: 20 }) }); // ~37 km/h
    await expect(service.requestImmobilize(USER, 'v1', 'theft')).rejects.toMatchObject({
      response: expect.objectContaining({ message: 'blocked_safety', blockedReason: 'moving' }),
    });
    expect(prisma.command.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'blocked_safety' }) }),
    );
  });

  it('blocks when no position is available', async () => {
    const { service } = build({ position: null });
    await expect(service.requestImmobilize(USER, 'v1', 'theft')).rejects.toMatchObject({
      response: expect.objectContaining({ blockedReason: 'no_position' }),
    });
  });

  it('creates pending_confirmation and sends the OTP when stationary', async () => {
    const { service, sms } = build({ position: freshPosition() });
    const result = await service.requestImmobilize(USER, 'v1', 'theft suspected');
    expect(result.status).toBe('pending_confirmation');
    expect(sms.send).toHaveBeenCalledTimes(1);
    const [to, msg] = sms.send.mock.calls[0];
    expect(to).toBe(USER.phone); // OTP goes to the requesting user, not the tracker SIM
    expect(msg).toMatch(/ENGINE CUT/);
    expect(msg).toMatch(/\d{6}/);
  });
});

describe('confirmImmobilize', () => {
  function pendingCommand(createdAt = new Date()) {
    return {
      id: 'c1',
      initiatedById: 'u1',
      status: 'pending_confirmation',
      createdAt,
      vehicleId: 'v1',
      device: {
        id: 'd1',
        traccarDeviceId: 42,
        protocol: 'gt06',
        simCard: { msisdn: '254799000001' },
      },
      vehicle: { id: 'v1', regPlate: 'KDA 123A' },
    };
  }

  it('dispatches over GPRS when the device is online, and immobilizes the vehicle', async () => {
    const { service, prisma, traccar, otpStore } = build({ position: freshPosition() });
    prisma.command.findUnique.mockResolvedValue(pendingCommand());
    const code = otpStore.issue('cmd:c1');

    await service.confirmImmobilize(USER, 'c1', code);

    expect(traccar.sendCommand).toHaveBeenCalledWith(42, 'engineStop');
    expect(prisma.command.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'sent', channel: 'gprs', confirmedById: 'u1' }),
      }),
    );
    expect(prisma.vehicle.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'immobilized' } }),
    );
  });

  it('falls back to SMS RELAY,1# when the fix is safe but too old to be "online"', async () => {
    // 7 min old: passes the 10-min safety gate, fails the 5-min online test.
    const { service, prisma, traccar, sms, otpStore } = build({
      position: freshPosition({ fixTime: new Date(Date.now() - 7 * 60_000).toISOString() }),
    });
    prisma.command.findUnique.mockResolvedValue(pendingCommand());
    const code = otpStore.issue('cmd:c1');

    await service.confirmImmobilize(USER, 'c1', code);

    expect(traccar.sendCommand).not.toHaveBeenCalled();
    expect(sms.send).toHaveBeenCalledWith('254799000001', 'RELAY,1#');
    expect(prisma.command.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ channel: 'sms_fallback' }) }),
    );
  });

  it('rejects a wrong confirmation code', async () => {
    const { service, prisma, otpStore } = build({ position: freshPosition() });
    prisma.command.findUnique.mockResolvedValue(pendingCommand());
    otpStore.issue('cmd:c1');
    await expect(service.confirmImmobilize(USER, 'c1', '000000')).rejects.toThrow(
      'Wrong or expired confirmation code',
    );
  });

  it('expires a confirmation after the window', async () => {
    const { service, prisma, otpStore } = build({ position: freshPosition() });
    prisma.command.findUnique.mockResolvedValue(
      pendingCommand(new Date(Date.now() - 11 * 60_000)),
    );
    const code = otpStore.issue('cmd:c1');
    await expect(service.confirmImmobilize(USER, 'c1', code)).rejects.toThrow(
      'Confirmation window expired',
    );
    expect(prisma.command.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'expired' } }),
    );
  });

  it('re-blocks at confirm time if the vehicle started moving', async () => {
    const { service, prisma, otpStore, traccar } = build({
      position: freshPosition({ speed: 20 }),
    });
    prisma.command.findUnique.mockResolvedValue(pendingCommand());
    const code = otpStore.issue('cmd:c1');
    await expect(service.confirmImmobilize(USER, 'c1', code)).rejects.toMatchObject({
      response: expect.objectContaining({ blockedReason: 'moving' }),
    });
    expect(traccar.sendCommand).not.toHaveBeenCalled();
  });

  it('refuses confirmation by a different user', async () => {
    const { service, prisma } = build({ position: freshPosition() });
    prisma.command.findUnique.mockResolvedValue(pendingCommand());
    await expect(
      service.confirmImmobilize({ id: 'intruder' }, 'c1', '123456'),
    ).rejects.toThrow();
  });
});

describe('restore', () => {
  it('sends engineResume and reactivates the vehicle (single-step, audited)', async () => {
    const { service, prisma, traccar } = build({ position: freshPosition() });
    await service.restore(USER, 'v1', 'payment received');
    expect(traccar.sendCommand).toHaveBeenCalledWith(42, 'engineResume');
    expect(prisma.command.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'engine_restore', status: 'sent' }),
      }),
    );
    expect(prisma.vehicle.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'active' } }),
    );
  });
});
