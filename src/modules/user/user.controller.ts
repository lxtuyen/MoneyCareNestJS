import { Controller, Patch, UseGuards } from '@nestjs/common';
import { User as CurrentUser } from 'src/common/decorators/user.decorator';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { UserService } from './user.service';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Patch('me/initial-financial-setup/complete')
  @UseGuards(JwtAuthGuard)
  completeInitialFinancialSetup(@CurrentUser('sub') userId: number) {
    return this.userService.completeInitialFinancialSetup(userId);
  }
}
