import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgRoleGuard } from '../orgs/org-role.guard';
import { RequireOrgRole } from '../orgs/org-context';
import { FinancierService } from './financier.service';
import {
  BatchConfirmDto,
  BatchFlagDto,
  ImportRepaymentsDto,
  LinkLoanDto,
  RecoveryLinkDto,
} from './dto';

/** Financier ops console. All routes scoped to an org; financier_ops or higher. */
@Controller('orgs/:orgId/financier')
@UseGuards(JwtAuthGuard, OrgRoleGuard)
@RequireOrgRole('financier_ops')
export class FinancierController {
  constructor(private readonly financier: FinancierService) {}

  @Get('portfolio')
  portfolio(@Param('orgId') orgId: string) {
    return this.financier.portfolio(orgId);
  }

  @Get('defaulters')
  defaulters(@Param('orgId') orgId: string, @Query('thresholdDays') thresholdDays?: string) {
    return this.financier.defaulters(
      orgId,
      thresholdDays ? Number(thresholdDays) : undefined,
    );
  }

  @Post('loans')
  linkLoan(@Param('orgId') orgId: string, @Body() dto: LinkLoanDto) {
    return this.financier.linkLoan(orgId, dto);
  }

  @Post('loans/import')
  importRepayments(@Param('orgId') orgId: string, @Body() dto: ImportRepaymentsDto) {
    return this.financier.importRepayments(orgId, dto.rows);
  }

  @Post('batch/flag')
  batchFlag(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BatchFlagDto,
  ) {
    return this.financier.batchFlag(orgId, user.id, dto.loanIds);
  }

  @Post('batch/confirm')
  batchConfirm(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BatchConfirmDto,
  ) {
    return this.financier.batchConfirm(orgId, user.id, dto.loanIds, dto.reason);
  }

  @Post('recovery-link')
  recoveryLink(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RecoveryLinkDto,
  ) {
    return this.financier.createRecoveryLink(orgId, user.id, dto.vehicleId);
  }
}

/** Public recovery view — no auth; the unguessable token is the credential. */
@Controller('recovery')
export class RecoveryController {
  constructor(private readonly financier: FinancierService) {}

  @Get(':token')
  resolve(@Param('token') token: string) {
    return this.financier.resolveRecoveryLink(token);
  }
}
