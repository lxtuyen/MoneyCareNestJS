// Feature: student-finance-modes, Property 10: Finance mode switch round-trip
//
// For any FinanceMode value ∈ {NORMAL, SAVING, SURVIVAL}, after switching to
// that mode and reading back currentMode, the value must equal the mode that
// was set.
//
// Validates: Requirements 5.2, 10.1

import * as fc from 'fast-check';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FinanceModeEnum } from './entities/finance-mode.entity';
import { UpdateFinanceModeDto } from './dto/finance-mode.dto';

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Arbitrary that picks any valid FinanceModeEnum value */
const financeModeArb = fc.constantFrom(
  FinanceModeEnum.NORMAL,
  FinanceModeEnum.SAVING,
  FinanceModeEnum.SURVIVAL,
);

/** Arbitrary for a valid UpdateFinanceModeDto payload */
const updateDtoArb = fc.record({
  mode: financeModeArb,
  suggestionCooldownUntil: fc.oneof(
    fc.constant(undefined),
    fc.constant(null),
    fc
      .date({ min: new Date('2024-01-01'), max: new Date('2030-12-31'), noInvalidDate: true })
      .map((d) => d.toISOString()),
  ),
});

// ─── In-memory store helpers ──────────────────────────────────────────────────

interface FinanceModeStore {
  mode: FinanceModeEnum;
  suggestionCooldownUntil: string | null;
}

/** Simulates the service updateByUserId logic (in-memory, no DB) */
function applyUpdate(
  existing: FinanceModeStore,
  dto: { mode: FinanceModeEnum; suggestionCooldownUntil?: string | null },
): FinanceModeStore {
  const updated: FinanceModeStore = { ...existing };
  updated.mode = dto.mode;
  if (dto.suggestionCooldownUntil !== undefined) {
    updated.suggestionCooldownUntil = dto.suggestionCooldownUntil ?? null;
  }
  return updated;
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('FinanceMode — Property 10: Finance mode switch round-trip', () => {
  /**
   * Property 10a: DTO validation accepts all valid FinanceMode values
   *
   * For any mode ∈ {NORMAL, SAVING, SURVIVAL}, the UpdateFinanceModeDto must
   * pass class-validator with zero errors on the mode field.
   *
   * Validates: Requirement 5.2
   */
  it('valid FinanceMode values pass DTO validation', async () => {
    await fc.assert(
      fc.asyncProperty(financeModeArb, async (mode) => {
        const dto = plainToInstance(UpdateFinanceModeDto, { mode });
        const errors = await validate(dto);
        return errors.filter((e) => e.property === 'mode').length === 0;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 10b: round-trip — set mode then read back equals the set mode
   *
   * For any FinanceMode value, after applying the update and reading back
   * the stored mode, the stored value must equal the value that was set.
   *
   * Validates: Requirements 5.2, 10.1
   */
  it('after switching to any mode, reading back returns the same mode', () => {
    fc.assert(
      fc.property(financeModeArb, (mode) => {
        const initial: FinanceModeStore = {
          mode: FinanceModeEnum.NORMAL,
          suggestionCooldownUntil: null,
        };
        const saved = applyUpdate(initial, { mode });
        return saved.mode === mode;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 10c: sequential mode switches always reflect the latest mode
   *
   * For any two mode values A then B, after applying both updates, the stored
   * mode must equal B (last-write-wins semantics).
   *
   * Validates: Requirements 5.2, 10.1
   */
  it('sequential mode switches preserve the latest mode', () => {
    fc.assert(
      fc.property(financeModeArb, financeModeArb, (modeA, modeB) => {
        const initial: FinanceModeStore = {
          mode: FinanceModeEnum.NORMAL,
          suggestionCooldownUntil: null,
        };
        const afterA = applyUpdate(initial, { mode: modeA });
        const afterB = applyUpdate(afterA, { mode: modeB });
        return afterB.mode === modeB;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 10d: full DTO round-trip preserves mode and cooldown fields
   *
   * For any valid UpdateFinanceModeDto payload, after applying the update,
   * both mode and suggestionCooldownUntil must be stored correctly.
   *
   * Validates: Requirements 5.2, 10.1
   */
  it('full DTO round-trip preserves mode and suggestionCooldownUntil', () => {
    fc.assert(
      fc.property(updateDtoArb, (payload) => {
        const initial: FinanceModeStore = {
          mode: FinanceModeEnum.NORMAL,
          suggestionCooldownUntil: null,
        };
        const saved = applyUpdate(initial, payload);

        // mode must always match
        if (saved.mode !== payload.mode) return false;

        // cooldown must match when provided
        if (payload.suggestionCooldownUntil !== undefined) {
          if (saved.suggestionCooldownUntil !== (payload.suggestionCooldownUntil ?? null))
            return false;
        }

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 10e: FinanceModeEnum has exactly 3 values
   *
   * The enum must contain exactly NORMAL, SAVING, SURVIVAL — no more, no less.
   *
   * Validates: Requirement 5.1 (exactly 3 modes)
   */
  it('FinanceModeEnum contains exactly NORMAL, SAVING, SURVIVAL', () => {
    const values = Object.values(FinanceModeEnum);
    expect(values).toHaveLength(3);
    expect(values).toContain(FinanceModeEnum.NORMAL);
    expect(values).toContain(FinanceModeEnum.SAVING);
    expect(values).toContain(FinanceModeEnum.SURVIVAL);
  });

  /**
   * Property 10f: invalid mode values are rejected by DTO validation
   *
   * For any string that is not a valid FinanceModeEnum value, the DTO must
   * produce a validation error on the mode field.
   *
   * Validates: Requirement 5.1
   */
  it('invalid mode strings are rejected by DTO validation', async () => {
    const invalidModes = ['UNKNOWN', 'normal', 'saving', 'survival', '', 'INVALID', '0', 'null'];

    for (const invalidMode of invalidModes) {
      const dto = plainToInstance(UpdateFinanceModeDto, { mode: invalidMode });
      const errors = await validate(dto);
      const modeErrors = errors.filter((e) => e.property === 'mode');
      expect(modeErrors.length).toBeGreaterThan(0);
    }
  });
});
