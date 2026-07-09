import { describe, expect, it } from 'vitest';
import { satisfiesRole } from '../src/orgs/roles';

describe('satisfiesRole', () => {
  it('grants when actual rank meets or exceeds required', () => {
    expect(satisfiesRole('owner', 'admin')).toBe(true);
    expect(satisfiesRole('admin', 'manager')).toBe(true);
    expect(satisfiesRole('manager', 'viewer')).toBe(true);
    expect(satisfiesRole('financier_ops', 'viewer')).toBe(true);
  });

  it('denies when actual rank is below required', () => {
    expect(satisfiesRole('viewer', 'manager')).toBe(false);
    expect(satisfiesRole('manager', 'admin')).toBe(false);
    expect(satisfiesRole('viewer', 'financier_ops')).toBe(false);
  });

  it('treats installer/recovery_agent as lateral roles', () => {
    // A manager is NOT automatically an installer...
    expect(satisfiesRole('manager', 'installer')).toBe(false);
    // ...but an admin/owner override can act in lateral roles.
    expect(satisfiesRole('admin', 'installer')).toBe(true);
    expect(satisfiesRole('owner', 'recovery_agent')).toBe(true);
    // An installer satisfies only its own requirement.
    expect(satisfiesRole('installer', 'installer')).toBe(true);
    expect(satisfiesRole('installer', 'viewer')).toBe(false);
    expect(satisfiesRole('installer', 'recovery_agent')).toBe(false);
  });

  it('financier_ops does not reach manager/admin powers', () => {
    expect(satisfiesRole('financier_ops', 'manager')).toBe(false);
    expect(satisfiesRole('financier_ops', 'admin')).toBe(false);
  });
});
