import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SMS_PROVIDER, SmsProvider } from '../sms/sms.provider';
import { DarajaClient } from './daraja.client';
import { BillingService } from './billing.service';
import { eatDate, reminderStage, subscriptionTransition } from './billing-logic';

/**
 * Daily renewal machine (spec §7.2): reminders at T-7 / T-1 / expiry,
 * auto-STK on T-1 and expiry, and the active → grace → suspended transitions.
 * Runs 06:00 UTC = 09:00 EAT.
 */
@Injectable()
export class RenewalsScheduler {
  private readonly logger = new Logger('Renewals');

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly daraja: DarajaClient,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  @Cron('0 6 * * *')
  async run(now: Date = new Date()) {
    const today = eatDate(now);
    const subs = await this.prisma.subscription.findMany({
      where: { status: { in: ['active', 'grace'] } },
      include: { vehicle: { include: { owner: true } } },
    });

    for (const sub of subs) {
      try {
        await this.processSubscription(sub, today);
      } catch (err) {
        this.logger.error(`Subscription ${sub.id}: ${(err as Error).message}`);
      }
    }
    this.logger.log(`Renewal sweep done for ${subs.length} subscriptions`);
  }

  private async processSubscription(
    sub: {
      id: string;
      status: string;
      currentPeriodEnd: Date;
      renewalPriceKsh: number;
      autoStkEnabled: boolean;
      vehicle: {
        regPlate: string;
        owner: { id: string; phone: string; locale: string } | null;
      };
    },
    today: Date,
  ) {
    const owner = sub.vehicle.owner;

    // State transitions first.
    const transition = subscriptionTransition(sub.status, sub.currentPeriodEnd, today);
    if (transition === 'to_grace') {
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'grace' },
      });
      await this.prisma.invoice.updateMany({
        where: { subscriptionId: sub.id, status: 'pending' },
        data: { status: 'overdue' },
      });
    } else if (transition === 'to_suspended') {
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'suspended' },
      });
      if (owner) {
        await this.trySms(
          owner.phone,
          owner.locale === 'sw'
            ? `FleetView: huduma ya ${sub.vehicle.regPlate} imesimamishwa kwa kukosa malipo. Lipa ili kuendelea.`
            : `FleetView: tracking for ${sub.vehicle.regPlate} is suspended for non-payment. Pay to reactivate.`,
        );
      }
      return; // no reminders after suspension
    }

    // Renewal reminders.
    const stage = reminderStage(sub.currentPeriodEnd, today);
    if (!stage || !owner) return;

    const invoice = await this.billing.ensureRenewalInvoice(sub.id);
    const days = stage === 'T7' ? 7 : stage === 'T1' ? 1 : 0;
    const msg =
      owner.locale === 'sw'
        ? `FleetView: huduma ya ${sub.vehicle.regPlate} ${
            days ? `itaisha baada ya siku ${days}` : 'inaisha leo'
          }. Lipia KSh ${invoice.amountKsh}: PayBill ${this.daraja.shortcode ?? '——'}, Akaunti ${invoice.accountRef}.`
        : `FleetView: tracking for ${sub.vehicle.regPlate} ${
            days ? `expires in ${days} day${days > 1 ? 's' : ''}` : 'expires today'
          }. Renew KSh ${invoice.amountKsh}: PayBill ${this.daraja.shortcode ?? '——'}, Account ${invoice.accountRef}.`;
    await this.trySms(owner.phone, msg);

    // Auto-STK on T-1 and expiry (spec: evening push maximizes success; v1 fires with the sweep).
    if ((stage === 'T1' || stage === 'EXPIRY') && sub.autoStkEnabled && this.daraja.enabled) {
      try {
        await this.billing.initiateStk(owner.id, invoice.id);
      } catch (err) {
        this.logger.warn(`Auto-STK failed for invoice ${invoice.id}: ${(err as Error).message}`);
      }
    }
  }

  private async trySms(phone: string, message: string) {
    try {
      await this.sms.send(phone, message);
    } catch (err) {
      this.logger.error(`Reminder SMS to ${phone} failed: ${(err as Error).message}`);
    }
  }
}
