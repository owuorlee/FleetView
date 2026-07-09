import { SetMetadata } from '@nestjs/common';
import { OrgRole } from '@prisma/client';

export const REQUIRE_ROLE_KEY = 'requireOrgRole';

/**
 * Decorator: the caller must be a member of the org named by the `:orgId` route
 * param, holding at least `role`. Enforced by OrgRoleGuard.
 */
export const RequireOrgRole = (role: OrgRole) => SetMetadata(REQUIRE_ROLE_KEY, role);
