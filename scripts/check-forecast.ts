import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AnalyticsService } from '../src/modules/analytics/analytics.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const service = app.get(AnalyticsService);
  const result = await service.getFinancialSummary(68);
  
  console.log('FINANCIAL SUMMARY RESULT FOR USER 68:');
  const forecasting = result.data.forecasting;
  
  console.log('\n--- CURRENT MONTH PROJECTION (JUNE) ---');
  console.log('Method:', forecasting.currentMonthProjection?.method);
  console.log('Total Forecast:', forecasting.currentMonthProjection?.totalForecast);
  console.log('Actual Amount:', forecasting.currentMonthProjection?.actualAmount);
  console.log('Predicted Remaining:', forecasting.currentMonthProjection?.predictedRemainingAmount);
  
  const junePoints = forecasting.currentMonthProjection?.dailyPoints || [];
  const day5June = junePoints.find((p: any) => p.date.endsWith('-05'));
  console.log('Day 5 (June 5) Prediction:', day5June);
  
  console.log('\n--- NEXT MONTH FORECAST (JULY) ---');
  console.log('Method:', forecasting.nextMonthForecast?.method);
  console.log('Total Forecast:', forecasting.nextMonthForecast?.totalForecast);
  
  const julyPoints = forecasting.nextMonthForecast?.dailyPoints || [];
  const day5July = julyPoints.find((p: any) => p.date.endsWith('-05'));
  console.log('Day 5 (July 5) Prediction:', day5July);
  
  await app.close();
}

main().catch(console.error);
