import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Repository } from 'typeorm';
import { CreatePlaceCheckinDto } from './dto/create-place-checkin.dto';
import { UpdatePlaceCheckinDto } from './dto/update-place-checkin.dto';
import { PlaceAggregateStats } from './entities/place-aggregate-stats.entity';
import { PlaceCheckin } from './entities/place-checkin.entity';
import { Place, PlaceSource, PlaceStatus } from './entities/place.entity';
import { PlacesService } from './places.service';

@Injectable()
export class PlaceCheckinsService {
  constructor(
    @InjectRepository(PlaceCheckin)
    private readonly checkinRepo: Repository<PlaceCheckin>,
    @InjectRepository(PlaceAggregateStats)
    private readonly statsRepo: Repository<PlaceAggregateStats>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    private readonly placesService: PlacesService,
  ) {}

  async create(
    userId: number,
    dto: CreatePlaceCheckinDto,
  ): Promise<ApiResponse<any>> {
    const transaction = await this.transactionRepo.findOne({
      where: { id: dto.transactionId },
      relations: ['user'],
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
    if (transaction.user.id !== userId) {
      throw new ForbiddenException('Cannot check in another user transaction');
    }

    const place = await this.resolvePlace(userId, dto);
    const visitedAt = dto.visitedAt
      ? new Date(dto.visitedAt)
      : transaction.transaction_date || new Date();
    if (Number.isNaN(visitedAt.getTime())) {
      throw new BadRequestException('visitedAt is invalid');
    }

    const checkin = this.checkinRepo.create({
      user: { id: userId } as User,
      transaction,
      place,
      amount: Number(transaction.amount),
      rating: dto.rating,
      wantToReturn: dto.wantToReturn,
      note: dto.note || transaction.note || null,
      tags: dto.tags || [],
      visitedAt,
    });

    const saved = await this.checkinRepo.save(checkin);
    const stats = await this.refreshAggregate(place.id);

    return new ApiResponse({
      success: true,
      statusCode: 200,
      data: {
        id: saved.id,
        place: this.sanitizePlace(place),
        rating: saved.rating,
        wantToReturn: saved.wantToReturn,
        visitedAt: saved.visitedAt,
        aggregateStats: this.publicAggregate(stats),
      },
    });
  }

  async findMine(userId: number): Promise<ApiResponse<any[]>> {
    const checkins = await this.checkinRepo.find({
      where: { user: { id: userId } },
      relations: ['place', 'transaction'],
      order: { visitedAt: 'DESC' },
    });

    return new ApiResponse({
      success: true,
      statusCode: 200,
      data: checkins.map((checkin) => this.publicCheckin(checkin)),
    });
  }

  async update(
    userId: number,
    id: number,
    dto: UpdatePlaceCheckinDto,
  ): Promise<ApiResponse<any>> {
    const checkin = await this.findOwnedCheckin(userId, id);

    if (dto.rating !== undefined) checkin.rating = dto.rating;
    if (dto.wantToReturn !== undefined) {
      checkin.wantToReturn = dto.wantToReturn;
    }
    if (dto.note !== undefined) checkin.note = dto.note || null;
    if (dto.tags !== undefined) checkin.tags = dto.tags;
    if (dto.visitedAt !== undefined) {
      const visitedAt = new Date(dto.visitedAt);
      if (Number.isNaN(visitedAt.getTime())) {
        throw new BadRequestException('visitedAt is invalid');
      }
      checkin.visitedAt = visitedAt;
    }

    const saved = await this.checkinRepo.save(checkin);
    await this.refreshAggregate(saved.place.id);

    return new ApiResponse({
      success: true,
      statusCode: 200,
      data: this.publicCheckin(saved),
    });
  }

  async remove(userId: number, id: number): Promise<ApiResponse<any>> {
    const checkin = await this.findOwnedCheckin(userId, id);
    const placeId = checkin.place.id;
    await this.checkinRepo.remove(checkin);
    await this.refreshAggregate(placeId);

    return new ApiResponse({
      success: true,
      statusCode: 200,
      data: { id },
    });
  }

  async getPersonalCandidates(
    userId: number,
    latitude: number,
    longitude: number,
    radius: number,
    query?: string,
  ): Promise<any[]> {
    const normalizedQuery = this.placesService.normalizeName(query || '');
    const checkins = await this.checkinRepo.find({
      where: { user: { id: userId } },
      relations: ['place'],
      order: { visitedAt: 'DESC' },
      take: 200,
    });

    const latestByPlace = new Map<number, PlaceCheckin>();
    for (const checkin of checkins) {
      if (!latestByPlace.has(checkin.place.id)) {
        latestByPlace.set(checkin.place.id, checkin);
      }
    }

    return Array.from(latestByPlace.values())
      .map((checkin) => ({
        checkin,
        place: checkin.place,
        distance: this.placesService.distanceMeters(
          latitude,
          longitude,
          checkin.place.latitude,
          checkin.place.longitude,
        ),
      }))
      .filter((item) => item.place.status === PlaceStatus.ACTIVE)
      .filter((item) => item.distance <= radius)
      .filter(
        (item) =>
          !normalizedQuery ||
          item.place.normalizedName.includes(normalizedQuery) ||
          (item.place.address || '').toLowerCase().includes(normalizedQuery),
      );
  }

  private async resolvePlace(
    userId: number,
    dto: CreatePlaceCheckinDto,
  ): Promise<Place> {
    if (dto.placeId) {
      const place = await this.placesService.findById(dto.placeId);
      if (place) return place;
    }

    if (!dto.place) {
      throw new BadRequestException('placeId or place payload is required');
    }

    return this.placesService.upsertPlace({
      provider: dto.place.provider,
      providerPlaceId: dto.place.providerPlaceId,
      name: dto.place.name,
      address: dto.place.address,
      latitude: dto.place.latitude,
      longitude: dto.place.longitude,
      categories: dto.place.categories,
      source: PlaceSource.USER_CREATED,
      status: PlaceStatus.PENDING,
      createdById: userId,
    });
  }

  private async refreshAggregate(
    placeId: number,
  ): Promise<PlaceAggregateStats | null> {
    const checkins = await this.checkinRepo.find({
      where: { place: { id: placeId } },
      relations: ['place'],
    });

    let stats = await this.statsRepo.findOne({
      where: { place: { id: placeId } },
      relations: ['place'],
    });

    if (checkins.length === 0) {
      if (stats) await this.statsRepo.remove(stats);
      return null;
    }

    const count = checkins.length;
    const amounts = checkins.map((checkin) => Number(checkin.amount));
    const ratings = checkins.map((checkin) => Number(checkin.rating));
    const returnCount = checkins.filter(
      (checkin) => checkin.wantToReturn,
    ).length;
    const tagCounts = new Map<string, number>();

    for (const checkin of checkins) {
      for (const tag of checkin.tags || []) {
        const key = tag.trim().toLowerCase();
        if (key) tagCounts.set(key, (tagCounts.get(key) || 0) + 1);
      }
    }

    const popularTags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag]) => tag);

