import { Module } from '@nestjs/common';
import { OrgsController } from './orgs.controller';
import { OrgsService } from './orgs.service';
import { OrgRoleGuard } from './org-role.guard';

@Module({
  controllers: [OrgsController],
  providers: [OrgsService, OrgRoleGuard],
  exports: [OrgsService, OrgRoleGuard],
})
export class OrgsModule {}
