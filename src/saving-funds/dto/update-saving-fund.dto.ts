import { PartialType } from '@nestjs/swagger';
import { CreateSavingFundDto } from './create-saving-fund.dto';

export class UpdateSavingFundDto extends PartialType(CreateSavingFundDto) {}
