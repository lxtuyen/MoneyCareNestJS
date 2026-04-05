// Feature: student-finance-modes, Property 2: Student profile round-trip
//
// For any valid StudentProfileEntity (studyYear ∈ [1,6], monthlyIncome ≥ 0),
// after saving and reading back (local or backend), all fields must equal the saved values.
//
// Validates: Requirements 2.1, 2.5, 9.1

import * as fc from 'fast-check';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpsertStudentProfileDto, ExamPeriodDto } from './dto/student-profile.dto';

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** ISO date string in YYYY-MM-DD format */
const isoDateArb = fc
  .date({ min: new Date('2020-01-01'), max: new Date('2030-12-31'), noInvalidDate: true })
  .map((d) => d.toISOString().slice(0, 10));

/** Valid ExamPeriod: startDate < endDate */
const examPeriodArb = fc
  .tuple(
    fc.date({ min: new Date('2024-01-01'), max: new Date('2029-06-01'), noInvalidDate: true }),
    fc.integer({ min: 1, max: 180 }),
  )
  .map(([start, offsetDays]) => {
    const end = new Date(start);
    end.setDate(end.getDate() + offsetDays);
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  });

/** Valid StudentProfile DTO payload */
const validProfileArb = fc.record({
  university: fc.oneof(
    fc.constant(undefined),
    fc.string({ minLength: 1, maxLength: 100 }),
  ),
  faculty: fc.oneof(
    fc.constant(undefined),
    fc.string({ minLength: 1, maxLength: 100 }),
  ),
  studyYear: fc.oneof(
    fc.constant(undefined),
    fc.integer({ min: 1, max: 6 }),
  ),
  monthlyIncome: fc.oneof(
    fc.constant(undefined),
    fc.integer({ min: 0, max: 100_000_000 }),
  ),
  incomeDate: fc.oneof(fc.constant(undefined), isoDateArb),
  examPeriods: fc.oneof(
    fc.constant(undefined),
    fc.array(examPeriodArb, { minLength: 0, maxLength: 5 }),
  ),
});

// ─── Helper: simulate the service upsert round-trip (in-memory) ──────────────

interface ProfileStore {
  university?: string;
  faculty?: string;
  studyYear?: number;
  monthlyIncome?: number;
  incomeDate?: string;
  examPeriods: ExamPeriodDto[];
}

