import {
  Injectable,
  NotFoundException,
  HttpStatus,
  OnModuleInit,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category, CategoryType } from './entities/category.entity';
import { SubCategory } from './entities/sub-category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import {
  CreateSubCategoryDto,
  UpdateSubCategoryDto,
} from './dto/sub-category.dto';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import {
  SYSTEM_CATEGORY_SEEDS,
  SYSTEM_SUB_CATEGORY_SEED_GROUPS,
} from './categories.seed';

@Injectable()
export class CategoriesService implements OnModuleInit {
  constructor(
    @InjectRepository(Category)
    private categoryRepo: Repository<Category>,
    @InjectRepository(SubCategory)
    private subCategoryRepo: Repository<SubCategory>,
  ) {}

  async onModuleInit() {
    await this.seedSystemCategories();
  }

  private async seedSystemCategories() {
    for (const cat of SYSTEM_CATEGORY_SEEDS) {
      const exists = await this.categoryRepo.findOne({
        where: { name: cat.name, is_system: true, type: cat.type },
      });
      if (!exists) {
        await this.categoryRepo.save(this.categoryRepo.create(cat));
      }
    }

    await this.seedSystemSubCategories();
  }

  private async seedSystemSubCategories() {
    const categories = await this.categoryRepo.find({
      where: { is_system: true, type: CategoryType.EXPENSE },
    });

    for (const [categoryName, subCategories] of Object.entries(
      SYSTEM_SUB_CATEGORY_SEED_GROUPS,
    )) {
      const category = categories.find((cat) => cat.name === categoryName);
      if (!category) continue;

      for (const subCategory of subCategories) {
        const exists = await this.subCategoryRepo.findOne({
          where: {
            name: subCategory.name,
            category: { id: category.id },
            is_system: true,
          },
          relations: ['category'],
        });
        if (!exists) {
          await this.subCategoryRepo.save(
            this.subCategoryRepo.create({
              ...subCategory,
              type: category.type,
              category,
              is_system: true,
            }),
          );
        }
      }
    }
  }

  async findByUser(userId: number): Promise<ApiResponse<Category[]>> {
    const categories = await this.categoryRepo.find({
      where: [{ user: { id: userId } }, { is_system: true }],
      relations: ['subCategories'],
      order: { is_system: 'DESC', id: 'ASC' },
    });

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: categories,
    });
  }

  async findAllForAdmin(): Promise<ApiResponse<Category[]>> {
    const categories = await this.categoryRepo.find({
      relations: ['subCategories'],
      order: { is_system: 'DESC', id: 'ASC' },
    });

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: categories,
    });
  }

  async createAdmin(dto: CreateCategoryDto): Promise<ApiResponse<Category>> {
    const category = this.categoryRepo.create({
      name: dto.name,
      icon: dto.icon,
      type: dto.type ?? CategoryType.EXPENSE,
      isEssential: dto.isEssential ?? true,
      is_system: dto.is_system ?? true,
      user: null,
    });

    const saved = await this.categoryRepo.save(category);
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.CREATED,
      data: saved,
    });
  }

  async findSubCategories(): Promise<ApiResponse<SubCategory[]>> {
    const subCategories = await this.subCategoryRepo.find({
      relations: ['category'],
      order: { is_system: 'DESC', id: 'ASC' },
    });

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: subCategories,
    });
  }

  async createSubCategory(
    dto: CreateSubCategoryDto,
  ): Promise<ApiResponse<SubCategory>> {
    const category = await this.categoryRepo.findOne({
      where: { id: dto.categoryId },
    });
    if (!category) throw new NotFoundException('Category not found');

    const subCategory = this.subCategoryRepo.create({
      name: dto.name,
      icon: dto.icon,
      type: dto.type ?? category.type,
      is_system: dto.is_system ?? true,
      category,
    });

    const saved = await this.subCategoryRepo.save(subCategory);
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.CREATED,
      data: saved,
    });
  }

  async updateSubCategory(
    id: number,
    dto: UpdateSubCategoryDto,
  ): Promise<ApiResponse<SubCategory>> {
    const subCategory = await this.subCategoryRepo.findOne({
      where: { id },
      relations: ['category'],
    });
    if (!subCategory) throw new NotFoundException('Sub category not found');

    if (dto.categoryId !== undefined) {
      const category = await this.categoryRepo.findOne({
        where: { id: dto.categoryId },
      });
      if (!category) throw new NotFoundException('Category not found');
      subCategory.category = category;
      subCategory.type = dto.type ?? category.type;
    }

    if (dto.name !== undefined) subCategory.name = dto.name;
    if (dto.icon !== undefined) subCategory.icon = dto.icon;
    if (dto.type !== undefined) subCategory.type = dto.type;
    if (dto.is_system !== undefined) subCategory.is_system = dto.is_system;

    const saved = await this.subCategoryRepo.save(subCategory);
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: saved,
    });
  }

  async removeSubCategory(id: number): Promise<ApiResponse<void>> {
    const subCategory = await this.subCategoryRepo.findOne({ where: { id } });
    if (!subCategory) throw new NotFoundException('Sub category not found');
    await this.subCategoryRepo.remove(subCategory);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Xóa danh mục con thành công',
    });
  }

  async update(
    id: number,
    dto: Partial<CreateCategoryDto>,
  ): Promise<ApiResponse<Category>> {
    const category = await this.categoryRepo.findOne({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');

    if (category.is_system) {
      if (
        (dto.name && dto.name !== category.name) ||
        (dto.icon && dto.icon !== category.icon) ||
        (dto.type && dto.type !== category.type)
      ) {
        throw new BadRequestException(
          'Chỉ có thể thay đổi trạng thái Thiết yếu cho danh mục hệ thống',
        );
      }
    }

    if (dto.name) category.name = dto.name;
    if (dto.icon) category.icon = dto.icon;
    if (dto.isEssential !== undefined) category.isEssential = dto.isEssential;
    if (dto.type) category.type = dto.type;
    if (dto.is_system !== undefined) category.is_system = dto.is_system;

    const saved = await this.categoryRepo.save(category);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Cập nhật danh mục thành công',
      data: saved,
    });
  }

  async remove(id: number): Promise<ApiResponse<void>> {
    const category = await this.categoryRepo.findOne({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');

    if (category.is_system) {
      throw new BadRequestException('Cannot delete system category');
    }

    await this.categoryRepo.remove(category);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Xóa danh mục thành công',
    });
  }
}
