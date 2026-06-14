import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AiPredictionRun } from './modules/analytics/entities/ai-prediction-run.entity';
import { CoupleMember } from './modules/couples/entities/couple-member.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { getVietnamMonthRange } from './common/utils/date.util';

async function run() {
  console.log('Bootstrapping NestJS...');
  const app = await NestFactory.createApplicationContext(AppModule);
  const predictionRunRepo = app.get<Repository<AiPredictionRun>>(
    getRepositoryToken(AiPredictionRun),
  );
  const coupleMemberRepo = app.get<Repository<CoupleMember>>(
    getRepositoryToken(CoupleMember),
  );

  try {
    const { start, end } = getVietnamMonthRange(6, 2026);
    console.log('Vietnam Month Range:', { start, end });

    const members = await coupleMemberRepo.find({
      where: { coupleId: 2 },
    });

    for (const member of members) {
      console.log(`Checking predictions for member userId=${member.userId}...`);
      const runs = await predictionRunRepo.find({
        where: {
          userId: member.userId,
          modelType: 'forecasting',
          predictionTargetStart: Between(start, end),
        },
        order: { createdAt: 'DESC' },
      });
      console.log(
        `Found ${runs.length} forecasting runs:`,
        runs.map((r) => ({
          id: r.id,
          createdAt: r.createdAt,
          predictionTargetStart: r.predictionTargetStart,
          totalForecast: (r.predictionPayload as any)?.totalForecast,
        })),
      );
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await app.close();
  }
}

run().catch(console.error);
