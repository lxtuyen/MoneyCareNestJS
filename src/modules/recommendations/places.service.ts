import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { firstValueFrom } from 'rxjs';
import { Repository } from 'typeorm';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { ResolveLocationDto } from './dto/resolve-location.dto';
import { SearchPlacesDto } from './dto/search-places.dto';
import { Place, PlaceSource, PlaceStatus } from './entities/place.entity';
import { PlaceAggregateStats } from './entities/place-aggregate-stats.entity';
import { User } from '../user/entities/user.entity';

export type NormalizedPlaceInput = {
  id?: number;
  provider?: string;
  providerPlaceId?: string | null;
  name: string;
  address?: string | null;
  latitude: number;
  longitude: number;
  categories?: string[] | null;
  source?: PlaceSource;
  status?: PlaceStatus;
  createdById?: number;
};

@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);

  private readonly goongAutocompleteUrl =
    'https://rsapi.goong.io/Place/AutoComplete';
  private readonly goongDetailUrl = 'https://rsapi.goong.io/Place/Detail';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @InjectRepository(Place)
    private readonly placeRepo: Repository<Place>,
    @InjectRepository(PlaceAggregateStats)
    private readonly statsRepo: Repository<PlaceAggregateStats>,
  ) {}

  async search(dto: SearchPlacesDto): Promise<ApiResponse<any[]>> {
    const radius = dto.radius || 1000;
    this.logger.log(
      `Places search query="${dto.query ?? ''}" lat=${dto.latitude} lng=${dto.longitude} radius=${radius}`,
    );
    const localPlaces = await this.searchLocal(dto, radius);
    let goongPlaces = await this.searchGoong(dto, radius);
    const fallbackQuery = this.getFallbackFoodQuery(dto.query);
    if (goongPlaces.length === 0 && fallbackQuery) {
      goongPlaces = await this.searchGoong(
        { ...dto, query: fallbackQuery },
        radius,
      );
    }
    const merged = this.mergePlaces([...localPlaces, ...goongPlaces]);
    this.logger.log(
      `Places search result local=${localPlaces.length} goong=${goongPlaces.length} merged=${merged.length}`,
    );

    return new ApiResponse({
      success: true,
      statusCode: 200,
      data: merged,
    });
  }

  async resolveLocation(dto: ResolveLocationDto): Promise<ApiResponse<any>> {
    const query = dto.query?.trim();
    const apiKey =
      this.configService.get<string>('GOONG_API_KEY') ||
      this.configService.get<string>('GOONG_MAPS_API_KEY');

    if (!query || !apiKey) {
      return new ApiResponse({
        success: true,
        statusCode: 200,
        data: null,
      });
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get(this.goongAutocompleteUrl, {
          params: {
            api_key: apiKey,
            input: query,
          },
        }),
      );

      const predictions = Array.isArray(response.data?.predictions)
        ? response.data.predictions
        : [];
      const firstPrediction = predictions[0];
      if (!firstPrediction?.place_id) {
        return new ApiResponse({
          success: true,
          statusCode: 200,
          data: null,
        });
      }

      const detail = await firstValueFrom(
        this.httpService.get(this.goongDetailUrl, {
          params: {
            api_key: apiKey,
            place_id: firstPrediction.place_id,
          },
        }),
      );
      const result = detail.data?.result;
      const location = result?.geometry?.location;
      if (
        typeof location?.lat !== 'number' ||
        typeof location?.lng !== 'number'
      ) {
        return new ApiResponse({
          success: true,
          statusCode: 200,
          data: null,
        });
      }

      return new ApiResponse({
        success: true,
        statusCode: 200,
        data: {
          label:
            result.formatted_address ||
            firstPrediction.description ||
            result.name ||
            query,
          latitude: location.lat,
          longitude: location.lng,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Goong location resolve failed for "${query}": ${this.getErrorMessage(error)}`,
      );
      return new ApiResponse({
        success: true,
        statusCode: 200,
        data: null,
      });
    }
  }

  async upsertPlace(input: NormalizedPlaceInput): Promise<Place> {
    const normalizedName = this.normalizeName(input.name);
    const provider = input.provider || 'goong';
    const providerPlaceId = input.providerPlaceId || null;

    let place =
      input.id && Number.isFinite(input.id)
        ? await this.placeRepo.findOne({ where: { id: input.id } })
        : null;

    if (!place && providerPlaceId) {
      place = await this.placeRepo.findOne({
        where: { provider, providerPlaceId },
      });
    }

    if (!place) {
      const candidates = await this.placeRepo.find({
        where: { normalizedName },
        take: 20,
      });
      place =
        candidates.find(
          (candidate) =>
            this.distanceMeters(
              input.latitude,
              input.longitude,
              candidate.latitude,
              candidate.longitude,
            ) <= 50,
        ) || null;
    }

    const next = this.placeRepo.create({
      ...place,
      provider,
      providerPlaceId,
      name: input.name,
      normalizedName,
      address: input.address || null,
      latitude: input.latitude,
      longitude: input.longitude,
      categories: input.categories || [],
      source: place?.source ?? input.source ?? PlaceSource.USER_CREATED,
      status: place?.status ?? input.status ?? PlaceStatus.ACTIVE,
      isSystemSuggested: place?.isSystemSuggested ?? false,
      createdBy:
        place?.createdBy ??
        (input.createdById ? ({ id: input.createdById } as User) : null),
    });

    return this.placeRepo.save(next);
  }

  async findById(id: number): Promise<Place | null> {
    return this.placeRepo.findOne({ where: { id } });
  }

  async getCommunityCandidates(
    latitude: number,
    longitude: number,
    radius: number,
    query?: string,
  ): Promise<any[]> {
    const normalizedQuery = this.normalizeName(query || '');
    const stats = await this.statsRepo.find({
      relations: ['place'],
      where: {},
    });

    return stats
      .filter(
        (stat) =>
          stat.checkinCount >= 3 &&
          stat.place?.status === PlaceStatus.ACTIVE &&
          !stat.place?.deletedAt,
      )
      .map((stat) => ({
        place: stat.place,
        stats: stat,
        distance: this.distanceMeters(
          latitude,
          longitude,
          stat.place.latitude,
          stat.place.longitude,
        ),
      }))
      .filter((item) => item.distance <= radius)
      .filter(
        (item) =>
          !normalizedQuery ||
          item.place.normalizedName.includes(normalizedQuery) ||
          (item.place.address || '').toLowerCase().includes(normalizedQuery),
      );
  }

  toRecommendationPlace(place: Place, distance: number, stats?: any) {
    return {
      id: `local:${place.id}`,
      placeId: place.id,
      displayName: { text: place.name },
      formattedAddress: place.address,
      location: {
        latitude: place.latitude,
        longitude: place.longitude,
      },
      types: place.categories || [],
      distance,
      rating: stats?.avgRating ?? null,
      priceLevel: 'PRICE_LEVEL_UNSPECIFIED',
      aggregateStats: stats
        ? {
            checkinCount: stats.checkinCount,
            avgRating: stats.avgRating,
            avgAmount: stats.avgAmount,
            minAmount: stats.minAmount,
            maxAmount: stats.maxAmount,
            returnIntentRate: stats.returnIntentRate,
            popularTags: stats.popularTags || [],
          }
        : null,
    };
  }

  distanceMeters(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const earthRadius = 6371000;
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) ** 2;
    return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  normalizeName(value: string): string {
    return (value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  private getFallbackFoodQuery(query?: string): string | null {
    const normalized = this.normalizeName(query || '');
    const foodTerms = new Map<string, string>([
      ['com', 'quán cơm'],
      ['pho', 'quán phở'],
      ['bun', 'quán bún'],
      ['mien', 'quán miến'],
      ['chao', 'quán cháo'],
      ['banh mi', 'bánh mì'],
      ['lau', 'quán lẩu'],
      ['nuong', 'quán nướng'],
    ]);

    return foodTerms.get(normalized) ?? null;
  }

  private async searchLocal(
    dto: SearchPlacesDto,
    radius: number,
  ): Promise<any[]> {
    const normalizedQuery = this.normalizeName(dto.query || '');
    const places = await this.placeRepo.find({
      where: { status: PlaceStatus.ACTIVE },
      take: 200,
    });

    return places
      .map((place) => ({
        place,
        distance: this.distanceMeters(
          dto.latitude,
          dto.longitude,
          place.latitude,
          place.longitude,
        ),
      }))
      .filter((item) => item.distance <= radius)
      .filter(
        (item) =>
          !normalizedQuery ||
          item.place.normalizedName.includes(normalizedQuery) ||
          (item.place.address || '').toLowerCase().includes(normalizedQuery),
      )
      .map((item) => ({
        source: 'local',
        placeId: item.place.id,
        provider: item.place.provider,
        providerPlaceId: item.place.providerPlaceId,
        name: item.place.name,
        address: item.place.address,
        latitude: item.place.latitude,
        longitude: item.place.longitude,
        categories: item.place.categories || [],
        isSystemSuggested: item.place.isSystemSuggested,
        distance: item.distance,
      }));
  }

  private async searchGoong(
    dto: SearchPlacesDto,
    radius: number,
  ): Promise<any[]> {
    const apiKey =
      this.configService.get<string>('GOONG_API_KEY') ||
      this.configService.get<string>('GOONG_MAPS_API_KEY');
    if (!apiKey || !dto.query) return [];

    try {
      const response = await firstValueFrom(
        this.httpService.get(this.goongAutocompleteUrl, {
          params: {
            api_key: apiKey,
            input: dto.query,
            location: `${dto.latitude},${dto.longitude}`,
            radius,
          },
        }),
      );

      const predictions = Array.isArray(response.data?.predictions)
        ? response.data.predictions
        : [];

      const detailed = await Promise.all(
        predictions
          .slice(0, 10)
          .map((prediction) =>
            this.normalizeGoongPrediction(prediction, apiKey, dto),
          ),
      );

      return detailed
        .filter(Boolean)
        .filter((place) => place.distance <= radius);
    } catch (error) {
      this.logger.warn(
        `Goong autocomplete failed for "${dto.query}": ${this.getErrorMessage(error)}`,
      );
      return [];
    }
  }

  private async normalizeGoongPrediction(
    prediction: any,
    apiKey: string,
    dto: SearchPlacesDto,
  ): Promise<any | null> {
    const placeId = prediction.place_id;
    if (!placeId) return null;

    try {
      const detail = await firstValueFrom(
        this.httpService.get(this.goongDetailUrl, {
          params: {
            api_key: apiKey,
            place_id: placeId,
          },
        }),
      );
      const result = detail.data?.result;
      const location = result?.geometry?.location;
      if (
        typeof location?.lat !== 'number' ||
        typeof location?.lng !== 'number'
      ) {
        return null;
      }

      return {
        source: 'goong',
        provider: 'goong',
        providerPlaceId: placeId,
        name:
          result.name ||
          prediction.structured_formatting?.main_text ||
          prediction.description,
        address: result.formatted_address || prediction.description,
        latitude: location.lat,
        longitude: location.lng,
        categories: Array.isArray(result.types) ? result.types : [],
        distance: this.distanceMeters(
          dto.latitude,
          dto.longitude,
          location.lat,
          location.lng,
        ),
      };
    } catch (error) {
      this.logger.warn(
        `Goong detail failed for place "${placeId}": ${this.getErrorMessage(error)}`,
      );
      return null;
    }
  }

  private mergePlaces(places: any[]): any[] {
    const seen = new Set<string>();
    return places.filter((place) => {
      const key = place.providerPlaceId
        ? `${place.provider}:${place.providerPlaceId}`
        : `${this.normalizeName(place.name)}:${Math.round(place.latitude * 10000)}:${Math.round(place.longitude * 10000)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private toRadians(value: number): number {
    return (value * Math.PI) / 180;
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }
}
