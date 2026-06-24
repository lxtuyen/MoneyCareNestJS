const { Client } = require('pg');
const c = new Client({ host: 'localhost', port: 5432, user: 'postgres', password: '123', database: 'moneycare' });

c.connect().then(async () => {
  // 1. Reset ALL subCategoryId for user 66
  const reset = await c.query(
    `UPDATE transactions SET "subCategoryId" = NULL WHERE "userId" = 66`
  );
  console.log(`Reset ${reset.rowCount} transactions`);

  // 2. Delete all sub_categories (will be re-created by backfill)
  const del = await c.query(`DELETE FROM sub_categories`);
  console.log(`Deleted ${del.rowCount} sub-categories`);

  console.log('\n✅ Ready for fresh backfill with word-boundary matching');
  c.end();
}).catch(e => { console.error(e); c.end(); });
