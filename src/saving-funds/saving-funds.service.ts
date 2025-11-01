import { Injectable } from '@nestjs/common';
import { CreateSavingFundDto } from './dto/create-saving-fund.dto';
import { UpdateSavingFundDto } from './dto/update-saving-fund.dto';

@Injectable()
export class SavingFundsService {
  create(createSavingFundDto: CreateSavingFundDto) {
    return 'This action adds a new savingFund';
  }

  findAll() {
    return `This action returns all savingFunds`;
  }

  findOne(id: number) {
    return `This action returns a #${id} savingFund`;
  }

  update(id: number, updateSavingFundDto: UpdateSavingFundDto) {
    return `This action updates a #${id} savingFund`;
  }

  remove(id: number) {
    return `This action removes a #${id} savingFund`;
  }
}
