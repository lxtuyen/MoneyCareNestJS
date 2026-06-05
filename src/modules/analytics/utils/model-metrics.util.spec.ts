import {
  meanAbsoluteError,
  rootMeanSquaredError,
  meanAbsolutePercentageError,
  absolutePercentageError,
  directionalAccuracy,
} from './model-metrics.util';

describe('Model Metrics Utility', () => {
  describe('meanAbsoluteError', () => {
    it('should calculate MAE correctly', () => {
      const pairs = [
        { predicted: 100, actual: 120 },
        { predicted: 200, actual: 180 },
      ];
      expect(meanAbsoluteError(pairs)).toBe(20);
    });

    it('should return 0 for empty array', () => {
      expect(meanAbsoluteError([])).toBe(0);
    });

    it('should handle perfect predictions', () => {
      const pairs = [
        { predicted: 100, actual: 100 },
        { predicted: 200, actual: 200 },
      ];
      expect(meanAbsoluteError(pairs)).toBe(0);
    });
  });

  describe('rootMeanSquaredError', () => {
    it('should calculate RMSE correctly', () => {
      const pairs = [
        { predicted: 100, actual: 120 },
        { predicted: 200, actual: 180 },
      ];
      // squared errors: 400, 400; mean: 400; sqrt: 20
      expect(rootMeanSquaredError(pairs)).toBe(20);
    });

    it('should return 0 for empty array', () => {
      expect(rootMeanSquaredError([])).toBe(0);
    });

    it('should penalize large errors more than MAE', () => {
      const pairs = [
        { predicted: 100, actual: 100 },
        { predicted: 200, actual: 300 },
      ];
      const mae = meanAbsoluteError(pairs); // 50
      const rmse = rootMeanSquaredError(pairs); // sqrt(5000) ≈ 70.7
      expect(rmse).toBeGreaterThan(mae);
    });
  });

  describe('absolutePercentageError', () => {
    it('should calculate APE correctly', () => {
      // |2500000 - 2100000| / 2500000 * 100 = 16%
      expect(absolutePercentageError(2100000, 2500000)).toBeCloseTo(16, 0);
    });

    it('should return null when actual is below minActual', () => {
      expect(absolutePercentageError(100, 0)).toBeNull();
    });

    it('should return null when actual is below custom minActual', () => {
      expect(absolutePercentageError(100, 500, 1000)).toBeNull();
    });
  });

  describe('meanAbsolutePercentageError', () => {
    it('should calculate MAPE correctly', () => {
      const pairs = [
        { predicted: 100, actual: 120 },
        { predicted: 200, actual: 180 },
      ];
      // APE1 = 20/120*100 ≈ 16.67, APE2 = 20/180*100 ≈ 11.11
      // MAPE ≈ 13.89
      expect(meanAbsolutePercentageError(pairs)).toBeCloseTo(13.89, 1);
    });

    it('should skip pairs where actual = 0', () => {
      const pairs = [
        { predicted: 100, actual: 0 },
        { predicted: 200, actual: 200 },
      ];
      // Only second pair counts, APE = 0
      expect(meanAbsolutePercentageError(pairs)).toBe(0);
    });

    it('should return 0 for empty array', () => {
      expect(meanAbsolutePercentageError([])).toBe(0);
    });

    it('should return 0 when all actuals are below minActual', () => {
      const pairs = [
        { predicted: 100, actual: 0 },
        { predicted: 200, actual: 0 },
      ];
      expect(meanAbsolutePercentageError(pairs)).toBe(0);
    });
  });

  describe('directionalAccuracy', () => {
    it('should return 1.0 when all directions are correct', () => {
      const runs = [
        { previousActual: 4000000, predicted: 5000000, actual: 5800000 }, // up → up ✓
        { previousActual: 5000000, predicted: 4000000, actual: 3500000 }, // down → down ✓
      ];
      expect(directionalAccuracy(runs)).toBe(1.0);
    });

    it('should return 0.0 when all directions are incorrect', () => {
      const runs = [
        { previousActual: 4000000, predicted: 5000000, actual: 3000000 }, // up → down ✗
        { previousActual: 5000000, predicted: 4000000, actual: 6000000 }, // down → up ✗
      ];
      expect(directionalAccuracy(runs)).toBe(0.0);
    });

    it('should return 0.5 when half are correct', () => {
      const runs = [
        { previousActual: 4000000, predicted: 5000000, actual: 5800000 }, // correct
        { previousActual: 5000000, predicted: 4000000, actual: 6000000 }, // incorrect
      ];
      expect(directionalAccuracy(runs)).toBe(0.5);
    });

    it('should return 0 for empty array', () => {
      expect(directionalAccuracy([])).toBe(0);
    });
  });
});
