const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const required = (name, fallback) => {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 5000),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  initialAdmin: {
    email: process.env.INITIAL_ADMIN_EMAIL || '',
    password: process.env.INITIAL_ADMIN_PASSWORD || '',
    employeeId: process.env.INITIAL_ADMIN_EMPLOYEE_ID || 'ADMIN001',
  },
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/hr_system',
  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET', process.env.NODE_ENV === 'production' ? undefined : 'dev-access-secret'),
    refreshSecret: required('JWT_REFRESH_SECRET', process.env.NODE_ENV === 'production' ? undefined : 'dev-refresh-secret'),
    accessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
    refreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'HR System <no-reply@hr-system.local>',
  },
  storage: {
    driver: process.env.STORAGE_DRIVER || 'disk',
    s3: {
      bucket: process.env.S3_BUCKET || '',
      region: process.env.S3_REGION || '',
    },
  },
};

module.exports = env;
