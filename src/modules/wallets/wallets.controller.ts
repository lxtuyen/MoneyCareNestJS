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
  HttpStatus,
} from '@nestjs/common';
import { WalletsService } from './wallets.service';
import {
  CreateWalletDto,
  UpdateWalletDto,
  TransferDto,
} from './dto/wallet.dto';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { ApiResponse } from 'src/common/dto/api-response.dto';

@Controller('wallets')
@UseGuards(JwtAuthGuard)
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Post()
  async create(@Body() createWalletDto: CreateWalletDto, @Request() req) {
    const wallet = await this.walletsService.create(createWalletDto, req.user);
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.CREATED,
      data: wallet,
      message: 'Tạo ví thành công',
    });
  }

  @Post('transfer')
  async transfer(@Body() transferDto: TransferDto, @Request() req) {
    await this.walletsService.transfer(transferDto, req.user);
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Chuyển khoản thành công',
    });
  }

  @Get()
  async findAll(@Request() req) {
    const wallets = await this.walletsService.findAll(req.user);
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: wallets,
    });
  }

  @Get('total-assets')
  async getTotalAssets(@Request() req) {
    const total = await this.walletsService.getTotalAssets(req.user);
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: total,
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req) {
    const wallet = await this.walletsService.findOne(+id, req.user);
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: wallet,
    });
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateWalletDto: UpdateWalletDto,
    @Request() req,
  ) {
    const wallet = await this.walletsService.update(
      +id,
      updateWalletDto,
      req.user,
    );
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: wallet,
      message: 'Cập nhật ví thành công',
    });
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req) {
    await this.walletsService.remove(+id, req.user);
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Xóa ví thành công',
    });
  }
}
