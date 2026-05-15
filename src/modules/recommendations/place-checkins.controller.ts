import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { User } from 'src/common/decorators/user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreatePlaceCheckinDto } from './dto/create-place-checkin.dto';
import { UpdatePlaceCheckinDto } from './dto/update-place-checkin.dto';
import { PlaceCheckinsService } from './place-checkins.service';

@ApiTags('Place Check-ins')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('place-checkins')
export class PlaceCheckinsController {
  constructor(private readonly checkinsService: PlaceCheckinsService) {}

  @Post()
  create(@User('sub') userId: number, @Body() dto: CreatePlaceCheckinDto) {
    return this.checkinsService.create(userId, dto);
  }

  @Get()
  findMine(@User('sub') userId: number) {
    return this.checkinsService.findMine(userId);
  }

  @Patch(':id')
  update(
    @User('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePlaceCheckinDto,
  ) {
    return this.checkinsService.update(userId, id, dto);
  }

  @Delete(':id')
  remove(@User('sub') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.checkinsService.remove(userId, id);
  }
}
