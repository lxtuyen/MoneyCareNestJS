import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { StudentProfileService } from './student-profile.service';
import { UpsertStudentProfileDto } from './dto/student-profile.dto';
import { User } from 'src/common/decorators/user.decorator';

@Controller('student-profile')
@UseGuards(JwtAuthGuard)
export class StudentProfileController {
  constructor(private readonly studentProfileService: StudentProfileService) {}

  @Get()
  getMyProfile(@User('sub') userId: number) {
    return this.studentProfileService.getByUserId(userId);
  }

  @Put()
  upsertMyProfile(
    @User('sub') userId: number,
    @Body() dto: UpsertStudentProfileDto,
  ) {
    return this.studentProfileService.upsert(userId, dto);
  }
}
