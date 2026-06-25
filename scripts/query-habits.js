const { DataSource } = require('typeorm');

const ds = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'postgres',
  password: '123',
  database: 'moneycare',
});

ds.initialize()
  .then(async () => {
    const r = await ds.query(
      'SELECT id, "habitName", "subcategoryName", "committedCount", month, year FROM habit_commitments LIMIT 10',
    );
    console.log(JSON.stringify(r, null, 2));
    await ds.destroy();
  })
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
