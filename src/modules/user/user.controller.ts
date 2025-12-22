import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import { UserService } from './user.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('total')
  getTotalUsers() {
    return this.userService.getTotalUsers();
  }

  @Get()
  getListUsers() {
    return this.userService.listUsers();
  }

  @Get('new-this-month')
  getNewUsersThisMonth() {
    return this.userService.getNewUsersThisMonth();
  }

  @Get('type-percentage')
  getUserTypePercentage() {
    return this.userService.getUserTypePercentage();
  }

  @Get('admin/stats')
  getAdminUserStats() {
    return this.userService.getAdminUserStats();
  }

  @Patch(':userId')
  updateUser(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateUserDto,
  ) {
    return this.userService.updateUser(userId, dto);
  }
}
