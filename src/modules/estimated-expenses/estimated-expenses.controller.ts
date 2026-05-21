import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { User } from 'src/common/decorators/user.decorator';
import { EstimatedExpensesService } from './estimated-expenses.service';
import { CreateEstimatedExpenseDto } from './dto/create-estimated-expense.dto';
import { UpdateEstimatedExpenseDto } from './dto/update-estimated-expense.dto';

@Controller('spending-plans/:planId/estimated-expenses')
@UseGuards(JwtAuthGuard)
export class EstimatedExpensesController {
  constructor(
    private readonly estimatedExpensesService: EstimatedExpensesService,
  ) {}

  @Get()
  findEstimatedExpenses(
    @Param('planId', ParseIntPipe) planId: number,
    @User('sub') userId: number,
  ) {
    return this.estimatedExpensesService.findEstimatedExpenses(planId, userId);
  }

  @Post()
  createEstimatedExpense(
    @Param('planId', ParseIntPipe) planId: number,
    @User('sub') userId: number,
    @Body() dto: CreateEstimatedExpenseDto,
  ) {
    return this.estimatedExpensesService.createEstimatedExpense(
      planId,
      userId,
      dto,
    );
  }

  @Patch(':id')
  updateEstimatedExpense(
    @Param('planId', ParseIntPipe) planId: number,
    @Param('id', ParseIntPipe) id: number,
    @User('sub') userId: number,
    @Body() dto: UpdateEstimatedExpenseDto,
  ) {
    return this.estimatedExpensesService.updateEstimatedExpense(
      planId,
      id,
      userId,
      dto,
    );
  }

  @Delete(':id')
  deleteEstimatedExpense(
    @Param('planId', ParseIntPipe) planId: number,
    @Param('id', ParseIntPipe) id: number,
    @User('sub') userId: number,
  ) {
    return this.estimatedExpensesService.deleteEstimatedExpense(
      planId,
      id,
      userId,
    );
  }
}
