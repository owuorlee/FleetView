import { IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';

export class ImmobilizeDto {
  @IsString()
  @IsNotEmpty()
  @Length(3, 200)
  reason: string;
}

export class ConfirmCommandDto {
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code: string;
}

export class RestoreDto {
  @IsOptional()
  @IsString()
  @Length(3, 200)
  reason?: string;
}
