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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { User } from 'src/common/decorators/user.decorator';
import { AdminGuard } from 'src/common/guards/admin.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminCategoriesService } from './admin-categories.service';
import { AdminPlacesService } from './admin-places.service';
import { AdminCategoryDto, UpdateAdminCategoryDto } from './dto/admin-category.dto';
import {
  AdminPlaceDto,
  AdminPlaceQueryDto,
  HidePlaceDto,
  UpdateAdminPlaceDto,
} from './dto/admin-place.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly categoriesService: AdminCategoriesService,
    private readonly placesService: AdminPlacesService,
  ) {}

  @Get('dashboard')
  async getDashboard() {
    const [placeStats, totalCategories] = await Promise.all([
      this.placesService.getStats(),
      this.categoriesService.count(),
    ]);

    return {
      success: true,
      statusCode: 200,
      data: {
        ...placeStats,
        totalCategories,
      },
    };
  }

  @Get('categories')
  getCategories() {
    return this.categoriesService.findAll();
  }

  @Post('categories')
  createCategory(@Body() dto: AdminCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Patch('categories/:id')
  updateCategory(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdminCategoryDto,
  ) {
    return this.categoriesService.update(id, dto);
  }

  @Delete('categories/:id')
  deleteCategory(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.remove(id);
  }

  @Get('places')
  getPlaces(@Query() query: AdminPlaceQueryDto) {
    return this.placesService.findAll(query);
  }

  @Post('places')
  createPlace(@User('sub') adminId: number, @Body() dto: AdminPlaceDto) {
    return this.placesService.create(adminId, dto);
  }

  @Patch('places/:id')
  updatePlace(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdminPlaceDto,
  ) {
    return this.placesService.update(id, dto);
  }

  @Patch('places/:id/hide')
  hidePlace(@Param('id', ParseIntPipe) id: number, @Body() dto: HidePlaceDto) {
    return this.placesService.hide(id, dto.hiddenReason);
  }

  @Patch('places/:id/restore')
  restorePlace(@Param('id', ParseIntPipe) id: number) {
    return this.placesService.restore(id);
  }

  @Patch('places/:id/approve')
  approvePlace(@Param('id', ParseIntPipe) id: number) {
    return this.placesService.approve(id);
  }

  @Delete('places/:id')
  deletePlace(@Param('id', ParseIntPipe) id: number) {
    return this.placesService.remove(id);
  }
}
