import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { User } from 'src/common/decorators/user.decorator';
import { CreateSpendingPlanDto } from './dto/create-spending-plan.dto';
import { UpdateSpendingPlanDto } from './dto/update-spending-plan.dto';
import { SpendingPlanStatus } from './interfaces/spending-plan.enums';
import { SpendingPlansService } from './spending-plans.service';

@Controller('spending-plans')
@UseGuards(JwtAuthGuard)
export class SpendingPlansController {
  constructor(private readonly spendingPlansService: SpendingPlansService) {}

  @Get()
  findAll(
    @User('sub') userId: number,
    @Query('status') status?: SpendingPlanStatus,
  ) {
    return this.spendingPlansService.findAll(userId, { status });
  }

  @Get('active')
  findActive(@User('sub') userId: number) {
    return this.spendingPlansService.findActive(userId);
  }

  @Get('active/statistics')
  getStatistics(
    @User('sub') userId: number,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    const numericMonth =
      month && !isNaN(parseInt(month, 10)) ? parseInt(month, 10) : undefined;
    const numericYear =
      year && !isNaN(parseInt(year, 10)) ? parseInt(year, 10) : undefined;
    return this.spendingPlansService.getActiveStatistics(
      userId,
      numericMonth,
      numericYear,
    );
  }

  @Post()
  create(@User('sub') userId: number, @Body() dto: CreateSpendingPlanDto) {
    return this.spendingPlansService.create(userId, dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @User('sub') userId: number) {
    return this.spendingPlansService.findOne(id, userId);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @User('sub') userId: number,
    @Body() dto: UpdateSpendingPlanDto,
  ) {
    return this.spendingPlansService.update(id, userId, dto);
  }

  @Patch(':id/activate')
  activate(@Param('id', ParseIntPipe) id: number, @User('sub') userId: number) {
    return this.spendingPlansService.activate(id, userId);
  }

  @Patch(':id/pause')
  pause(@Param('id', ParseIntPipe) id: number, @User('sub') userId: number) {
    return this.spendingPlansService.pause(id, userId);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @User('sub') userId: number) {
    return this.spendingPlansService.remove(id, userId);
  }
}
