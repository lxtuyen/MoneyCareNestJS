import { Injectable, NotFoundException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserListDto } from './dto/user-list.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async updateUser(
    userId: number,
    dto: UpdateUserDto,
  ): Promise<ApiResponse<UserListDto>> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    let hasChange = false;

    if (dto.role !== undefined && dto.role !== user.role) {
      user.role = dto.role;
      hasChange = true;
    }

    if (!hasChange) {
      return new ApiResponse<User>({
        success: true,
        statusCode: HttpStatus.OK,
        message: 'No changes detected',
        data: user,
      });
    }

    const updatedUser = await this.userRepo.save(user);

    return new ApiResponse<User>({
      success: true,
      statusCode: HttpStatus.OK,
      message: 'User updated successfully',
      data: updatedUser,
    });
  }
}
