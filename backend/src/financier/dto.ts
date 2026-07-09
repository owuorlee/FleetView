import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { RepaymentStatus } from '@prisma/client';

export class LinkLoanDto {
  @IsUUID()
  vehicleId: string;

  @IsString()
  @IsNotEmpty()
  borrowerPhone: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 64)
  externalRef: string;
}

export class RepaymentRowDto {
  @IsString()
  @IsNotEmpty()
  externalRef: string;

  @IsEnum(RepaymentStatus)
  repaymentStatus: RepaymentStatus;

  @IsInt()
  @Min(0)
  daysInArrears: number;

  @IsOptional()
  @IsISO8601()
  nextDueDate?: string;
}

export class ImportRepaymentsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => RepaymentRowDto)
  rows: RepaymentRowDto[];
}

export class BatchFlagDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @IsUUID('4', { each: true })
  loanIds: string[];
}

export class BatchConfirmDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @IsUUID('4', { each: true })
  loanIds: string[];

  @IsString()
  @IsNotEmpty()
  @Length(3, 200)
  reason: string;
}

export class RecoveryLinkDto {
  @IsUUID()
  vehicleId: string;
}
