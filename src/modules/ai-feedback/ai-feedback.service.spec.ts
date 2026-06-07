import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from 'src/modules/user/entities/user.entity';
import { AiFeedbackService } from './ai-feedback.service';
import { AiRecommendationFeedback } from './entities/ai-recommendation-feedback.entity';

describe('AiFeedbackService', () => {
  let service: AiFeedbackService;

  const feedbackRepo = {
    create: jest.fn((payload) => payload),
    save: jest.fn(async (payload) => ({ id: 1, ...payload })),
    find: jest.fn(),
    findOne: jest.fn(),
  };
  const userRepo = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AiFeedbackService,
        {
          provide: getRepositoryToken(AiRecommendationFeedback),
          useValue: feedbackRepo,
        },
        {
          provide: getRepositoryToken(User),
          useValue: userRepo,
        },
      ],
    }).compile();

    service = moduleRef.get(AiFeedbackService);
  });

  it('creates budget accepted feedback', async () => {
    userRepo.findOne.mockResolvedValue({ id: 1 });

    const result = await service.create(1, {
      recommendationType: 'budget',
      recommendationId: 'budget:2026-06:Food',
      userAction: 'accepted',
      sourcePayload: {
        categoryName: 'Food',
        recommendedLimitAmount: 2000000,
      },
    });

    expect(result.id).toBe(1);
    expect(feedbackRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        recommendationType: 'budget',
        userAction: 'accepted',
      }),
    );
  });

  it('rejects invalid action for budget feedback', async () => {
    userRepo.findOne.mockResolvedValue({ id: 1 });

    await expect(
      service.create(1, {
        recommendationType: 'budget',
        recommendationId: 'budget:2026-06:Food',
        userAction: 'corrected',
        sourcePayload: {},
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('builds budget summary with average delta', () => {
    const summary = service.buildBudgetFeedbackSummary([
      feedback({
        userAction: 'modified',
        sourcePayload: {
          categoryName: 'Food',
          recommendedLimitAmount: 2000000,
        },
        modifiedPayload: { finalLimitAmount: 2500000 },
      }),
      feedback({
        userAction: 'accepted',
        sourcePayload: {
          categoryName: 'Food',
          recommendedLimitAmount: 2200000,
        },
      }),
      feedback({
        userAction: 'rejected',
        sourcePayload: {
          categoryName: 'Transport',
          recommendedLimitAmount: 1000000,
        },
      }),
    ]);

    expect(summary.totalCount).toBe(3);
    expect(summary.modifiedCount).toBe(1);
    expect(summary.rejectedCount).toBe(1);
    expect(summary.averageModificationDeltaPct).toBe(0.25);
    expect(summary.categoryPreferences[0].categoryName).toBe('Food');
  });

  it('builds category correction summary', () => {
    const summary = service.buildCategoryFeedbackSummary([
      feedback({
        recommendationType: 'category',
        userAction: 'corrected',
        sourcePayload: {
          inputText: 'grab 45k',
          merchant: 'Grab',
          predictedCategoryName: 'Transport',
        },
        modifiedPayload: { finalCategoryName: 'Food' },
      }),
      feedback({
        recommendationType: 'category',
        userAction: 'accepted',
        sourcePayload: { inputText: 'coffee' },
      }),
    ]);

    expect(summary.totalCount).toBe(2);
    expect(summary.correctedCount).toBe(1);
    expect(summary.correctionRate).toBe(0.5);
    expect(summary.personalCorrections[0]).toMatchObject({
      keyword: 'grab',
      finalCategoryName: 'Food',
      count: 1,
    });
  });

  it('does not crash on empty summary', () => {
    const budgetSummary = service.buildBudgetFeedbackSummary([]);
    const categorySummary = service.buildCategoryFeedbackSummary([]);

    expect(budgetSummary.totalCount).toBe(0);
    expect(budgetSummary.averageModificationDeltaPct).toBe(0);
    expect(categorySummary.totalCount).toBe(0);
    expect(categorySummary.personalCorrections).toEqual([]);
  });

  it('calculates budgeting readiness from real feedback by default', async () => {
    const rows = [
      feedback({
        userAction: 'accepted',
        sourcePayload: { categoryName: 'Food' },
        outcomePayload: { actualSpentAmount: 1000000 },
      }),
      feedback({
        userAction: 'modified',
        sourcePayload: { categoryName: 'Food' },
        modifiedPayload: { finalLimitAmount: 1200000 },
      }),
      feedback({
        userAction: 'rejected',
        sourcePayload: { categoryName: 'Transport' },
        dataSource: 'synthetic',
      }),
    ];
    feedbackRepo.find.mockResolvedValue(rows);

    const readiness = await service.getBudgetingReadiness(1);

    expect(readiness.totalFeedback).toBe(2);
    expect(readiness.realFeedbackCount).toBe(2);
    expect(readiness.syntheticFeedbackCount).toBe(1);
    expect(readiness.actionDistribution).toEqual({
      accepted: 1,
      modified: 1,
      rejected: 0,
    });
    expect(readiness.outcomeCount).toBe(1);
    expect(readiness.recommendation).toBe('rule_based_only');
  });

  it('records feedback outcome for the owning user', async () => {
    const existing = feedback({ id: 7, userId: 1 });
    feedbackRepo.findOne.mockResolvedValue(existing);

    const result = await service.recordOutcome(1, 7, {
      actualSpentAmount: 900000,
      wasOverBudget: false,
    });

    expect(feedbackRepo.findOne).toHaveBeenCalledWith({
      where: { id: 7, userId: 1 },
    });
    expect(feedbackRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        outcomePayload: {
          actualSpentAmount: 900000,
          wasOverBudget: false,
        },
        outcomeMeasuredAt: expect.any(Date),
      }),
    );
    expect(result.id).toBe(7);
  });

  function feedback(
    partial: Partial<AiRecommendationFeedback>,
  ): AiRecommendationFeedback {
    return {
      id: 1,
      userId: 1,
      user: { id: 1 } as User,
      recommendationType: 'budget',
      recommendationId: 'rec-1',
      sourceModel: null,
      sourceModelVersion: null,
      userAction: 'accepted',
      sourcePayload: {},
      modifiedPayload: null,
      contextPayload: null,
      dataSource: 'real',
      outcomePayload: null,
      outcomeMeasuredAt: null,
      reasonText: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...partial,
    };
  }
});
