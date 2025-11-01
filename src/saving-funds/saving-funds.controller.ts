import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { SavingFundsService } from './saving-funds.service';
import { CreateSavingFundDto } from './dto/create-saving-fund.dto';
import { UpdateSavingFundDto } from './dto/update-saving-fund.dto';

@Controller('saving-funds')
export class SavingFundsController {
  constructor(private readonly savingFundsService: SavingFundsService) {}

  @Post()
  create(@Body() createSavingFundDto: CreateSavingFundDto) {
    return this.savingFundsService.create(createSavingFundDto);
  }

  @Get()
  findAll() {
    return this.savingFundsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.savingFundsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateSavingFundDto: UpdateSavingFundDto) {
    return this.savingFundsService.update(+id, updateSavingFundDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.savingFundsService.remove(+id);
  }
}
