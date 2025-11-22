import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SavingFund } from './entities/saving-fund.entity';
import { UpdateSavingFundDto } from './dto/update-saving-fund.dto';
import { User } from 'src/user/entities/user.entity';
import { CreateSavingFundDto } from './dto/create-saving-fund.dto';
import { Category } from 'src/categories/entities/category.entity';
import { SavingFundResponseDto } from './dto/saving-fund-response.dto';
import { plainToInstance } from 'class-transformer';
import { ApiResponse } from 'src/common/dto/api-response.dto';

@Injectable()
export class SavingFundsService {
  constructor(
    @InjectRepository(SavingFund)
    private readonly savingFundRepo: Repository<SavingFund>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Category)
    private categoryRepo: Repository<Category>,
  ) {}

  async create(
    dto: CreateSavingFundDto,
  ): Promise<ApiResponse<SavingFundResponseDto>> {
    const user = await this.userRepo.findOne({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('User not found');

    const fund = this.savingFundRepo.create({
      name: dto.name,
      user,
    });

    const savedFund = await this.savingFundRepo.save(fund);

    if (dto.categories?.length) {
      const categories = dto.categories.map((cat) =>
        this.categoryRepo.create({
          ...cat,
          savingFund: savedFund,
        }),
      );

      await this.categoryRepo.save(categories);
      savedFund.categories = categories;
    }

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: plainToInstance(SavingFundResponseDto, savedFund),
    });
  }

  async findAllByUser(userId: number): Promise<ApiResponse<SavingFund[]>> {
    const funds = await this.savingFundRepo.find({
      where: { user: { id: userId } },
      relations: ['categories'],
    });

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: funds,
    });
  }

  async findOne(id: number): Promise<ApiResponse<SavingFund>> {
    const fund = await this.savingFundRepo.findOne({
      where: { id },
      relations: ['categories'],
    });

    if (!fund) throw new NotFoundException('Saving fund not found');

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: fund,
    });
  }

  async update(
    id: number,
    dto: UpdateSavingFundDto,
  ): Promise<ApiResponse<SavingFund>> {
    const fund = await this.savingFundRepo.findOne({
      where: { id },
      relations: ['categories'],
    });

    if (!fund) throw new NotFoundException('Saving fund not found');

    fund.name = dto.name ?? fund.name;
    fund.is_selected = dto.is_selected ?? fund.is_selected;

    if (dto.categories) {
      for (const catDto of dto.categories) {
        if (catDto.id) {
          await this.categoryRepo.update(catDto.id, {
            name: catDto.name,
            icon: catDto.icon,
            percentage: catDto.percentage,
          });
        } else {
          const newCat = this.categoryRepo.create({
            ...catDto,
            savingFund: fund,
          });
          await this.categoryRepo.save(newCat);
        }
      }

      fund.categories = await this.categoryRepo.find({
        where: { savingFund: { id: fund.id } },
      });
    }

    const updated = await this.savingFundRepo.save(fund);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: updated,
    });
  }

  private async findOneEntity(id: number): Promise<SavingFund> {
    const fund = await this.savingFundRepo.findOne({
      where: { id },
      relations: ['categories'],
    });

    if (!fund) {
      throw new NotFoundException('Saving fund not found');
    }

    return fund;
  }

  async remove(id: number): Promise<ApiResponse<string>> {
    const fund = await this.findOneEntity(id);

    await this.savingFundRepo.remove(fund);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: 'Deleted successfully',
    });
  }

  async selectSavingFund(
    userId: number,
    fundId: number,
  ): Promise<ApiResponse<SavingFund>> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.savingFundRepo.update(
      { user: { id: userId } },
      { is_selected: false },
    );

    const fund = await this.savingFundRepo.findOne({
      where: { id: fundId, user: { id: userId } },
      relations: ['categories', 'user'],
    });

    if (!fund) throw new NotFoundException('Saving fund not found');

    fund.is_selected = true;
    const updated = await this.savingFundRepo.save(fund);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: updated,
    });
  }
}