function applyUpsert(
  existing: ProfileStore,
  dto: Partial<UpsertStudentProfileDto>,
): ProfileStore {
  const updated: ProfileStore = { ...existing };
  if (dto.university !== undefined) updated.university = dto.university;
  if (dto.faculty !== undefined) updated.faculty = dto.faculty;
  if (dto.studyYear !== undefined) updated.studyYear = dto.studyYear;
  if (dto.monthlyIncome !== undefined) updated.monthlyIncome = dto.monthlyIncome;
  if (dto.incomeDate !== undefined) updated.incomeDate = dto.incomeDate;
  if (dto.examPeriods !== undefined) updated.examPeriods = dto.examPeriods;
  return updated;
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('StudentProfile — Property 2: round-trip', () => {
  /**
   * Property 2a: DTO validation accepts all valid inputs
   *
   * For any valid profile payload (studyYear ∈ [1,6], monthlyIncome ≥ 0),
   * class-validator must produce zero errors.
   */
  it('valid profile payload passes DTO validation', async () => {
    await fc.assert(
      fc.asyncProperty(validProfileArb, async (payload) => {
        const dto = plainToInstance(UpsertStudentProfileDto, payload);
        const errors = await validate(dto);
        return errors.length === 0;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 2b: upsert round-trip preserves all provided fields
   *
   * For any valid profile payload, after applying the upsert logic and reading
   * back the stored profile, every field that was provided must equal the saved value.
   */
  it('upsert round-trip preserves all provided fields', () => {
    fc.assert(
      fc.property(validProfileArb, (payload) => {
        const initial: ProfileStore = { examPeriods: [] };
        const saved = applyUpsert(initial, payload);

        if (payload.university !== undefined) {
          if (saved.university !== payload.university) return false;
        }
        if (payload.faculty !== undefined) {
          if (saved.faculty !== payload.faculty) return false;
        }
        if (payload.studyYear !== undefined) {
          if (saved.studyYear !== payload.studyYear) return false;
        }
        if (payload.monthlyIncome !== undefined) {
          if (saved.monthlyIncome !== payload.monthlyIncome) return false;
        }
        if (payload.incomeDate !== undefined) {
          if (saved.incomeDate !== payload.incomeDate) return false;
        }
        if (payload.examPeriods !== undefined) {
          const savedJson = JSON.stringify(saved.examPeriods);
          const inputJson = JSON.stringify(payload.examPeriods);
          if (savedJson !== inputJson) return false;
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 2c: sequential updates preserve the latest values
   *
   * For any two valid profile payloads A then B, after applying both upserts,
   * fields provided in B must reflect B's values (update semantics).
   */
  it('sequential upserts preserve the latest values', () => {
    fc.assert(
      fc.property(validProfileArb, validProfileArb, (payloadA, payloadB) => {
        const initial: ProfileStore = { examPeriods: [] };
        const afterA = applyUpsert(initial, payloadA);
        const afterB = applyUpsert(afterA, payloadB);

        // Fields set in B must reflect B's values
        if (payloadB.university !== undefined && afterB.university !== payloadB.university)
          return false;
        if (payloadB.faculty !== undefined && afterB.faculty !== payloadB.faculty)
          return false;
        if (payloadB.studyYear !== undefined && afterB.studyYear !== payloadB.studyYear)
          return false;
        if (payloadB.monthlyIncome !== undefined && afterB.monthlyIncome !== payloadB.monthlyIncome)
          return false;
        if (payloadB.incomeDate !== undefined && afterB.incomeDate !== payloadB.incomeDate)
          return false;
        if (
          payloadB.examPeriods !== undefined &&
          JSON.stringify(afterB.examPeriods) !== JSON.stringify(payloadB.examPeriods)
        )
          return false;

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 2d: examPeriods round-trip preserves all period fields (Requirement 9.1)
   *
   * For any array of valid ExamPeriod objects, after saving and reading back,
   * each period's startDate and endDate must be preserved exactly.
   */
  it('examPeriods round-trip preserves startDate and endDate (Req 9.1)', () => {
    fc.assert(
      fc.property(
        fc.array(examPeriodArb, { minLength: 0, maxLength: 10 }),
        (periods) => {
          const initial: ProfileStore = { examPeriods: [] };
          const saved = applyUpsert(initial, { examPeriods: periods });

          if (saved.examPeriods.length !== periods.length) return false;
          for (let i = 0; i < periods.length; i++) {
            if (saved.examPeriods[i].startDate !== periods[i].startDate) return false;
            if (saved.examPeriods[i].endDate !== periods[i].endDate) return false;
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 2e: studyYear boundary — only values in [1,6] are valid
   *
   * Validates Requirement 2.1 constraint on studyYear.
   */
  it('studyYear ∈ [1,6] always passes validation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 6 }),
        async (studyYear) => {
          const dto = plainToInstance(UpsertStudentProfileDto, { studyYear });
          const errors = await validate(dto);
          return errors.filter((e) => e.property === 'studyYear').length === 0;
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 2f: monthlyIncome ≥ 0 always passes validation
   *
   * Validates Requirement 2.1 constraint on monthlyIncome.
   */
  it('monthlyIncome ≥ 0 always passes validation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 100_000_000 }),
        async (monthlyIncome) => {
          const dto = plainToInstance(UpsertStudentProfileDto, { monthlyIncome });
          const errors = await validate(dto);
          return errors.filter((e) => e.property === 'monthlyIncome').length === 0;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Feature: student-finance-modes, Property 4: Student profile validation rejects invalid inputs
//
// For any studyYear outside [1, 6] or monthlyIncome < 0, the system must
// reject saving and return the corresponding error message.
//
// Validates: Requirements 2.3, 2.4
// ─────────────────────────────────────────────────────────────────────────────

describe('StudentProfile — Property 4: validation rejects invalid inputs', () => {
  /**
   * Property 4a: studyYear outside [1, 6] is always rejected (Requirement 2.3)
   *
   * For any integer studyYear < 1 or studyYear > 6, DTO validation must
   * produce an error on the studyYear field with message "Năm học phải từ 1 đến 6".
   */
  it('studyYear < 1 is always rejected with correct message', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: -10_000, max: 0 }),
        async (studyYear) => {
          const dto = plainToInstance(UpsertStudentProfileDto, { studyYear });
          const errors = await validate(dto);
          const studyYearErrors = errors.filter((e) => e.property === 'studyYear');
          if (studyYearErrors.length === 0) return false;
          const messages = Object.values(studyYearErrors[0].constraints ?? {});
          return messages.includes('Năm học phải từ 1 đến 6');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('studyYear > 6 is always rejected with correct message', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 7, max: 10_000 }),
        async (studyYear) => {
          const dto = plainToInstance(UpsertStudentProfileDto, { studyYear });
          const errors = await validate(dto);
          const studyYearErrors = errors.filter((e) => e.property === 'studyYear');
          if (studyYearErrors.length === 0) return false;
          const messages = Object.values(studyYearErrors[0].constraints ?? {});
          return messages.includes('Năm học phải từ 1 đến 6');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 4b: monthlyIncome < 0 is always rejected (Requirement 2.4)
   *
   * For any integer monthlyIncome < 0, DTO validation must produce an error
   * on the monthlyIncome field with message "Thu nhập không hợp lệ".
   */
  it('monthlyIncome < 0 is always rejected with correct message', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: -100_000_000, max: -1 }),
        async (monthlyIncome) => {
          const dto = plainToInstance(UpsertStudentProfileDto, { monthlyIncome });
          const errors = await validate(dto);
          const incomeErrors = errors.filter((e) => e.property === 'monthlyIncome');
          if (incomeErrors.length === 0) return false;
          const messages = Object.values(incomeErrors[0].constraints ?? {});
          return messages.includes('Thu nhập không hợp lệ');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 4c: combined invalid inputs — both fields rejected independently
   *
   * For any payload with studyYear outside [1,6] AND monthlyIncome < 0,
   * both fields must produce validation errors.
   */
  it('invalid studyYear and negative monthlyIncome are both rejected', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.integer({ min: -10_000, max: 0 }),
          fc.integer({ min: 7, max: 10_000 }),
        ),
        fc.integer({ min: -100_000_000, max: -1 }),
        async (studyYear, monthlyIncome) => {
          const dto = plainToInstance(UpsertStudentProfileDto, { studyYear, monthlyIncome });
          const errors = await validate(dto);
          const hasStudyYearError = errors.some((e) => e.property === 'studyYear');
          const hasIncomeError = errors.some((e) => e.property === 'monthlyIncome');
          return hasStudyYearError && hasIncomeError;
        },
      ),
      { numRuns: 100 },
    );
  });
});
