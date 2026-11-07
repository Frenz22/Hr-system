const env = require('./config/env');
const app = require('./app');
const { initializeDatabase, bootstrapAdmin, bootstrapPayRates } = require('./db/init');

async function main() {
  try {
    await initializeDatabase();
    await bootstrapAdmin();
    await bootstrapPayRates();
    await require('./utils/mailer').verifyMailer();
    app.listen(env.port, () => {
      console.log(`HR-System API listening on http://localhost:${env.port}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

main();


