import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class SearchPlacesDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-90)
  @Max(90)
  latitude: number;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-180)
  @Max(180)
  longitude: number;

  @IsOptional()
  @IsNumber()
  radius?: number;
}
