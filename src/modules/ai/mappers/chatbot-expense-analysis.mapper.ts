import { AnalyticsMappedResponse } from 'src/modules/analytics/types/analytics-service-response.type';
import {
  ChatbotExpenseAnalysisPayload,
  ChatbotExpenseAnalysisSeverity,
  ChatbotRecommendationCardPayload,
} from '../types/chatbot-expense-analysis.type';
import { FinancialInsightSnapshot } from '../types/ai.types';

export function mapChatbotExpenseAnalysisPayload(
  analytics: AnalyticsMappedResponse,
  insights?: FinancialInsightSnapshot,
): ChatbotExpenseAnalysisPayload {
  const projection = analytics.forecasting?.currentMonthProjection ?? null;
  const budgetRisk = analytics.budgetRisk ?? null;
  const anomalies = (analytics.anomalies || []).slice(0, 3);
  const topCategories = [];
  const recommendations = buildRecommendations(analytics);
  const hasTransactions =
    (insights?.incomeTotal ?? 0) > 0 ||
    (insights?.expenseTotal ?? 0) > 0 ||
    anomalies.length > 0;

  return {
    version: 2,
    type: 'expense_analysis',
    message: buildShortMessage(analytics, anomalies.length),
    overview: {
      financialHealthScore: analytics.financialHealthScore,
      cashFlowTrend: analytics.cashFlowTrend,
      monthlyForecast: analytics.monthlyForecast,
      periodLabel: buildPeriodLabel(insights),
      summary: buildOverviewSummary(analytics),
      expenseTotal: insights?.expenseTotal,
      incomeTotal: insights?.incomeTotal,
      netBalance: insights?.netBalance,
    },
    topCategories,
    forecast: projection
      ? {
          currentMonthProjection: {
            totalForecast: projection.totalForecast,
            predictedRemainingAmount: projection.predictedRemainingAmount,
            confidence: projection.confidence,
            riskLevel: projection.riskLevel,
            modelNotes: projection.modelNotes,
          },
          riskWindows: (projection.riskWindows || [])
            .slice(0, 3)
            .map((item) => ({
              periodStart: item.periodStart,
              periodEnd: item.periodEnd,
              riskLevel: item.riskLevel,
              predictedAmount: item.predictedAmount,
              reason: item.reason,
            })),
        }
      : null,
    anomalies,
    budgetRisk: budgetRisk
      ? {
          riskLevel: budgetRisk.riskLevel,
          message: budgetRisk.message,
          items: (budgetRisk.items || [])
            .slice()
            .sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0))
            .slice(0, 3),
        }
      : null,
    recommendations,
    emptyState: hasTransactions
      ? undefined
      : {
          title: 'Chưa có dữ liệu chi tiêu',
          message:
            'Hãy ghi nhận thêm giao dịch để MoneyCare tạo phân tích chi tiết hơn.',
        },
  };
}

function buildPeriodLabel(insights?: FinancialInsightSnapshot): string {
  if (insights?.targetMonth && insights?.targetYear) {
    return `Tháng ${insights.targetMonth}/${insights.targetYear}`;
  }
  if (insights?.period === 'this_month') {
    return 'Tháng này';
  }
  return 'Tháng này';
}

function buildTopCategories(
  analytics: AnalyticsMappedResponse,
  insights?: FinancialInsightSnapshot,
) {
  if (insights?.topCategories?.length) {
    return insights.topCategories.slice(0, 5).map((item) => ({
      categoryName: item.name,
      amount: item.amount,
      trend:
        item.changePct > 5 ? 'up' : item.changePct < -5 ? 'down' : 'stable',
      note:
        item.percentageOfExpenses > 0
          ? `Chiếm ${item.percentageOfExpenses}% tổng chi.`
          : 'Nằm trong nhóm chi tiêu cao.',
      percentageOfExpenses: item.percentageOfExpenses,
    }));
  }

  const categoryForecasts =
    analytics.forecasting?.currentMonthProjection?.categoryForecasts || [];

  return categoryForecasts
    .filter((item) => item.categoryName)
    .slice()
    .sort(
      (a, b) =>
        (b.actualAmount || b.predictedAmount || 0) -
        (a.actualAmount || a.predictedAmount || 0),
    )
    .slice(0, 5)
    .map((item) => ({
      categoryName: item.categoryName || 'Khác',
      amount: item.actualAmount || item.predictedAmount || 0,
      trend: item.trend || 'stable',
      note: item.riskLevel
        ? `Rủi ro ${
            item.riskLevel === 'high'
              ? 'cao'
              : item.riskLevel === 'medium'
                ? 'trung bình'
                : 'thấp'
          }.`
        : 'Dữ liệu dự báo theo danh mục.',
    }));
}

