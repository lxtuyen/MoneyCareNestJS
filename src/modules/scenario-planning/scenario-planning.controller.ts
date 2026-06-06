import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { User } from 'src/common/decorators/user.decorator';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { SimulateScenarioDto } from './dto/simulate-scenario.dto';
import { ScenarioPlanningService } from './scenario-planning.service';

@Controller('scenario-planning')
@UseGuards(JwtAuthGuard)
export class ScenarioPlanningController {
  constructor(
    private readonly scenarioPlanningService: ScenarioPlanningService,
  ) {}

  @Post('simulate')
  simulate(@User('sub') userId: number, @Body() dto: SimulateScenarioDto) {
    return this.scenarioPlanningService.simulate(userId, dto);
  }

  @Get('templates')
  getTemplates() {
    return this.scenarioPlanningService.getTemplates();
  }

  @Get('history')
  getHistory(@User('sub') userId: number) {
    return this.scenarioPlanningService.getHistory(userId);
  }
}
