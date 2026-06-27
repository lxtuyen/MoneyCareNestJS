import { DataSource } from 'typeorm';

const dataSource = new DataSource({
  type: 'postgres',
  url: 'postgresql://postgres.yxqgnpctxvhpwfstyhui:Tuyen0974@.@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres',
});

async function main() {
  await dataSource.initialize();
  console.log('Database initialized. Invalidating analytics cache...');
  
  const result = await dataSource.query(`
    UPDATE monthly_analytics_snapshots 
    SET "aiComputedAt" = NULL;
  `);
  
  console.log('Result:', result);
  await dataSource.destroy();
}

main().catch(console.error);
