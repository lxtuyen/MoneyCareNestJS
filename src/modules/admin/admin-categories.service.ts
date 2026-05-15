import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { Category, CategoryType } from 'src/modules/categories/entities/category.entity';
import { IsNull, Repository } from 'typeorm';
import { AdminCategoryDto } from './dto/admin-category.dto';

@Injectable()
export class AdminCategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
  ) {}

  async findAll(): Promise<ApiResponse<Category[]>> {
    const categories = await this.categoryRepo.find({
      where: { user: IsNull() },
      withDeleted: false,
      order: { is_system: 'DESC', type: 'ASC', id: 'ASC' },
    });
    return new ApiResponse({ success: true, statusCode: HttpStatus.OK, data: categories });
  }

  async count(): Promise<number> {
    return this.categoryRepo.count({ where: { user: IsNull() } });
  }

  async create(dto: AdminCategoryDto): Promise<ApiResponse<Category>> {
    const category = this.categoryRepo.create({
      name: dto.name,
      icon: dto.icon,
      type: dto.type ?? CategoryType.EXPENSE,
      isEssential: dto.isEssential ?? true,
      is_system: dto.is_system ?? true,
      user: null,
    });
    const saved = await this.categoryRepo.save(category);
    return new ApiResponse({ success: true, statusCode: HttpStatus.CREATED, data: saved });
  }

  async update(id: number, dto: Partial<AdminCategoryDto>): Promise<ApiResponse<Category>> {
    const category = await this.categoryRepo.findOne({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');

    if (dto.name !== undefined) category.name = dto.name;
    if (dto.icon !== undefined) category.icon = dto.icon;
    if (dto.type !== undefined) category.type = dto.type;
    if (dto.isEssential !== undefined) category.isEssential = dto.isEssential;
    if (dto.is_system !== undefined) category.is_system = dto.is_system;

    const saved = await this.categoryRepo.save(category);
    return new ApiResponse({ success: true, statusCode: HttpStatus.OK, data: saved });
  }

  async remove(id: number): Promise<ApiResponse<void>> {
    const category = await this.categoryRepo.findOne({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');
    await this.categoryRepo.softRemove(category);
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Category deleted successfully',
    });
  }
}
