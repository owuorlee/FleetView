import { OrgRole } from '@prisma/client';

/**
 * Role hierarchy for RBAC (spec §2.2). Higher number = more authority.
 * A guard requiring role X is satisfied by any role with rank >= rank(X),
 * except for functional roles (installer, recovery_agent) which are lateral
 * and only satisfy their own requirement.
 */
const RANK: Record<OrgRole, number> = {
  viewer: 10,
  installer: 15,
  recovery_agent: 15,
  financier_ops: 20,
  manager: 30,
  admin: 40,
  owner: 50,
};

const LATERAL: OrgRole[] = ['installer', 'recovery_agent'];

export function satisfiesRole(actual: OrgRole, required: OrgRole): boolean {
  if (LATERAL.includes(required)) return actual === required || RANK[actual] >= RANK.admin;
  if (LATERAL.includes(actual)) return actual === required;
  return RANK[actual] >= RANK[required];
}
