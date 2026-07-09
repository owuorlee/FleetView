import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrgRole, OrgType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone } from '../common/phone';

@Injectable()
export class OrgsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Create an org and make the creating user its owner in one transaction. */
  async create(userId: string, name: string, type: OrgType) {
    return this.prisma.organization.create({
      data: {
        name,
        type,
        members: { create: { userId, role: 'owner' } },
      },
      include: { members: true },
    });
  }

  listForUser(userId: string) {
    return this.prisma.organization.findMany({
      where: { members: { some: { userId } } },
      include: { _count: { select: { members: true, vehicles: true } } },
    });
  }

  /** Add (or re-role) a member by phone. Idempotent on the (org,user) pair. */
  async addMember(orgId: string, rawPhone: string, role: OrgRole) {
    const phone = normalizePhone(rawPhone);
    // The invitee must already have an account (they onboard via OTP first).
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) {
      throw new NotFoundException('No FleetView account for that phone — ask them to sign up first');
    }
    if (role === 'owner') throw new ConflictException('Use transfer-ownership, not add-member, for owner');

    return this.prisma.orgMember.upsert({
      where: { orgId_userId: { orgId, userId: user.id } },
      create: { orgId, userId: user.id, role },
      update: { role },
    });
  }

  listMembers(orgId: string) {
    return this.prisma.orgMember.findMany({
      where: { orgId },
      include: { user: { select: { id: true, phone: true, fullName: true } } },
    });
  }
}
