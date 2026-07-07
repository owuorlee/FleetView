import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CommandsService } from './commands.service';
import { ConfirmCommandDto, ImmobilizeDto, RestoreDto } from './dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class CommandsController {
  constructor(private readonly commands: CommandsService) {}

  @Post('vehicles/:id/commands/immobilize')
  immobilize(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') vehicleId: string,
    @Body() dto: ImmobilizeDto,
  ) {
    return this.commands.requestImmobilize(user, vehicleId, dto.reason);
  }

  @Post('commands/:id/confirm')
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') commandId: string,
    @Body() dto: ConfirmCommandDto,
  ) {
    return this.commands.confirmImmobilize(user, commandId, dto.code);
  }

  @Post('vehicles/:id/commands/restore')
  restore(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') vehicleId: string,
    @Body() dto: RestoreDto,
  ) {
    return this.commands.restore(user, vehicleId, dto.reason);
  }

  @Get('commands/:id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') commandId: string) {
    return this.commands.get(user, commandId);
  }
}
