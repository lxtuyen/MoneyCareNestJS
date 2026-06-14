const { Client } = require('pg');

const databaseUrl = 'postgresql://postgres.fkjfxebaxzwkffskxrin:lxtuyen0987@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres';

async function run() {
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    console.log('Connected to DB!');
    
    const couples = await client.query('SELECT * FROM couples');
    console.log('Couples:', couples.rows);
    
    const members = await client.query('SELECT * FROM couple_members');
    console.log('Couple Members:', members.rows);
    
    const goals = await client.query('SELECT id, name, target, saved_amount, status, "coupleId" FROM couple_saving_goals');
    console.log('Couple Saving Goals:', goals.rows);
    
    const plans = await client.query('SELECT * FROM spending_plans LIMIT 5');
    console.log('Spending Plans:', plans.rows);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

run();
