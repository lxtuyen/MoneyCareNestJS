import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { CoupleSavingsService } from './couple-savings.service';
import {
  CreateCoupleSavingGoalDto,
  AddContributionDto,
  UpdateCoupleSavingGoalDto,
} from './dto/saving-goal.dto';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { User } from 'src/common/decorators/user.decorator';

@Controller('couples/savings')
@UseGuards(JwtAuthGuard)
export class CoupleSavingsController {
  constructor(private readonly coupleSavingsService: CoupleSavingsService) {}

  @Post()
  async create(
    @User('sub') userId: number,
    @Body() dto: CreateCoupleSavingGoalDto,
  ) {
    return this.coupleSavingsService.create(dto, userId);
  }

  @Get()
  async findAll(
    @User('sub') userId: number,
    @Query('coupleId', ParseIntPipe) coupleId: number,
  ) {
    return this.coupleSavingsService.findAll(coupleId, userId);
  }

  @Get(':id')
  async findOne(
    @User('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.coupleSavingsService.findOne(id, userId);
  }

  @Post(':id/contribute')
  async contribute(
    @User('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddContributionDto,
  ) {
    return this.coupleSavingsService.contribute(id, dto, userId);
  }

  @Patch(':id')
  async update(
    @User('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCoupleSavingGoalDto,
  ) {
    return this.coupleSavingsService.update(id, dto, userId);
  }

  @Delete(':id')
  async remove(
    @User('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.coupleSavingsService.remove(id, userId);
  }

  @Patch(':id/activate')
  async activate(
    @User('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.coupleSavingsService.activateGoal(id, userId);
  }

  @Patch(':id/pause')
  async pause(
    @User('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.coupleSavingsService.pauseGoal(id, userId);
  }
}
