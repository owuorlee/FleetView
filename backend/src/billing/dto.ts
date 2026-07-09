import { IsIn, IsUUID } from 'class-validator';
import { PLANS } from './billing-logic';

export class CreateSubscriptionDto {
  @IsUUID()
  vehicleId: string;

  @IsIn(Object.keys(PLANS))
  planCode: string;
}
