import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from '../categories/entities/category.entity';
import { Place } from '../recommendations/entities/place.entity';
import { AdminCategoriesService } from './admin-categories.service';
import { AdminController } from './admin.controller';
import { AdminPlacesService } from './admin-places.service';

@Module({
  imports: [TypeOrmModule.forFeature([Category, Place])],
  controllers: [AdminController],
  providers: [AdminCategoriesService, AdminPlacesService],
})
export class AdminModule {}
