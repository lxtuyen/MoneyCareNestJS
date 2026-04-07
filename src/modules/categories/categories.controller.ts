import { Controller, Get, Post, Body, Param, ParseIntPipe, UseGuards, Patch, Delete } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post('user/:userId')
  createForUser(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dtos: CreateCategoryDto[],
  ) {
    return this.categoriesService.createForUser(userId, dtos);
  }

  @Get('user/:userId')
  findByUser(@Param('userId', ParseIntPipe) userId: number) {
    return this.categoriesService.findByUser(userId);
  }

  @Post('user/:userId/single')
  createOne(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.categoriesService.createForUser(userId, [dto]);
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
