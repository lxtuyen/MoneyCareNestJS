import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpsertStudentProfileDto } from './dto/student-profile.dto';

/**
 * Unit tests for StudentProfile DTO validation
 * Requirements: 2.3, 2.4
 *
 * The validation is enforced via class-validator decorators on UpsertStudentProfileDto,
 * which NestJS's ValidationPipe applies at the controller boundary.
 * These tests verify the validation rules directly on the DTO.
 */
describe('StudentProfile DTO Validation', () => {
  async function validateDto(plain: object) {
    const dto = plainToInstance(UpsertStudentProfileDto, plain);
    return validate(dto);
  }

  // ─── studyYear validation (Requirement 2.3) ───────────────────────────────

  describe('studyYear validation', () => {
    it('should accept studyYear = 1 (lower bound)', async () => {
      const errors = await validateDto({ studyYear: 1 });
      expect(errors).toHaveLength(0);
    });

    it('should accept studyYear = 6 (upper bound)', async () => {
      const errors = await validateDto({ studyYear: 6 });
      expect(errors).toHaveLength(0);
    });

    it('should accept studyYear values within [1, 6]', async () => {
      for (const year of [2, 3, 4, 5]) {
        const errors = await validateDto({ studyYear: year });
        expect(errors).toHaveLength(0);
      }
    });

    it('should reject studyYear = 0 (below minimum)', async () => {
      const errors = await validateDto({ studyYear: 0 });
      const studyYearErrors = errors.filter((e) => e.property === 'studyYear');
      expect(studyYearErrors.length).toBeGreaterThan(0);
      const messages = Object.values(studyYearErrors[0].constraints ?? {});
      expect(messages).toContain('Năm học phải từ 1 đến 6');
    });

    it('should reject studyYear = 7 (above maximum)', async () => {
      const errors = await validateDto({ studyYear: 7 });
      const studyYearErrors = errors.filter((e) => e.property === 'studyYear');
      expect(studyYearErrors.length).toBeGreaterThan(0);
      const messages = Object.values(studyYearErrors[0].constraints ?? {});
      expect(messages).toContain('Năm học phải từ 1 đến 6');
    });

    it('should reject studyYear = -1 (negative)', async () => {
      const errors = await validateDto({ studyYear: -1 });
      const studyYearErrors = errors.filter((e) => e.property === 'studyYear');
      expect(studyYearErrors.length).toBeGreaterThan(0);
      const messages = Object.values(studyYearErrors[0].constraints ?? {});
      expect(messages).toContain('Năm học phải từ 1 đến 6');
    });

    it('should reject studyYear = 100 (far above maximum)', async () => {
      const errors = await validateDto({ studyYear: 100 });
      const studyYearErrors = errors.filter((e) => e.property === 'studyYear');
      expect(studyYearErrors.length).toBeGreaterThan(0);
      const messages = Object.values(studyYearErrors[0].constraints ?? {});
      expect(messages).toContain('Năm học phải từ 1 đến 6');
    });

    it('should allow omitting studyYear (field is optional)', async () => {
      const errors = await validateDto({ university: 'HUST' });
      const studyYearErrors = errors.filter((e) => e.property === 'studyYear');
      expect(studyYearErrors).toHaveLength(0);
    });
  });

  // ─── monthlyIncome validation (Requirement 2.4) ───────────────────────────

  describe('monthlyIncome validation', () => {
    it('should accept monthlyIncome = 0 (minimum valid)', async () => {
      const errors = await validateDto({ monthlyIncome: 0 });
      expect(errors).toHaveLength(0);
    });

    it('should accept positive monthlyIncome values', async () => {
      for (const income of [1, 1000, 5_000_000, 100_000_000]) {
        const errors = await validateDto({ monthlyIncome: income });
        expect(errors).toHaveLength(0);
      }
    });

    it('should reject monthlyIncome = -1', async () => {
      const errors = await validateDto({ monthlyIncome: -1 });
      const incomeErrors = errors.filter((e) => e.property === 'monthlyIncome');
      expect(incomeErrors.length).toBeGreaterThan(0);
      const messages = Object.values(incomeErrors[0].constraints ?? {});
      expect(messages).toContain('Thu nhập không hợp lệ');
    });

    it('should reject monthlyIncome = -100', async () => {
      const errors = await validateDto({ monthlyIncome: -100 });
      const incomeErrors = errors.filter((e) => e.property === 'monthlyIncome');
      expect(incomeErrors.length).toBeGreaterThan(0);
      const messages = Object.values(incomeErrors[0].constraints ?? {});
      expect(messages).toContain('Thu nhập không hợp lệ');
    });

    it('should reject large negative monthlyIncome', async () => {
      const errors = await validateDto({ monthlyIncome: -999_999_999 });
      const incomeErrors = errors.filter((e) => e.property === 'monthlyIncome');
      expect(incomeErrors.length).toBeGreaterThan(0);
      const messages = Object.values(incomeErrors[0].constraints ?? {});
      expect(messages).toContain('Thu nhập không hợp lệ');
    });

    it('should allow omitting monthlyIncome (field is optional)', async () => {
      const errors = await validateDto({ university: 'HUST' });
      const incomeErrors = errors.filter((e) => e.property === 'monthlyIncome');
      expect(incomeErrors).toHaveLength(0);
    });
  });

  // ─── Combined valid payload ────────────────────────────────────────────────

  describe('valid full payload', () => {
    it('should accept a complete valid profile', async () => {
      const errors = await validateDto({
        university: 'Đại học Bách Khoa Hà Nội',
        faculty: 'Công nghệ thông tin',
        studyYear: 3,
        monthlyIncome: 3_000_000,
        incomeDate: '2024-01-15',
        examPeriods: [{ startDate: '2024-06-01', endDate: '2024-06-30' }],
      });
      expect(errors).toHaveLength(0);
    });

    it('should accept an empty payload (all fields optional)', async () => {
      const errors = await validateDto({});
      expect(errors).toHaveLength(0);
    });
  });
});