function buildShortMessage(
  analytics: AnalyticsMappedResponse,
  anomalyCount: number,
): string {
  const risk = analytics.budgetRisk?.riskLevel || 'low';
  if (anomalyCount > 0 && isHighRisk(risk)) {
    return `Mình đã phân tích chi tiêu của bạn. Có ${anomalyCount} giao dịch cần kiểm tra và một số danh mục đang có rủi ro ngân sách.`;
  }
  if (anomalyCount > 0) {
    return `Mình đã phân tích chi tiêu của bạn. Có ${anomalyCount} giao dịch bất thường nên xem lại trong các thẻ bên dưới.`;
  }
  if (isHighRisk(risk)) {
    return 'Mình đã phân tích chi tiêu của bạn. Một số danh mục đang có rủi ro vượt ngân sách, chi tiết nằm trong các thẻ bên dưới.';
  }
  return 'Mình đã phân tích chi tiêu của bạn. Các điểm quan trọng được tóm tắt trong các thẻ bên dưới.';
}

function buildOverviewSummary(analytics: AnalyticsMappedResponse): string {
  const score = analytics.financialHealthScore;
  const risk = analytics.budgetRisk?.riskLevel || 'low';

  if (score >= 80 && !isHighRisk(risk)) {
    return 'Tình hình tài chính đang ổn định, chưa thấy rủi ro lớn.';
  }
  if (isHighRisk(risk)) {
    return 'Cần chú ý ngân sách vì một số danh mục đang có rủi ro cao.';
  }
  if (score < 50) {
    return 'Sức khỏe tài chính đang thấp, nên ưu tiên kiểm soát dòng tiền.';
  }
  return 'Tình hình chi tiêu có một số điểm cần theo dõi.';
}

function buildRecommendations(
  analytics: AnalyticsMappedResponse,
): ChatbotRecommendationCardPayload[] {
  const recommendations: ChatbotRecommendationCardPayload[] = [];
  const budgetItems = analytics.budgetRisk?.items || [];
  const highestRiskItem = budgetItems
    .slice()
    .sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0))[0];

  if (highestRiskItem) {
    recommendations.push({
      title: `Theo dõi ${highestRiskItem.categoryName}`,
      description:
        highestRiskItem.limitAmount > 0
          ? `Đã chi ${Math.round((highestRiskItem.spentAmount / highestRiskItem.limitAmount) * 100)}% ngân sách của danh mục này.`
          : 'Danh mục này đang có rủi ro cao trong kỳ phân tích.',
      severity: mapSeverity(analytics.budgetRisk?.riskLevel),
    });
  }

  for (const insight of analytics.insights || []) {
    if (recommendations.length >= 3) break;
    recommendations.push({
      title: insight.title || 'Gợi ý từ phân tích',
      description: insight.message || insight.evidence || '',
      severity: mapSeverity(insight.severity),
    });
  }

  if (
    recommendations.length === 0 &&
    analytics.forecasting?.currentMonthProjection?.modelNotes
  ) {
    recommendations.push({
      title: 'Theo dõi dự báo',
      description: analytics.forecasting.currentMonthProjection.modelNotes,
      severity: mapSeverity(
        analytics.forecasting.currentMonthProjection.riskLevel,
      ),
    });
  }

  return recommendations.filter((item) => item.description).slice(0, 3);
}

function isHighRisk(riskLevel?: string): boolean {
  const normalized = (riskLevel || '').toLowerCase();
  return ['high', 'danger', 'critical', 'warning'].includes(normalized);
}

function mapSeverity(value?: string): ChatbotExpenseAnalysisSeverity {
  const normalized = (value || '').toLowerCase();
  if (['danger', 'critical', 'high', 'error'].includes(normalized))
    return 'danger';
  if (['warning', 'medium'].includes(normalized)) return 'warning';
  if (['good', 'success', 'low'].includes(normalized)) return 'good';
  if (['stable', 'info'].includes(normalized)) return 'stable';
  return 'info';
}
