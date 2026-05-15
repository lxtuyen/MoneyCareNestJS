import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { Category } from 'src/modules/categories/entities/category.entity';
import { Place, PlaceSource, PlaceStatus } from 'src/modules/recommendations/entities/place.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Brackets, Repository } from 'typeorm';
import { AdminPlaceDto, AdminPlaceQueryDto } from './dto/admin-place.dto';

@Injectable()
export class AdminPlacesService {
  constructor(
    @InjectRepository(Place)
    private readonly placeRepo: Repository<Place>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
  ) {}

  async findAll(query: AdminPlaceQueryDto): Promise<ApiResponse<any>> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const qb = this.placeRepo
      .createQueryBuilder('place')
      .leftJoinAndSelect('place.category', 'category')
      .leftJoinAndSelect('place.createdBy', 'createdBy')
      .orderBy('place.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.keyword) {
      const keyword = `%${query.keyword.trim().toLowerCase()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('LOWER(place.name) LIKE :keyword', { keyword })
            .orWhere('LOWER(place.address) LIKE :keyword', { keyword });
        }),
      );
    }
    if (query.categoryId) qb.andWhere('category.id = :categoryId', { categoryId: query.categoryId });
    if (query.source) qb.andWhere('place.source = :source', { source: query.source });
    if (query.status) qb.andWhere('place.status = :status', { status: query.status });
    if (query.isSystemSuggested !== undefined) {
      qb.andWhere('place.isSystemSuggested = :isSystemSuggested', {
        isSystemSuggested: query.isSystemSuggested,
      });
    }
    if (query.createdBy) qb.andWhere('createdBy.id = :createdBy', { createdBy: query.createdBy });

    const [items, total] = await qb.getManyAndCount();
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: { items, total, page, limit },
    });
  }

  async getStats(): Promise<{
    totalPlaces: number;
    userPlaces: number;
    systemSuggestedPlaces: number;
    pendingPlaces: number;
    hiddenPlaces: number;
  }> {
    const [
      totalPlaces,
      userPlaces,
      systemSuggestedPlaces,
      pendingPlaces,
      hiddenPlaces,
    ] =
      await Promise.all([
        this.placeRepo.count(),
        this.placeRepo.count({ where: { source: PlaceSource.USER_CREATED } }),
        this.placeRepo.count({ where: { isSystemSuggested: true } }),
        this.placeRepo.count({ where: { status: PlaceStatus.PENDING } }),
        this.placeRepo.count({ where: { status: PlaceStatus.HIDDEN } }),
      ]);

    return {
      totalPlaces,
      userPlaces,
      systemSuggestedPlaces,
      pendingPlaces,
      hiddenPlaces,
    };
  }

  async create(adminId: number, dto: AdminPlaceDto): Promise<ApiResponse<Place>> {
    const category = await this.resolveCategory(dto.categoryId);
    const place = this.placeRepo.create({
      provider: 'manual',
      providerPlaceId: null,
      name: dto.name,
      normalizedName: this.normalizeName(dto.name),
      address: dto.address || null,
      latitude: dto.latitude,
      longitude: dto.longitude,
      categories: category ? [category.name] : [],
      category,
      createdBy: { id: adminId } as User,
      source: PlaceSource.ADMIN_CREATED,
      status: dto.status ?? PlaceStatus.ACTIVE,
      isSystemSuggested: dto.isSystemSuggested ?? true,
      hiddenReason: dto.status === PlaceStatus.HIDDEN ? dto.hiddenReason || null : null,
    });
    const saved = await this.placeRepo.save(place);
    return new ApiResponse({ success: true, statusCode: HttpStatus.CREATED, data: saved });
  }

  async update(id: number, dto: Partial<AdminPlaceDto>): Promise<ApiResponse<Place>> {
    const place = await this.placeRepo.findOne({
      where: { id },
      relations: ['category', 'createdBy'],
    });
    if (!place) throw new NotFoundException('Place not found');

    if (dto.name !== undefined) {
      place.name = dto.name;
      place.normalizedName = this.normalizeName(dto.name);
    }
    if (dto.address !== undefined) place.address = dto.address || null;
    if (dto.latitude !== undefined) place.latitude = dto.latitude;
    if (dto.longitude !== undefined) place.longitude = dto.longitude;
    if (dto.categoryId !== undefined) {
      const category = await this.resolveCategory(dto.categoryId);
      place.category = category;
      place.categories = category ? [category.name] : [];
    }
    if (dto.isSystemSuggested !== undefined) place.isSystemSuggested = dto.isSystemSuggested;
    if (dto.status !== undefined) place.status = dto.status;
    if (dto.hiddenReason !== undefined) place.hiddenReason = dto.hiddenReason || null;
    if (place.status === PlaceStatus.ACTIVE) place.hiddenReason = null;

    const saved = await this.placeRepo.save(place);
    return new ApiResponse({ success: true, statusCode: HttpStatus.OK, data: saved });
  }

  async hide(id: number, hiddenReason?: string): Promise<ApiResponse<Place>> {
    return this.update(id, { status: PlaceStatus.HIDDEN, hiddenReason });
  }

  async restore(id: number): Promise<ApiResponse<Place>> {
    return this.update(id, { status: PlaceStatus.ACTIVE, hiddenReason: '' });
  }

  async approve(id: number): Promise<ApiResponse<Place>> {
    return this.update(id, { status: PlaceStatus.ACTIVE, hiddenReason: '' });
  }

  async remove(id: number): Promise<ApiResponse<void>> {
    const result = await this.placeRepo.softDelete(id);
    if (!result.affected) throw new NotFoundException('Place not found');
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Place deleted successfully',
    });
  }

  private async resolveCategory(categoryId?: number): Promise<Category | null> {
    if (!categoryId) return null;
    const category = await this.categoryRepo.findOne({ where: { id: categoryId } });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  private normalizeName(value: string): string {
    return (value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }
}
