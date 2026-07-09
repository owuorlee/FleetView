import { IsEnum, IsIn, IsNotEmpty, IsString, Length } from 'class-validator';
import { OrgRole, OrgType } from '@prisma/client';

const ORG_TYPES: OrgType[] = ['personal', 'fleet', 'sacco', 'financier', 'insurer'];
const ASSIGNABLE_ROLES: OrgRole[] = [
  'admin',
  'manager',
  'viewer',
  'installer',
  'recovery_agent',
  'financier_ops',
];

export class CreateOrgDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 120)
  name: string;

  @IsIn(ORG_TYPES)
  type: OrgType;
}

export class AddMemberDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsEnum(OrgRole)
  @IsIn(ASSIGNABLE_ROLES)
  role: OrgRole;
}
