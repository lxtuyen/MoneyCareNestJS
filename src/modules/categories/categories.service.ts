import { Injectable, NotFoundException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './entities/category.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { ApiResponse } from 'src/common/dto/api-response.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private categoryRepo: Repository<Category>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

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
        percentage: dto.percentage ?? 0,
        type: dto.type,
        isEssential: dto.isEssential ?? true,
        savingGoal: null,
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
      where: { user: { id: userId } },
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

    if (dto.name) category.name = dto.name;
    if (dto.icon) category.icon = dto.icon;
    if (dto.isEssential !== undefined) category.isEssential = dto.isEssential;
    if (dto.type) category.type = dto.type;
    if (dto.percentage !== undefined) category.percentage = dto.percentage;

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

    await this.categoryRepo.remove(category);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Xóa danh mục thành công',
    });
  }
}
