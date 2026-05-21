import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoriesService } from './categories.service';
import {
  AdminCategoriesController,
  CategoriesController,
} from './categories.controller';
import { Category } from './entities/category.entity';
import { SubCategory } from './entities/sub-category.entity';
import { User } from 'src/modules/user/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Category, SubCategory, User])],
  controllers: [CategoriesController, AdminCategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
