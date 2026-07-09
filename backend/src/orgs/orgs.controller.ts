import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgRoleGuard } from './org-role.guard';
import { RequireOrgRole } from './org-context';
import { OrgsService } from './orgs.service';
import { AddMemberDto, CreateOrgDto } from './dto';

@Controller('orgs')
@UseGuards(JwtAuthGuard, OrgRoleGuard)
export class OrgsController {
  constructor(private readonly orgs: OrgsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.orgs.listForUser(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOrgDto) {
    return this.orgs.create(user.id, dto.name, dto.type);
  }

  @Get(':orgId/members')
  @RequireOrgRole('viewer')
  members(@Param('orgId') orgId: string) {
    return this.orgs.listMembers(orgId);
  }

  @Post(':orgId/members')
  @RequireOrgRole('admin')
  addMember(@Param('orgId') orgId: string, @Body() dto: AddMemberDto) {
    return this.orgs.addMember(orgId, dto.phone, dto.role);
  }
}
