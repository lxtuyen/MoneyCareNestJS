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
import { User } from 'src/modules/user/entities/user.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { ApiResponse } from 'src/common/dto/api-response.dto';

@Injectable()
export class CategoriesService implements OnModuleInit {
  constructor(
    @InjectRepository(Category)
    private categoryRepo: Repository<Category>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  async onModuleInit() {
    await this.seedSystemCategories();
  }

  private async seedSystemCategories() {
    const systemCategories = [
      // Expense
      { name: 'Ăn uống', icon: '🍔', type: CategoryType.EXPENSE, is_system: true },
      { name: 'Đi chợ', icon: '🛒', type: CategoryType.EXPENSE, is_system: true },
      { name: 'Di chuyển', icon: '🚗', type: CategoryType.EXPENSE, is_system: true },
      { name: 'Hóa đơn', icon: '⚡', type: CategoryType.EXPENSE, is_system: true },
      { name: 'Mua sắm', icon: '🛍️', type: CategoryType.EXPENSE, is_system: true },
      { name: 'Sức khỏe', icon: '💊', type: CategoryType.EXPENSE, is_system: true },
      { name: 'Giải trí', icon: '🎬', type: CategoryType.EXPENSE, is_system: true },
      { name: 'Giáo dục', icon: '📚', type: CategoryType.EXPENSE, is_system: true },
      { name: 'Làm đẹp', icon: '✨', type: CategoryType.EXPENSE, is_system: true },
      { name: 'Khác', icon: '📦', type: CategoryType.EXPENSE, is_system: true },
      // Income
      { name: 'Lương', icon: '💵', type: CategoryType.INCOME, is_system: true },
      { name: 'Thưởng', icon: '🧧', type: CategoryType.INCOME, is_system: true },
      { name: 'Kinh doanh', icon: '📈', type: CategoryType.INCOME, is_system: true },
      { name: 'Lãi suất', icon: '🏦', type: CategoryType.INCOME, is_system: true },
      { name: 'Quà tặng', icon: '🎁', type: CategoryType.INCOME, is_system: true },
      { name: 'Khác', icon: '➕', type: CategoryType.INCOME, is_system: true },
    ];

    for (const cat of systemCategories) {
      const exists = await this.categoryRepo.findOne({
        where: { name: cat.name, is_system: true, type: cat.type },
      });
      if (!exists) {
        await this.categoryRepo.save(this.categoryRepo.create(cat));
      }
    }
  }

  async createForUser(
    userId: number,
    dtos: CreateCategoryDto[],
  ): Promise<ApiResponse<Category[]>> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const categories = dtos.map((dto) =>
      this.categoryRepo.create({
        name: dto.name,
        icon: dto.icon,
        type: dto.type,
        isEssential: dto.isEssential ?? true,
        user,
      }),
    );

    const saved = await this.categoryRepo.save(categories);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.CREATED,
      data: saved,
    });
  }

  async findByUser(userId: number): Promise<ApiResponse<Category[]>> {
    const categories = await this.categoryRepo.find({
      where: [{ user: { id: userId } }, { is_system: true }],
      order: { is_system: 'DESC', id: 'ASC' },
    });

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: categories,
    });
  }

  async update(
    id: number,
    dto: Partial<CreateCategoryDto>,
  ): Promise<ApiResponse<Category>> {
    const category = await this.categoryRepo.findOne({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');

    if (category.is_system) {
      if ((dto.name && dto.name !== category.name) || 
          (dto.icon && dto.icon !== category.icon) || 
          (dto.type && dto.type !== category.type)) {
        throw new BadRequestException('Chỉ có thể thay đổi trạng thái Thiết yếu cho danh mục hệ thống');
      }
    }

    if (dto.name) category.name = dto.name;
    if (dto.icon) category.icon = dto.icon;
    if (dto.isEssential !== undefined) category.isEssential = dto.isEssential;
    if (dto.type) category.type = dto.type;

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
