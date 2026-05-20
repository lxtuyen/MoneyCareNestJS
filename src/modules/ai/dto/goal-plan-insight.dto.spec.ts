import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  GoalPlanInsightDto,
  GoalPlanProgressStatus,
} from './goal-plan-insight.dto';

describe('GoalPlanInsightDto', () => {
  it('rejects payloads missing user, goal, or plan snapshot', async () => {
    const dto = plainToInstance(GoalPlanInsightDto, {
      selectedMonth: '2026-05',
      categories: [],
    });

    const errors = await validate(dto);
    const fields = errors.map((error) => error.property);

    expect(fields).toEqual(expect.arrayContaining(['userId', 'goal', 'plan']));
  });

  it('accepts a complete goal-plan insight snapshot', async () => {
    const dto = plainToInstance(GoalPlanInsightDto, {
      userId: 1,
      selectedMonth: '2026-05',
      goal: {
        name: 'Mua xe',
        status: GoalPlanProgressStatus.ON_TRACK,
      },
      plan: {
        name: 'Plan tháng 5',
        status: GoalPlanProgressStatus.ON_TRACK,
        plannedToDate: 1000000,
        actualSpent: 900000,
        overAmount: -100000,
      },
      categories: [
        {
          name: 'Ăn uống',
          status: GoalPlanProgressStatus.ON_TRACK,
          plannedToDate: 500000,
          actualSpent: 450000,
          overAmount: -50000,
        },
      ],
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});
