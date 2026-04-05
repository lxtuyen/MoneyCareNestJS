import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentProfile } from './entities/student-profile.entity';
import { UpsertStudentProfileDto } from './dto/student-profile.dto';
import { ApiResponse } from 'src/common/dto/api-response.dto';

@Injectable()
export class StudentProfileService {
  constructor(
    @InjectRepository(StudentProfile)
    private readonly studentProfileRepo: Repository<StudentProfile>,
  ) {}

  async getByUserId(userId: number): Promise<ApiResponse<StudentProfile>> {
    let profile = await this.studentProfileRepo.findOne({
      where: { userId },
    });

    if (!profile) {
      profile = this.studentProfileRepo.create({ userId, examPeriods: [] });
      profile = await this.studentProfileRepo.save(profile);
    }

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: profile,
    });
  }

  async upsert(
    userId: number,
    dto: UpsertStudentProfileDto,
  ): Promise<ApiResponse<StudentProfile>> {
    let profile = await this.studentProfileRepo.findOne({
      where: { userId },
    });

    if (!profile) {
      profile = this.studentProfileRepo.create({ userId, examPeriods: [] });
    }

    if (dto.university !== undefined) profile.university = dto.university;
    if (dto.faculty !== undefined) profile.faculty = dto.faculty;
    if (dto.studyYear !== undefined) profile.studyYear = dto.studyYear;
    if (dto.monthlyIncome !== undefined) profile.monthlyIncome = dto.monthlyIncome;
    if (dto.incomeDate !== undefined) profile.incomeDate = dto.incomeDate;
    if (dto.examPeriods !== undefined) profile.examPeriods = dto.examPeriods;

    const saved = await this.studentProfileRepo.save(profile);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Cập nhật hồ sơ sinh viên thành công',
      data: saved,
    });
  }
}
