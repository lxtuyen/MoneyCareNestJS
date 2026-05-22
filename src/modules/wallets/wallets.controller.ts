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
} from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { UpdateWalletDto, TransferDto } from './dto/wallet.dto';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';

@Controller('wallets')
@UseGuards(JwtAuthGuard)
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Post()
  async create(@Request() req) {
    return this.walletsService.create(req.user);
  }

  @Post('transfer')
  async transfer(@Body() transferDto: TransferDto, @Request() req) {
    return this.walletsService.transfer(transferDto, req.user);
  }

  @Get()
  async findAll(@Request() req) {
    return this.walletsService.findAll(req.user);
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
