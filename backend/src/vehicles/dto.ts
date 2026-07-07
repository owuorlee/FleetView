import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export enum VehicleTypeDto {
  car = 'car',
  motorbike = 'motorbike',
  tuktuk = 'tuktuk',
  truck = 'truck',
}

export enum DeviceProtocolDto {
  gt06 = 'gt06',
  teltonika = 'teltonika',
}

export class CreateVehicleDto {
  @IsString()
  @IsNotEmpty()
  regPlate: string;

  @IsEnum(VehicleTypeDto)
  type: VehicleTypeDto;

  @IsOptional()
  @IsString()
  makeModel?: string;

  @Matches(/^\d{15}$/, { message: 'imei must be 15 digits' })
  imei: string;

  @IsString()
  @IsNotEmpty()
  deviceModel: string; // GT06N | FMB920 | FMC130 | FMT100 ...

  @IsEnum(DeviceProtocolDto)
  protocol: DeviceProtocolDto;
}
