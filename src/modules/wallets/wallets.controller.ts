import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { WalletsService } from './wallets.service';
import {
  UpdateWalletDto,
  TransferDto,
  CreateWalletDto,
} from './dto/wallet.dto';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';

@Controller('wallets')
@UseGuards(JwtAuthGuard)
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Post()
  async create(@Body() createWalletDto: CreateWalletDto, @Request() req) {
    return this.walletsService.create(req.user, createWalletDto);
  }

  @Post('transfer')
  async transfer(@Body() transferDto: TransferDto, @Request() req) {
    return this.walletsService.transfer(transferDto, req.user);
  }

  @Get()
  async findAll(@Request() req, @Query('coupleId') coupleId?: string) {
    return this.walletsService.findAll(
      req.user,
      coupleId ? +coupleId : undefined,
    );
  }

  @Get('total-assets')
  async getTotalAssets(@Request() req) {
    return this.walletsService.getTotalAssets(req.user);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req) {
    return this.walletsService.findOne(+id, req.user);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateWalletDto: UpdateWalletDto,
    @Request() req,
  ) {
    return this.walletsService.update(+id, updateWalletDto, req.user);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req) {
    return this.walletsService.remove(+id, req.user);
  }
}
