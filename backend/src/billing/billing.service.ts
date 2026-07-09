import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SMS_PROVIDER, SmsProvider } from '../sms/sms.provider';
import { DarajaClient } from './daraja.client';
import { makeAccountRef, matchC2bPayment, PLANS } from './billing-logic';

interface StkCallbackBody {
  Body?: {
    stkCallback?: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: { Item: { Name: string; Value?: string | number }[] };
    };
  };
}

interface C2bConfirmationBody {
  TransID: string;
  TransTime: string;
  TransAmount: string;
  BillRefNumber: string;
  MSISDN: string;
  BusinessShortCode: string;
  [key: string]: unknown;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger('Billing');

  constructor(
    private readonly prisma: PrismaService,
    private readonly daraja: DarajaClient,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  listSubscriptions(userId: string) {
    return this.prisma.subscription.findMany({
      where: { vehicle: { ownerUserId: userId } },
      include: {
        vehicle: { select: { regPlate: true } },
        invoices: { where: { status: { in: ['pending', 'overdue'] } } },
      },
    });
  }

  /** First year is included in the install price: period starts now, ends in 365 days. */
  async createSubscription(userId: string, vehicleId: string, planCode: string) {
    const plan = PLANS[planCode];
    if (!plan) throw new ConflictException(`Unknown plan: ${planCode}`);
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    if (vehicle.ownerUserId !== userId) throw new ForbiddenException();

    const existing = await this.prisma.subscription.findFirst({
      where: { vehicleId, status: { not: 'cancelled' } },
    });
    if (existing) throw new ConflictException('Vehicle already has a subscription');

    const now = new Date();
    return this.prisma.subscription.create({
      data: {
        vehicleId,
        planCode,
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 365 * 86_400_000),
        renewalPriceKsh: plan.renewalPriceKsh,
      },
    });
  }