    if (!stats) {
      stats = this.statsRepo.create({
        place: checkins[0].place,
      });
    }

    stats.checkinCount = count;
    stats.avgRating = this.average(ratings);
    stats.avgAmount = this.average(amounts);
    stats.minAmount = Math.min(...amounts);
    stats.maxAmount = Math.max(...amounts);
    stats.returnIntentRate = count > 0 ? returnCount / count : 0;
    stats.popularTags = popularTags;

    return this.statsRepo.save(stats);
  }

  private publicAggregate(stats: PlaceAggregateStats | null) {
    if (!stats || stats.checkinCount < 3) return null;
    return {
      checkinCount: stats.checkinCount,
      avgRating: stats.avgRating,
      avgAmount: stats.avgAmount,
      minAmount: stats.minAmount,
      maxAmount: stats.maxAmount,
      returnIntentRate: stats.returnIntentRate,
      popularTags: stats.popularTags || [],
    };
  }

  private sanitizePlace(place: Place) {
    return {
      id: place.id,
      provider: place.provider,
      providerPlaceId: place.providerPlaceId,
      name: place.name,
      address: place.address,
      latitude: place.latitude,
      longitude: place.longitude,
      categories: place.categories || [],
      status: place.status,
    };
  }

  private async findOwnedCheckin(
    userId: number,
    id: number,
  ): Promise<PlaceCheckin> {
    const checkin = await this.checkinRepo.findOne({
      where: { id },
      relations: ['user', 'place', 'transaction'],
    });
    if (!checkin) throw new NotFoundException('Check-in not found');
    if (checkin.user.id !== userId) {
      throw new ForbiddenException('Cannot manage another user check-in');
    }
    return checkin;
  }

  private publicCheckin(checkin: PlaceCheckin) {
    return {
      id: checkin.id,
      transactionId: checkin.transaction?.id,
      amount: Number(checkin.amount),
      rating: checkin.rating,
      wantToReturn: checkin.wantToReturn,
      note: checkin.note,
      tags: checkin.tags || [],
      visitedAt: checkin.visitedAt,
      createdAt: checkin.createdAt,
      updatedAt: checkin.updatedAt,
      place: this.sanitizePlace(checkin.place),
    };
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }
}
