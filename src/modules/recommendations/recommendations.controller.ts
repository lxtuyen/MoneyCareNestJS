import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RecommendationsService } from './recommendations.service';
import { GetNearbyRecommendationsDto } from './dto/get-nearby-recommendations.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { User } from 'src/common/decorators/user.decorator';

@ApiTags('Recommendations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('recommendations')
export class RecommendationsController {
  constructor(
    private readonly recommendationsService: RecommendationsService,
  ) {}

  @Post('nearby')
  @ApiOperation({ summary: 'Lấy đề xuất các địa điểm gần đây' })
  getNearby(
    @User('sub') userId: number,
    @Body() dto: GetNearbyRecommendationsDto,
  ) {
    return this.recommendationsService.getNearby(dto, userId);
  }
}
