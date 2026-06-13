import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { User } from 'src/common/decorators/user.decorator';
import { CoupleBudgetsService } from './couple-budgets.service';
import { SetCoupleBudgetDto } from './dto/couple-budget.dto';

@Controller('couples/budgets')
@UseGuards(JwtAuthGuard)
export class CoupleBudgetsController {
  constructor(private readonly budgetsService: CoupleBudgetsService) {}

  @Post()
  async setBudget(
    @User('sub') userId: number,
    @Body() dto: SetCoupleBudgetDto,
  ) {
    return this.budgetsService.setBudget(userId, dto);
  }

  @Get()
  async findAll(
    @User('sub') userId: number,
    @Query('coupleId', ParseIntPipe) coupleId: number,
    @Query('month') month: string,
  ) {
    return this.budgetsService.findAll(userId, coupleId, month);
  }

  @Delete(':id')
  async deleteBudget(
    @User('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.budgetsService.deleteBudget(userId, id);
  }
}
