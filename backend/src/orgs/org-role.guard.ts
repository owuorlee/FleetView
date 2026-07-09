import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrgRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/jwt-auth.guard';
import { REQUIRE_ROLE_KEY } from './org-context';
import { satisfiesRole } from './roles';

/**
 * Runs after JwtAuthGuard. Reads the required role from @RequireOrgRole and the
 * org id from the `:orgId` route param, then checks the caller's membership.
 * Attaches the membership role to req.orgRole for downstream use.
 */
@Injectable()
export class OrgRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<OrgRole>(REQUIRE_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true; // no role requirement on this route

    const req = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = req.user;
    const orgId: string | undefined = req.params?.orgId;
    if (!user || !orgId) throw new ForbiddenException('Missing user or organization context');

    const membership = await this.prisma.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId: user.id } },
    });
    if (!membership || !satisfiesRole(membership.role, required)) {
      throw new ForbiddenException('Insufficient role for this organization');
    }
    req.orgRole = membership.role;
    return true;
  }
}
