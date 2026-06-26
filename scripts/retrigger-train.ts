import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AnalyticsModelTrainingService } from '../src/modules/analytics/analytics-model-training.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const service = app.get(AnalyticsModelTrainingService);
  console.log('Retraining forecasting model for user 68...');
  const result = await service.trainForecastingModel(68);
  console.log('Retraining completed successfully:', JSON.stringify(result, null, 2));
  await app.close();
}

main().catch(console.error);
