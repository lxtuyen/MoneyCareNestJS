import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { AdminGuard } from 'src/common/guards/admin.guard';
import { UserService } from './user.service';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminUsersController {
  constructor(private readonly userService: UserService) {}

  @Get('users')
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.userService.findAllForAdmin(
      Number(page) || 1,
      Number(limit) || 20,
      search,
    );
  }

  @Get('stats')
  getStats() {
    return this.userService.getAdminStats();
  }

  @Get('chart-data')
  getChartData() {
    return this.userService.getAdminChartData();
  }
}
