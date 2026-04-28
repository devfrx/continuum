import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db, sql } from './client.js';

async function main() {
  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations complete.');
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
