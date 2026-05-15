import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class PlacePayloadDto {
  @IsOptional()
  @IsNumber()
  id?: number;

  @IsOptional()
  @IsString()
  @IsIn(['goong', 'manual'])
  provider?: string;

  @IsOptional()
  @IsString()
  providerPlaceId?: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-90)
  @Max(90)
  latitude: number;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-180)
  @Max(180)
  longitude: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];
}

export class CreatePlaceCheckinDto {
  @IsNumber()
  transactionId: number;

  @IsOptional()
  @IsNumber()
  placeId?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => PlacePayloadDto)
  place?: PlacePayloadDto;

  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @IsBoolean()
  wantToReturn: boolean;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsDateString()
  visitedAt?: string;
}
