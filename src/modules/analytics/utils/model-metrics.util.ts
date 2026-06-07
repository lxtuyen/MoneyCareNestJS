/**
 * Model Metrics Utility
 * Các hàm tính toán metrics đánh giá chất lượng dự báo AI.
 */

export interface PredictedActualPair {
  predicted: number;
  actual: number;
}

export interface DirectionalRun {
  previousActual: number;
  predicted: number;
  actual: number;
}

/**
 * Mean Absolute Error (MAE)
 * Trung bình sai số tuyệt đối. Đơn vị: VND.
 */
export function meanAbsoluteError(pairs: PredictedActualPair[]): number {
  if (pairs.length === 0) return 0;
  const totalError = pairs.reduce(
    (sum, p) => sum + Math.abs(p.actual - p.predicted),
    0,
  );
  return totalError / pairs.length;
}

/**
 * Root Mean Squared Error (RMSE)
 * Phạt nặng các lần dự báo lệch lớn.
 */
export function rootMeanSquaredError(pairs: PredictedActualPair[]): number {
  if (pairs.length === 0) return 0;
  const totalSquaredError = pairs.reduce(
    (sum, p) => sum + Math.pow(p.actual - p.predicted, 2),
    0,
  );
  return Math.sqrt(totalSquaredError / pairs.length);
}

/**
 * Absolute Percentage Error (APE)
 * Sai số phần trăm tuyệt đối cho 1 cặp.
 * Trả về null nếu actual < minActual (tránh chia cho 0).
 */
export function absolutePercentageError(
  predicted: number,
  actual: number,
  minActual: number = 1,
): number | null {
  if (actual < minActual) return null;
  return (Math.abs(actual - predicted) / actual) * 100;
}

/**
 * Mean Absolute Percentage Error (MAPE)
 * Trung bình sai số phần trăm. Skip các điểm actual < minActual.
 */
export function meanAbsolutePercentageError(
  pairs: PredictedActualPair[],
  minActual: number = 1,
): number {
  if (pairs.length === 0) return 0;

  const validErrors: number[] = [];
  for (const p of pairs) {
    const ape = absolutePercentageError(p.predicted, p.actual, minActual);
    if (ape !== null) {
      validErrors.push(ape);
    }
  }

  if (validErrors.length === 0) return 0;
  return validErrors.reduce((sum, e) => sum + e, 0) / validErrors.length;
}

/**
 * Directional Accuracy
 * Tỷ lệ model đoán đúng xu hướng tăng/giảm.
 */
export function directionalAccuracy(runs: DirectionalRun[]): number {
  if (runs.length === 0) return 0;

  let correct = 0;
  for (const run of runs) {
    const predictedDirection =
      run.predicted >= run.previousActual ? 'up' : 'down';
    const actualDirection = run.actual >= run.previousActual ? 'up' : 'down';
    if (predictedDirection === actualDirection) {
      correct++;
    }
  }

  return correct / runs.length;
}
