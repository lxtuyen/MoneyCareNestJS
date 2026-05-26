import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  Patch,
  Delete,
  Put,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateEssentialExpenseCategoriesDto } from './dto/update-essential-expense-categories.dto';
import {
  CreateSubCategoryDto,
  UpdateSubCategoryDto,
} from './dto/sub-category.dto';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { User as CurrentUser } from 'src/common/decorators/user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get('me/essential-expenses')
  findEssentialExpenses(@CurrentUser('sub') userId: number) {
    return this.categoriesService.findEssentialExpensePreferences(userId);
  }

  @Put('me/essential-expenses')
  updateEssentialExpenses(
    @CurrentUser('sub') userId: number,
    @Body() dto: UpdateEssentialExpenseCategoriesDto,
  ) {
    return this.categoriesService.updateEssentialExpensePreferences(
      userId,
      dto,
    );
  }

  @Get('user/:userId')
  findByUser(@Param('userId', ParseIntPipe) userId: number) {
    return this.categoriesService.findByUser(userId);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.remove(id);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('admin')
export class AdminCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get('categories')
  findCategories() {
    return this.categoriesService.findAllForAdmin();
  }

  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.createAdmin(dto);
  }

  @Patch('categories/:id')
  updateCategory(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.categoriesService.update(id, dto);
  }

  @Delete('categories/:id')
  removeCategory(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.remove(id);
  }

  @Get('sub-categories')
  findSubCategories() {
    return this.categoriesService.findSubCategories();
  }

  @Post('sub-categories')
  createSubCategory(@Body() dto: CreateSubCategoryDto) {
    return this.categoriesService.createSubCategory(dto);
  }

  @Patch('sub-categories/:id')
  updateSubCategory(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSubCategoryDto,
  ) {
    return this.categoriesService.updateSubCategory(id, dto);
  }

  @Delete('sub-categories/:id')
  removeSubCategory(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.removeSubCategory(id);
  }
}
