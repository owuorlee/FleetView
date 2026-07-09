import { describe, expect, it, vi } from 'vitest';
import { FinancierService } from '../src/financier/financier.service';
import { TraccarPosition } from '../src/traccar/traccar.client';

function position(overrides: Partial<TraccarPosition> = {}): TraccarPosition {
  return {
    id: 1,
    deviceId: 42,
    latitude: -1.29,
    longitude: 36.82,
    speed: 0,
    course: 0,
    fixTime: new Date().toISOString(),
    attributes: {},
    ...overrides,
  };
}

function build(opts: { position?: TraccarPosition | null } = {}) {
  const prisma = {
    loan: {
      findMany: vi.fn(),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    command: {
      create: vi.fn(async () => ({ id: 'cmd1' })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    vehicle: { update: vi.fn(async () => ({})) },
    recoveryLink: { create: vi.fn(async ({ data }: never) => ({ ...(data as object) })) },
    $transaction: vi.fn(async (arr: Promise<unknown>[]) => Promise.all(arr)),
  };
  const traccar = {
    enabled: true,
    latestPosition: vi.fn(async () => opts.position ?? null),
    sendCommand: vi.fn(async () => undefined),
  };
  const sms = { send: vi.fn(async () => undefined) };
  const service = new FinancierService(prisma as never, traccar as never, sms as never);
  return { service, prisma, traccar, sms };
}

const withDevice = (over = {}) => ({
  id: 'l1',
  vehicleId: 'v1',
  externalRef: 'BC-1',
  daysInArrears: 21,
  vehicle: {
    id: 'v1',
    regPlate: 'KMFB 421C',
    status: 'active',
    device: { id: 'd1', traccarDeviceId: 42, relayFitted: true, protocol: 'gt06', simCard: { msisdn: '254700111222' } },
  },
  ...over,
});

describe('batchFlag', () => {
  it('creates pending_confirmation commands and never dispatches', async () => {
    const { service, prisma, traccar, sms } = build();
    prisma.loan.findMany.mockResolvedValue([withDevice()]);

    const res = await service.batchFlag('org1', 'ops1', ['l1']);

    expect(res.flagged).toEqual(['l1']);
    expect(prisma.command.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'engine_cut', status: 'pending_confirmation' }),
      }),
    );
    // Critical: flagging must not send any command.
    expect(traccar.sendCommand).not.toHaveBeenCalled();
    expect(sms.send).not.toHaveBeenCalled();
  });

  it('skips units with no device or no relay', async () => {
    const { service, prisma } = build();
    prisma.loan.findMany.mockResolvedValue([
      withDevice({ id: 'l1', vehicle: { id: 'v1', regPlate: 'A', status: 'active', device: null } }),
      withDevice({
        id: 'l2',
        vehicle: {
          id: 'v2',
          regPlate: 'B',
          status: 'active',
          device: { id: 'd2', traccarDeviceId: 43, relayFitted: false, protocol: 'gt06', simCard: null },
        },
      }),
    ]);

    const res = await service.batchFlag('org1', 'ops1', ['l1', 'l2']);
    expect(res.flagged).toEqual([]);
    expect(res.skipped).toEqual([
      { loanId: 'l1', reason: 'no_device' },
      { loanId: 'l2', reason: 'no_relay' },
    ]);
  });
});

describe('batchConfirm', () => {
  it('dispatches stationary units and marks them immobilized', async () => {
    const { service, prisma, traccar } = build({ position: position() });
    prisma.loan.findMany.mockResolvedValue([withDevice()]);

    const { results } = await service.batchConfirm('org1', 'ops1', ['l1'], 'default day 21');

    expect(traccar.sendCommand).toHaveBeenCalledWith(42, 'engineStop');
    expect(results).toEqual([{ loanId: 'l1', outcome: 'immobilized', channel: 'gprs' }]);
    expect(prisma.vehicle.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'immobilized' } }),
    );
  });

  it('blocks moving units and leaves them queued (no dispatch)', async () => {
    const { service, prisma, traccar, sms } = build({ position: position({ speed: 25 }) }); // ~46 km/h
    prisma.loan.findMany.mockResolvedValue([withDevice()]);

    const { results } = await service.batchConfirm('org1', 'ops1', ['l1'], 'default');

    expect(results).toEqual([{ loanId: 'l1', outcome: 'blocked_moving' }]);
    expect(traccar.sendCommand).not.toHaveBeenCalled();
    expect(sms.send).not.toHaveBeenCalled();
    expect(prisma.vehicle.update).not.toHaveBeenCalled();
  });

  it('uses SMS fallback for an offline unit that is safe by default', async () => {
    const { service, prisma, traccar, sms } = build({ position: null }); // offline
    prisma.loan.findMany.mockResolvedValue([withDevice()]);

    const { results } = await service.batchConfirm('org1', 'ops1', ['l1'], 'default');

    expect(traccar.sendCommand).not.toHaveBeenCalled();
    expect(sms.send).toHaveBeenCalledWith('254700111222', 'RELAY,1#');
    expect(results[0].outcome).toBe('immobilized');
    expect(results[0].channel).toBe('sms_fallback');
  });
});

describe('portfolio', () => {
  it('buckets arrears and counts immobilized', async () => {
    const { service, prisma } = build({ position: null });
    prisma.loan.findMany.mockResolvedValue([
      { daysInArrears: 0, repaymentStatus: 'current', vehicle: { status: 'active', device: null } },
      { daysInArrears: 5, repaymentStatus: 'arrears', vehicle: { status: 'active', device: null } },
      { daysInArrears: 20, repaymentStatus: 'arrears', vehicle: { status: 'active', device: null } },
      { daysInArrears: 40, repaymentStatus: 'default', vehicle: { status: 'immobilized', device: null } },
    ]);

    const p = await service.portfolio('org1');
    expect(p.totalUnits).toBe(4);
    expect(p.arrears).toEqual({ current: 1, arrears_1_7: 1, arrears_8_30: 1, arrears_30_plus: 1 });
    expect(p.immobilized).toBe(1);
  });
});
