import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from '../categories/entities/category.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { PlaceCheckinsController } from './place-checkins.controller';
import { PlaceCheckinsService } from './place-checkins.service';
import { PlacesController } from './places.controller';
import { PlacesService } from './places.service';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';
import { PlaceAggregateStats } from './entities/place-aggregate-stats.entity';
import { PlaceCheckin } from './entities/place-checkin.entity';
import { Place } from './entities/place.entity';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    TypeOrmModule.forFeature([
      Category,
      Transaction,
      Place,
      PlaceCheckin,
      PlaceAggregateStats,
    ]),
  ],
  controllers: [
    RecommendationsController,
    PlacesController,
    PlaceCheckinsController,
  ],
  providers: [RecommendationsService, PlacesService, PlaceCheckinsService],
  exports: [RecommendationsService, PlacesService, PlaceCheckinsService],
})
export class RecommendationsModule {}
