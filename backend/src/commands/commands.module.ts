import { Module } from '@nestjs/common';
import { SmsModule } from '../sms/sms.module';
import { TraccarModule } from '../traccar/traccar.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { CommandsController } from './commands.controller';
import { CommandsService } from './commands.service';
import { CommandDeliveryWorker } from './command-delivery.worker';

@Module({
  imports: [TraccarModule, SmsModule, VehiclesModule],
  controllers: [CommandsController],
  providers: [CommandsService, CommandDeliveryWorker],
})
export class CommandsModule {}
