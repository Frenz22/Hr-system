const { db } = require('./helpers');
const { bootstrapPayRates } = require('../src/db/init');

describe('default pay rates', () => {
  it('seeds the configured pay rates exactly once', async () => {
    await bootstrapPayRates();
    await bootstrapPayRates();

    const { rows } = await db.query(
      'SELECT name, type, multiplier FROM pay_rules ORDER BY name'
    );

    expect(rows).toEqual([
      { name: 'Double Pay', type: 'custom', multiplier: 2 },
      { name: 'Night Differential', type: 'night_diff', multiplier: 1.1 },
      { name: 'Overtime', type: 'overtime', multiplier: 1.25 },
      { name: 'Regular Holiday', type: 'holiday', multiplier: 2 },
      { name: 'Regular Holiday Overtime', type: 'overtime', multiplier: 2.6 },
      { name: 'Regular Pay', type: 'regular', multiplier: 1 },
      { name: 'Rest Day', type: 'rest_day', multiplier: 1.3 },
      { name: 'Rest Day Overtime', type: 'overtime', multiplier: 1.69 },
      { name: 'Special Holiday', type: 'holiday', multiplier: 1.3 },
      { name: 'Special Holiday Overtime', type: 'overtime', multiplier: 1.69 },
    ]);
  });

  it('preserves admin-edited rates and other existing rates on subsequent seeds', async () => {
    await db.query("UPDATE pay_rules SET multiplier = 1.5 WHERE name = 'Overtime'");
    await db.query(
      "INSERT INTO pay_rules (name, type, multiplier) VALUES ('Admin Custom Rate', 'custom', 4)"
    );

    await bootstrapPayRates();

    const { rows } = await db.query(
      'SELECT name, multiplier FROM pay_rules WHERE name IN ($1, $2) ORDER BY name',
      ['Admin Custom Rate', 'Overtime']
    );
    expect(rows).toEqual([
      { name: 'Admin Custom Rate', multiplier: 4 },
      { name: 'Overtime', multiplier: 1.5 },
    ]);
  });
});
