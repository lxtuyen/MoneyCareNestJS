import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GetNearbyRecommendationsDto {
  @ApiProperty({ example: 10.762622 })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({ example: 106.660172 })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsNumber()
  categoryId?: number;

  @ApiProperty({
    example: 1000,
    required: false,
    description: 'Radius in meters',
  })
  @IsOptional()
  @IsNumber()
  radius?: number;

  @ApiProperty({ example: 'PRICE_LEVEL_MODERATE', required: false })
  @IsOptional()
  @IsString()
  maxPrice?: string;

  @ApiProperty({ example: 50000, required: false })
  @IsOptional()
  @IsNumber()
  budgetMax?: number;

  @ApiProperty({ example: ['com tam', 'quan an'], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];
}
