import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { Category } from '../categories/entities/category.entity';
import { GetNearbyRecommendationsDto } from './dto/get-nearby-recommendations.dto';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { PlaceCheckinsService } from './place-checkins.service';
import { PlacesService } from './places.service';

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);
  private readonly targetRecommendationCount = 5;
  private readonly minRecommendationCount = 4;
  private readonly GOOGLE_PLACES_URL =
    'https://places.googleapis.com/v1/places:searchNearby';
  private readonly FOURSQUARE_PLACES_URL =
    'https://places-api.foursquare.com/places/search';

  private readonly googleCategoryMap: Record<string, string[]> = {
    'an uong': ['restaurant', 'fast_food'],
    'di cho': ['supermarket', 'grocery_store'],
    'lam dep': ['beauty_salon', 'hair_care'],
    'giai tri': ['movie_theater', 'amusement_park', 'park', 'night_club'],
    'suc khoe': ['pharmacy', 'hospital', 'doctor', 'dentist'],
    'sua xe': ['car_repair', 'gas_station'],
  };

  private readonly foursquareCategoryMap: Record<string, string> = {
    'an uong': '13065',
    'di cho': '17142,17069',
    'lam dep': '11026',
    'giai tri': '10000',
    'suc khoe': '15000',
    'sua xe': '11001',
  };

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly placesService: PlacesService,
    private readonly placeCheckinsService: PlaceCheckinsService,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
  ) {}

  async getNearby(
    dto: GetNearbyRecommendationsDto,
    userId?: number,
  ): Promise<ApiResponse<any>> {
    if (!this.hasValidCoordinates(dto.latitude, dto.longitude)) {
      return new ApiResponse({
        success: false,
        statusCode: 400,
        message: 'Vui long cung cap toa do hop le de lay de xuat gan day.',
      });
    }

    const localRecommendations = await this.getLocalRecommendations(
      dto,
      userId,
    );
    if (localRecommendations.length >= this.targetRecommendationCount) {
      return new ApiResponse({
        success: true,
        statusCode: 200,
        data: localRecommendations.slice(0, this.targetRecommendationCount),
      });
    }

    const goongRecommendations = await this.getGoongRecommendations(dto);
    const mergedRecommendations = this.mergeRecommendations([
      ...localRecommendations,
      ...goongRecommendations,
    ]);
    if (mergedRecommendations.length >= this.minRecommendationCount) {
      return new ApiResponse({
        success: true,
        statusCode: 200,
        data: mergedRecommendations.slice(0, this.targetRecommendationCount),
      });
    }

    const foursquareKey = this.configService.get<string>('FOURSQUARE_API_KEY');

    if (foursquareKey) {
      const fallback = await this.getNearbyFoursquare(dto, foursquareKey);
      return this.withMergedFallback(mergedRecommendations, fallback);
    }

    const fallback = await this.getNearbyGoogle(dto);
    return this.withMergedFallback(mergedRecommendations, fallback);
  }

  private hasValidCoordinates(latitude: unknown, longitude: unknown): boolean {
    return (
      typeof latitude === 'number' &&
      typeof longitude === 'number' &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    );
  }

  private normalizeCategoryName(value: string): string {
    return (value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  private async getLocalRecommendations(
    dto: GetNearbyRecommendationsDto,
    userId?: number,
  ): Promise<any[]> {
    const radius = dto.radius || 1000;
    const query = await this.getRecommendationQuery(dto);
    const candidates: any[] = [];

    if (userId) {
      const personalCandidates =
        await this.placeCheckinsService.getPersonalCandidates(
          userId,
          dto.latitude,
          dto.longitude,
          radius,
          query,
        );
      candidates.push(
        ...personalCandidates.map((item) =>
          this.mapPersonalRecommendation(item, dto, radius),
        ),
      );
    }

    const communityCandidates = await this.placesService.getCommunityCandidates(
      dto.latitude,
      dto.longitude,
      radius,
      query,
    );
    candidates.push(
      ...communityCandidates.map((item) =>
        this.mapCommunityRecommendation(item, dto, radius),
      ),
    );

    return this.mergeRecommendations(candidates)
      .sort((a, b) => b.score - a.score)
      .slice(0, this.targetRecommendationCount);
  }

  private async getGoongRecommendations(
    dto: GetNearbyRecommendationsDto,
  ): Promise<any[]> {
    const query = await this.getRecommendationQuery(dto);
    const result = await this.placesService.search({
      query,
      latitude: dto.latitude,
      longitude: dto.longitude,
      radius: dto.radius || 1000,
    });
    const places = Array.isArray(result.data) ? result.data : [];

    return places.map((place) => ({
      id: place.placeId ? `local:${place.placeId}` : place.providerPlaceId,
      placeId: place.placeId,
      displayName: { text: place.name },
      formattedAddress: place.address,
      location: {
        latitude: place.latitude,
        longitude: place.longitude,
      },
      types: place.categories || [],
      distance: place.distance,
      rating: null,
      priceLevel: 'PRICE_LEVEL_UNSPECIFIED',
      score: 40 - Math.min(20, (place.distance || 0) / 100),
      reason: 'Dia diem moi gan ban tu Goong/local search.',
      priceEstimate: null,
      ratingSource: 'none',
      source: place.source || 'goong',
    }));
  }

  private mapPersonalRecommendation(
    item: any,
    dto: GetNearbyRecommendationsDto,
    radius: number,
  ) {
    const checkin = item.checkin;
    const place = item.place;
    const score =
      60 +
      this.distanceScore(item.distance, radius, 20) +
      Number(checkin.rating) * 8 +
      (checkin.wantToReturn ? 15 : 0) +
      this.budgetScore(Number(checkin.amount), dto.budgetMax, 20);

    return {
      ...this.placesService.toRecommendationPlace(place, item.distance),
      score,
      reason: checkin.wantToReturn
        ? 'Ban tung danh gia tot va muon quay lai dia diem nay.'
        : 'Ban tung check-in dia diem nay truoc day.',
      priceEstimate: {
        source: 'personal',
        amount: Number(checkin.amount),
      },
      ratingSource: 'personal',
      personalRating: checkin.rating,
      wantToReturn: checkin.wantToReturn,
      source: 'personal',
    };
  }

  private mapCommunityRecommendation(
    item: any,
    dto: GetNearbyRecommendationsDto,
    radius: number,
  ) {
    const score =
      45 +
      this.distanceScore(item.distance, radius, 20) +
      Number(item.stats.avgRating) * 6 +
      Number(item.stats.returnIntentRate) * 15 +
      this.budgetScore(Number(item.stats.avgAmount), dto.budgetMax, 20);

    return {
      ...this.placesService.toRecommendationPlace(
        item.place,
        item.distance,
        item.stats,
      ),
      score,
      reason:
        'Dia diem co du lieu cong dong an danh phu hop vi tri va ngan sach.',
      priceEstimate: {
        source: 'community',
        avgAmount: item.stats.avgAmount,
        minAmount: item.stats.minAmount,
        maxAmount: item.stats.maxAmount,
      },
      ratingSource: 'community',
      source: 'community',
    };
  }

  private async getRecommendationQuery(
    dto: GetNearbyRecommendationsDto,
  ): Promise<string | undefined> {
    if (dto.keywords?.length) return dto.keywords[0];
    const category = await this.resolveCategory(dto);
    return category?.name;
  }

  private distanceScore(distance: number, radius: number, maxScore: number) {
    if (!Number.isFinite(distance) || radius <= 0) return 0;
    return Math.max(0, maxScore * (1 - distance / radius));
  }

  private budgetScore(
    amount: number,
    budgetMax: number | undefined,
    maxScore: number,
  ) {
    if (!budgetMax || !Number.isFinite(amount)) return 0;
    if (amount <= budgetMax) return maxScore;
    const overRatio = (amount - budgetMax) / budgetMax;
    return Math.max(0, maxScore * (1 - overRatio));
  }

  private mergeRecommendations(places: any[]): any[] {
    const seen = new Set<string>();
    return places.filter((place) => {
      const key =
        place.placeId ||
        place.id ||
        `${place.displayName?.text}:${place.location?.latitude}:${place.location?.longitude}`;
      if (seen.has(String(key))) return false;
      seen.add(String(key));
      return true;
    });
  }

  private withMergedFallback(local: any[], fallback: ApiResponse<any>) {
    if (!fallback.success) {
      return local.length
        ? new ApiResponse({
            success: true,
            statusCode: 200,
            data: local,
          })
        : fallback;
    }

    return new ApiResponse({
      success: true,
      statusCode: 200,
      data: this.mergeRecommendations([
        ...local,
        ...((fallback.data as any[]) || []).map((place) => ({
          ...place,
          score: place.score ?? 20,
          reason: place.reason ?? 'Dia diem tu provider ben ngoai.',
          priceEstimate: place.priceEstimate ?? null,
          ratingSource: place.ratingSource ?? 'provider',
        })),
      ]).slice(0, this.targetRecommendationCount),
    });
  }

  private async resolveCategory(
    dto: GetNearbyRecommendationsDto,
  ): Promise<Category | null> {
    if (!dto.categoryId) return null;
    return this.categoryRepo.findOne({ where: { id: dto.categoryId } });
  }

  private getMappedFoursquareCategory(
    category: Category | null,
  ): string | undefined {
    if (!category) return undefined;
    return this.foursquareCategoryMap[
      this.normalizeCategoryName(category.name)
    ];
  }

  private getMappedGoogleTypes(category: Category | null): string[] {
    if (!category) return [];
    return (
      this.googleCategoryMap[this.normalizeCategoryName(category.name)] ?? []
    );
  }

  private mapPriceLevel(maxPrice?: string): number | undefined {
    const priceMap: Record<string, number> = {
      PRICE_LEVEL_INEXPENSIVE: 1,
      PRICE_LEVEL_MODERATE: 2,
      PRICE_LEVEL_EXPENSIVE: 3,
      PRICE_LEVEL_VERY_EXPENSIVE: 4,
    };
    return maxPrice ? priceMap[maxPrice] : undefined;
  }

  private isExpectedFoursquarePlace(
    item: any,
    category: Category | null,
  ): boolean {
    if (!category) return true;

    const normalizedCategory = this.normalizeCategoryName(category.name);
    const fsqCategories = Array.isArray(item.categories) ? item.categories : [];
    const categoryIds = fsqCategories.map((c) =>
      String(c.id ?? c.category_id ?? ''),
    );
    const categoryNames = fsqCategories.map((c) =>
      this.normalizeCategoryName(c.name ?? ''),
    );

    if (normalizedCategory === 'an uong') {
      return (
        categoryIds.some(
          (id) =>
            id === '13065' || (Number(id) >= 13066 && Number(id) <= 13389),
        ) ||
        categoryNames.some(
          (name) =>
            name.includes('restaurant') ||
            name.includes('food') ||
            name.includes('noodle') ||
            name.includes('bun') ||
            name.includes('pho'),
        )
      );
    }

    const expectedIds = (
      this.foursquareCategoryMap[normalizedCategory] ?? ''
    ).split(',');
    return (
      expectedIds.length === 0 ||
      categoryIds.some((id) => expectedIds.includes(id))
    );
  }

  private async getNearbyFoursquare(
    dto: GetNearbyRecommendationsDto,
    apiKey: string,
  ): Promise<ApiResponse<any>> {
    try {
      const category = await this.resolveCategory(dto);
      const categories = this.getMappedFoursquareCategory(category);
      const maxPrice = this.mapPriceLevel(dto.maxPrice);

      const params = {
        ll: `${dto.latitude},${dto.longitude}`,
        radius: dto.radius || 1000,
        ...(categories ? { categoryId: categories } : {}),
        ...(maxPrice ? { max_price: maxPrice } : {}),
        limit: 10,
        sort: 'distance',
        fields:
          'fsq_place_id,name,location,latitude,longitude,categories,distance',
      };

      const response = await firstValueFrom(
        this.httpService.get(this.FOURSQUARE_PLACES_URL, {
          params,
          headers: {
            Authorization: apiKey.startsWith('fsq3_')
              ? apiKey
              : `Bearer ${apiKey}`,
            'X-Places-Api-Version': '2025-06-17',
            Accept: 'application/json',
          },
        }),
      );

      const places = (response.data.results || [])
        .filter((item) => this.isExpectedFoursquarePlace(item, category))
        .map((item) => ({
          id: item.fsq_place_id,
          displayName: { text: item.name },
          formattedAddress:
            item.location?.formatted_address || item.location?.address,
          location: {
            latitude: item.latitude,
            longitude: item.longitude,
          },
          types: Array.isArray(item.categories)
            ? item.categories.map((c) => c.name)
            : [],
          rating: null,
          priceLevel: 'PRICE_LEVEL_UNSPECIFIED',
        }));

      return new ApiResponse({
        success: true,
        statusCode: 200,
        data: places,
      });
    } catch (error) {
      this.logger.error(
        `Foursquare New API Error: ${error.response?.data?.message || error.message}`,
      );
      return new ApiResponse({
        success: false,
        statusCode: error.response?.status || 500,
        message: 'Không thể lấy đề xuất từ Foursquare New API.',
      });
    }
  }

  private async getNearbyGoogle(
    dto: GetNearbyRecommendationsDto,
  ): Promise<ApiResponse<any>> {
    try {
      const apiKey = this.configService.get<string>('GOOGLE_PLACES_API_KEY');
      const category = await this.resolveCategory(dto);
      const includedTypes = this.getMappedGoogleTypes(category);

      const body = {
        includedTypes,
        maxResultCount: 10,
        locationRestriction: {
          circle: {
            center: {
              latitude: dto.latitude,
              longitude: dto.longitude,
            },
            radius: dto.radius || 1000,
          },
        },
        maxPriceLevel: dto.maxPrice,
      };

      const headers = {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.formattedAddress,places.location,places.types',
      };

      const response = await firstValueFrom(
        this.httpService.post(this.GOOGLE_PLACES_URL, body, { headers }),
      );

      return new ApiResponse({
        success: true,
        statusCode: 200,
        data: response.data.places || [],
      });
    } catch (error) {
      const errorDetail = error.response?.data || error.message;
      this.logger.error(`Google Places Error: ${JSON.stringify(errorDetail)}`);
      return new ApiResponse({
        success: false,
        statusCode: error.response?.status || 500,
        message: 'Không thể lấy đề xuất từ Google Places',
      });
    }
  }
}
