import { IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';

export class RequestOtpDto {
  @IsString()
  @IsNotEmpty()
  phone: string;
}

export class VerifyOtpDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code: string;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  fullName?: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
