import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ResolveLocationDto } from './dto/resolve-location.dto';
import { SearchPlacesDto } from './dto/search-places.dto';
import { PlacesService } from './places.service';

@ApiTags('Places')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('places')
export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

  @Post('search')
  search(@Body() dto: SearchPlacesDto) {
    return this.placesService.search(dto);
  }

  @Post('resolve-location')
  resolveLocation(@Body() dto: ResolveLocationDto) {
    return this.placesService.resolveLocation(dto);
  }
}