  /** Idempotently ensure the renewal invoice for the current period end exists. */
  async ensureRenewalInvoice(subscriptionId: string) {
    const sub = await this.prisma.subscription.findUniqueOrThrow({
      where: { id: subscriptionId },
      include: { vehicle: true, invoices: { where: { status: { in: ['pending', 'overdue'] } } } },
    });
    if (sub.invoices.length > 0) return sub.invoices[0];

    for (let attempt = 0; attempt < 3; attempt++) {
      const salt = attempt === 0 ? '' : Math.random().toString(36).slice(2, 4).toUpperCase();
      try {
        return await this.prisma.invoice.create({
          data: {
            subscriptionId,
            accountRef: makeAccountRef(sub.vehicle.regPlate, sub.currentPeriodEnd, salt),
            amountKsh: sub.renewalPriceKsh,
            dueDate: sub.currentPeriodEnd,
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue;
        throw err;
      }
    }
    throw new ConflictException('Could not allocate a unique account reference');
  }

  /** Fire an STK Push for an invoice to the owner's phone. */
  async initiateStk(userId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { subscription: { include: { vehicle: { include: { owner: true } } } } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    const owner = invoice.subscription.vehicle.owner;
    if (!owner || owner.id !== userId) throw new ForbiddenException();
    if (invoice.status === 'paid') throw new ConflictException('Invoice already paid');

    const result = await this.daraja.stkPush({
      amountKsh: invoice.amountKsh,
      payerPhone: owner.phone,
      accountRef: invoice.accountRef,
      description: 'FleetView',
    });

    await this.prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        method: 'stk_push',
        payerPhone: owner.phone,
        amountKsh: invoice.amountKsh,
        status: 'pending',
        checkoutRequestId: result.checkoutRequestId,
      },
    });
    return { checkoutRequestId: result.checkoutRequestId, message: 'Check your phone' };
  }

  /** Daraja STK result callback. Must return quickly (spec §11: ≤5 s ack). */
  async handleStkCallback(body: StkCallbackBody) {
    const cb = body.Body?.stkCallback;
    if (!cb?.CheckoutRequestID) return { ok: true }; // malformed — ack and move on

    const payment = await this.prisma.payment.findUnique({
      where: { checkoutRequestId: cb.CheckoutRequestID },
    });
    if (!payment || payment.status !== 'pending') return { ok: true }; // unknown or already settled (dedup)

    if (cb.ResultCode !== 0) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'failed', rawCallback: cb as unknown as Prisma.InputJsonValue },
      });
      return { ok: true };
    }

    const items = cb.CallbackMetadata?.Item ?? [];
    const meta = Object.fromEntries(items.map((i) => [i.Name, i.Value]));
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'confirmed',
        mpesaReceipt: String(meta['MpesaReceiptNumber'] ?? ''),
        mpesaTime: new Date(),
        matchedBy: 'account_ref',
        rawCallback: cb as unknown as Prisma.InputJsonValue,
      },
    });
    if (payment.invoiceId) await this.applyPayment(payment.invoiceId);
    return { ok: true };
  }

  /** C2B PayBill confirmation: store immutably, dedup by TransID, auto-match (spec §7.3). */
  async handleC2bConfirmation(body: C2bConfirmationBody) {
    if (!body?.TransID) return { ResultCode: 0, ResultDesc: 'Accepted' };

    const amountKsh = Math.round(Number(body.TransAmount));
    let payment;
    try {
      payment = await this.prisma.payment.create({
        data: {
          method: 'c2b_paybill',
          mpesaReceipt: body.TransID,
          payerPhone: String(body.MSISDN),
          amountKsh,
          status: 'unmatched',
          rawCallback: body as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return { ResultCode: 0, ResultDesc: 'Duplicate' }; // replayed callback
      }
      throw err;
    }

    const open = await this.prisma.invoice.findMany({
      where: { status: { in: ['pending', 'overdue'] } },
      include: { subscription: { include: { vehicle: { include: { owner: true } } } } },
    });
    const match = matchC2bPayment(
      { billRef: body.BillRefNumber ?? '', amountKsh, payerPhone: String(body.MSISDN) },
      open.map((i) => ({
        id: i.id,
        accountRef: i.accountRef,
        amountKsh: i.amountKsh,
        vehiclePlate: i.subscription.vehicle.regPlate,
        payerPhones: i.subscription.vehicle.owner ? [i.subscription.vehicle.owner.phone] : [],
      })),
    );

    if (match.matched) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { invoiceId: match.invoiceId, status: 'confirmed', matchedBy: match.matchedBy },
      });
      await this.applyPayment(match.invoiceId);
    } else {
      this.logger.warn(`Unmatched C2B payment ${body.TransID} ref="${body.BillRefNumber}"`);
    }
    return { ResultCode: 0, ResultDesc: 'Accepted' };
  }

  /** Mark invoice paid, extend the period by a year, reactivate, SMS the receipt. */
  private async applyPayment(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: {
        subscription: { include: { vehicle: { include: { owner: true } } } },
        payments: { where: { status: 'confirmed' }, take: 1 },
      },
    });
    if (invoice.status === 'paid') return;

    const sub = invoice.subscription;
    const base = sub.currentPeriodEnd > new Date() ? sub.currentPeriodEnd : new Date();
    const newEnd = new Date(base.getTime() + 365 * 86_400_000);

    await this.prisma.$transaction([
      this.prisma.invoice.update({ where: { id: invoiceId }, data: { status: 'paid' } }),
      this.prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'active', currentPeriodEnd: newEnd },
      }),
    ]);

    const owner = sub.vehicle.owner;
    const receipt = invoice.payments[0]?.mpesaReceipt ?? '';
    if (owner) {
      const date = newEnd.toISOString().slice(0, 10);
      const msg =
        owner.locale === 'sw'
          ? `Malipo yamepokelewa: KSh ${invoice.amountKsh}, kumb. ${receipt}. ${sub.vehicle.regPlate} halali hadi ${date}. Asante!`
          : `Payment received: KSh ${invoice.amountKsh}, ref ${receipt}. ${sub.vehicle.regPlate} valid till ${date}. Asante!`;
      await this.sms.send(owner.phone, msg).catch((err) => {
        this.logger.error(`Receipt SMS failed: ${err.message}`);
      });
    }
  }
}
