import { DataSource } from 'typeorm';

const dataSource = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'postgres',
  password: '123',
  database: 'moneycare',
});

async function main() {
  await dataSource.initialize();
  const txs = await dataSource.query(`
    SELECT t.id, t.amount, t.type, t.transaction_date, t."isTransfer", c.name as category_name 
    FROM transactions t
    LEFT JOIN categories c ON t."categoryId" = c.id
    WHERE t."userId" = 68 
      AND t.type = 'expense'
      AND t.transaction_date >= '2026-06-01' 
      AND t.transaction_date <= '2026-06-30'
    ORDER BY t.transaction_date ASC
  `);
  console.log('JUNE EXPENSES FOR USER 68:');
  console.log(JSON.stringify(txs, null, 2));
  await dataSource.destroy();
}

main().catch(console.error);
