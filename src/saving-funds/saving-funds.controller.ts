import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
} from '@nestjs/common';
import { SavingFundsService } from './saving-funds.service';
import { CreateSavingFundDto } from './dto/create-saving-fund.dto';
import { UpdateSavingFundDto } from './dto/update-saving-fund.dto';
import { SavingFundResponseDto } from './dto/saving-fund-response.dto';
import { ApiResponse } from '@nestjs/swagger';

@Controller('saving-funds')
export class SavingFundsController {
  constructor(private readonly savingFundsService: SavingFundsService) {}

  @Post()
  @ApiResponse({ type: SavingFundResponseDto })
  create(@Body() dto: CreateSavingFundDto) {
    return this.savingFundsService.create(dto);
  }

  @Get('user/:userId')
  @ApiResponse({ type: [SavingFundResponseDto] })
  findAllByUser(@Param('userId') userId: number) {
    return this.savingFundsService.findAllByUser(userId);
  }

  @Get(':id')
  @ApiResponse({ type: SavingFundResponseDto })
  findOne(@Param('id') id: number) {
    return this.savingFundsService.findOne(id);
  }

  @Patch(':id')
  @ApiResponse({ type: SavingFundResponseDto })
  update(@Param('id') id: number, @Body() dto: UpdateSavingFundDto) {
    return this.savingFundsService.update(+id, dto);
  }

  @Delete(':id')
  @ApiResponse({ type: SavingFundResponseDto })
  remove(@Param('id') id: number) {
    return this.savingFundsService.remove(+id);
  }
}
