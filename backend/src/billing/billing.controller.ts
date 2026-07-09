import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BillingService } from './billing.service';
import { DarajaClient } from './daraja.client';
import { CreateSubscriptionDto } from './dto';

@Controller('billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('subscriptions')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.billing.listSubscriptions(user.id);
  }

  @Post('subscriptions')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSubscriptionDto) {
    return this.billing.createSubscription(user.id, dto.vehicleId, dto.planCode);
  }

  @Post('invoices/:id/stk')
  stk(@CurrentUser() user: AuthenticatedUser, @Param('id') invoiceId: string) {
    return this.billing.initiateStk(user.id, invoiceId);
  }
}

/**
 * Public Daraja callbacks. Daraja doesn't sign callbacks, so the URL carries an
 * unguessable secret path segment (spec §14.9); wrong secret → 404, no hints.
 */
@Controller('webhooks/daraja')
export class DarajaWebhookController {
  constructor(
    private readonly billing: BillingService,
    private readonly daraja: DarajaClient,
  ) {}

  private assertSecret(secret: string) {
    if (!this.daraja.webhookSecret || secret !== this.daraja.webhookSecret) {
      throw new NotFoundException();
    }
  }

  @Post(':secret/stk')
  @HttpCode(200)
  stk(@Param('secret') secret: string, @Body() body: unknown) {
    this.assertSecret(secret);
    return this.billing.handleStkCallback(body as never);
  }

  @Post(':secret/c2b')
  @HttpCode(200)
  c2b(@Param('secret') secret: string, @Body() body: unknown) {
    this.assertSecret(secret);
    return this.billing.handleC2bConfirmation(body as never);
  }

  /** C2B validation hook — accept everything; reconciliation happens on confirmation. */
  @Post(':secret/c2b-validate')
  @HttpCode(200)
  validate(@Param('secret') secret: string) {
    this.assertSecret(secret);
    return { ResultCode: 0, ResultDesc: 'Accepted' };
  }
}
