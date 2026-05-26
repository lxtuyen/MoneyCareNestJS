import {
  Injectable,
  NotFoundException,
  HttpStatus,
  OnModuleInit,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Category, CategoryType } from './entities/category.entity';
import { SubCategory } from './entities/sub-category.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { UserCategoryPreference } from './entities/user-category-preference.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateEssentialExpenseCategoriesDto } from './dto/update-essential-expense-categories.dto';
import {
  CreateSubCategoryDto,
  UpdateSubCategoryDto,
} from './dto/sub-category.dto';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { ok } from 'src/common/utils/response.util';
import {
  SYSTEM_CATEGORY_RENAME_ALIASES,
  SYSTEM_CATEGORY_SEEDS,
} from './categories.seed';

@Injectable()
export class CategoriesService implements OnModuleInit {
  constructor(
    @InjectRepository(Category)
    private categoryRepo: Repository<Category>,
    @InjectRepository(SubCategory)
    private subCategoryRepo: Repository<SubCategory>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(UserCategoryPreference)
    private preferenceRepo: Repository<UserCategoryPreference>,
  ) {}

  async onModuleInit() {
    await this.seedSystemCategories();
  }

  private async seedSystemCategories() {
    await this.renameLegacySystemCategories();

    for (const cat of SYSTEM_CATEGORY_SEEDS) {
      const exists = await this.categoryRepo.findOne({
        where: { name: cat.name, is_system: true, type: cat.type },
      });
      if (!exists) {
        await this.categoryRepo.save(this.categoryRepo.create(cat));
      } else if (exists.icon !== cat.icon) {
        exists.icon = cat.icon;
        await this.categoryRepo.save(exists);
      }
    }

    await this.hideLegacySystemCategories();
    await this.retireSystemSubCategories();
  }

  private async renameLegacySystemCategories() {
    for (const alias of SYSTEM_CATEGORY_RENAME_ALIASES) {
      const legacy = await this.categoryRepo.findOne({
        where: { name: alias.from, is_system: true, type: alias.type },
      });
      if (!legacy) continue;

      const target = await this.categoryRepo.findOne({
        where: { name: alias.to, is_system: true, type: alias.type },
      });

      if (target && target.id !== legacy.id) {
        legacy.is_system = false;
        await this.categoryRepo.save(legacy);
      } else {
        const seed = SYSTEM_CATEGORY_SEEDS.find(
          (cat) => cat.name === alias.to && cat.type === alias.type,
        );
        legacy.name = alias.to;
        legacy.icon = seed?.icon ?? legacy.icon;
        await this.categoryRepo.save(legacy);
      }
    }
  }

  private async hideLegacySystemCategories() {
    const desiredKeys = new Set(
      SYSTEM_CATEGORY_SEEDS.map((cat) => `${cat.type}:${cat.name}`),
    );
    const systemCategories = await this.categoryRepo.find({
      where: { is_system: true },
    });

    for (const category of systemCategories) {
      if (desiredKeys.has(`${category.type}:${category.name}`)) continue;
      category.is_system = false;
      await this.categoryRepo.save(category);
    }
  }

  private async retireSystemSubCategories() {
    const subCategories = await this.subCategoryRepo.find({
      where: { is_system: true },
    });

    for (const subCategory of subCategories) {
      subCategory.deleted_at = new Date();
      await this.subCategoryRepo.save(subCategory);
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

  async findEssentialExpensePreferences(
    userId: number,
  ): Promise<ApiResponse<{ categoryIds: number[] }>> {
    const preferences = await this.preferenceRepo.find({
      where: {
        user: { id: userId },
        isEssential: true,
        category: { type: CategoryType.EXPENSE },
      },
      relations: ['category'],
      order: { id: 'ASC' },
    });

    return ok({
      categoryIds: preferences
        .map((preference) => preference.category?.id)
        .filter((id): id is number => Number.isInteger(id)),
    });
  }

  async updateEssentialExpensePreferences(
    userId: number,
    dto: UpdateEssentialExpenseCategoriesDto,
  ): Promise<ApiResponse<{ categoryIds: number[] }>> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const categoryIds = [...new Set(dto.categoryIds ?? [])];
    const categories = categoryIds.length
      ? await this.categoryRepo.find({
          where: { id: In(categoryIds), type: CategoryType.EXPENSE },
        })
      : [];

    if (categories.length !== categoryIds.length) {
      throw new BadRequestException('Chỉ được chọn danh mục chi tiêu hợp lệ');
    }

    const existingExpensePreferences = await this.preferenceRepo.find({
      where: {
        user: { id: userId },
        category: { type: CategoryType.EXPENSE },
      },
      relations: ['category'],
    });

    if (existingExpensePreferences.length) {
      await this.preferenceRepo.remove(existingExpensePreferences);
    }

    if (categories.length) {
      await this.preferenceRepo.save(
        categories.map((category) =>
          this.preferenceRepo.create({
            user,
            category,
            isEssential: true,
          }),
        ),
      );
    }

    return ok(
      { categoryIds },
      'Cập nhật danh mục chi tiêu thiết yếu thành công',
    );
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
