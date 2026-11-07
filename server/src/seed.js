/* Bootstrap the initial system administrator.
 *
 * The schema and the admin account are created idempotently on every server
 * start (see src/db/init.js); this script exposes the same work as a one-off
 * command for fresh databases. */
const { initializeDatabase, bootstrapAdmin, bootstrapPayRates } = require('./db/init');
const db = require('./config/db');

async function seed() {
  await initializeDatabase();
  await bootstrapAdmin();
  await bootstrapPayRates();
}

if (require.main === module) {
  seed()
    .then(() => db.pool.end())
    .catch(async (err) => {
      console.error(err);
      await db.pool.end();
      process.exit(1);
    });
}

module.exports = { seed };
