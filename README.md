# HR System

## Project overview

HR System is an HR management app with an employee portal and a console for HR staff and admins. It manages employee profiles and documents, departments, attendance, leave requests, salary details, attendance pay rates, and in-app notifications.

The frontend uses React, the API uses Express, and PostgreSQL stores the data. The server checks user roles for protected actions. Salary records and attendance pay-hour categories are stored in the app, but it does not produce payslips or calculate tax.

## Features

### Employee portal

- Sign in with an account created by HR or an admin. The login page also has one-click trial access for Admin, HR, and Employee accounts; each button uses the regular authentication flow and redirects according to the account's role.
- Update contact details and a profile picture, and manage personal documents. Supported files are PDF, JPG, PNG, and WebP, up to 5 MB. The employee, HR staff, and admins can download or delete documents. Downloads require sign-in.
- View all attendance history with date presets, custom date ranges, and paginated results, including clock times, hours worked, and status.
- Request paid, sick, or unpaid leave, cancel pending requests, and view approved leave in a calendar and monthly summary.
- View a read-only salary breakdown showing gross pay, deductions, and net monthly pay.
- Read in-app notifications, check the unread count, and mark notifications as read. Leave decisions and salary updates generate notifications.
- Submit feedback in one of four categories. Feedback is associated with the signed-in account and can be viewed only by the admin account with the exact email `admin@gmail.com`.

### Admin and HR console

- The dashboard shows employee totals, attendance for today, pending leave requests, and the number of HR and admin accounts.
- Search the employee directory and browse its paginated results.
- Create employee and HR staff accounts. Admins can also create other admin accounts, change roles, update their own email or password, and edit employee profiles. The original system administrator is protected from role changes and deletion.
- View departments. Admins can create and delete them.
- Browse organization-wide attendance with date and status filters.
- Generate full or simplified attendance summary PDFs by date range, employee, and department. Reports show employee names and IDs, department, date, clock times, hours stored for active pay rates, and attendance status. The Employee Status column is blank because the current profile schema does not store employment status. A simplified report leaves out a rate only when all matching records have zero hours for it.
- Import attendance from `.xlsx` and `.xls` workbooks. Preview accepted and rejected rows before confirming the import.
- Export filtered attendance to Excel.
- Correct attendance with a required reason. Corrections, imports, and attendance changes from approved leave are recorded with before-and-after values in the audit history in the same transaction. Admins can void records. Voided records stay in the audit history and no longer appear in standard attendance views, exports, or reports.
- Review attendance change history. Employees can add notes to their own attendance records; notes do not change official attendance fields, and employees cannot read another employee's notes.
- Review leave requests and approve or reject them with a comment. Approval creates leave attendance for each date in the request.
- Manage attendance pay rates as an admin. Default rates include Regular Pay (1x), Overtime (1.25x), Rest Day (1.3x), Rest Day Overtime (1.69x), Special Holiday (1.3x), Special Holiday Overtime (1.69x), Regular Holiday (2x), Regular Holiday Overtime (2.6x), Night Differential (1.1x), and Double Pay (2x). Excel exports include a column for each rate, such as `Overtime Hours`, and a separate Pay Rates sheet. Imports read columns for active rates.
- Edit salary structures as an admin. HR staff can edit employee profiles, review leave, correct and import attendance, and view departments. They cannot assign roles, change department configuration, access salary details, or edit pay rates. Only admins can assign roles or void attendance.
- Get an in-app notification when an employee submits a leave request.
- Review, filter, sort, update, and delete feedback submissions. Only `admin@gmail.com` can access feedback management.

## Tech stack

- Frontend: React 19, Vite, Tailwind CSS 4, React Router 7, and Axios.
- Backend: Node.js, Express 4, PostgreSQL (`pg`), JSON Web Tokens, bcrypt, express-validator, Multer, SheetJS, Nodemailer, and Helmet.
- Files are stored on local disk by default. An S3 driver is also available.
- Backend tests use Jest and Supertest with a PostgreSQL test database.

## Project structure

```
client/
  src/
    pages/         # login, employee, and admin pages
    layouts/       # employee and admin page shells
    components/    # shared UI, notifications, leave views
    context/       # authentication state
    api/           # Axios client with token refresh
  vite.config.js   # dev server on port 5173; proxies /api and /uploads

server/
  src/
    routes/        # API endpoints
    controllers/   # request handlers
    services/      # business logic and SQL
    middleware/    # auth, RBAC, uploads, error handling
    db/            # schema.sql, startup setup, bootstrap data
    config/        # environment variables and PostgreSQL pool
    utils/         # JWT, storage drivers, serializers, mailer
  tests/           # Jest and PostgreSQL integration tests
```

## Getting started

Install Node.js 20.19+ or 22.12+ and start a PostgreSQL server before running the app. The frontend uses Vite 8.

### 1. Create the database

```bash
createdb hr_system
```

Or, if `createdb` is not on your path:

```bash
psql -U postgres -c "CREATE DATABASE hr_system;"
```

The API creates and updates tables at startup. No separate schema command is needed.

### 2. Configure and start the API

Create `server/.env` with the values described in Environment variables. You can start from `server/.env.example` and replace its placeholder values.

```bash
cd server
npm install
npm run dev
```

The API starts at `http://localhost:5000`. Each startup applies `server/src/db/schema.sql`, creates a bootstrap admin when configured and missing, and inserts any missing default pay rates. You can run `npm run seed` to do the same setup manually.

Set `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` in `server/.env` to bootstrap the first admin. No default administrator credentials are created when these are unset. The password must be at least 12 characters (16 in production). Existing accounts keep their roles and passwords. The schema marks the earliest existing admin as the protected system administrator when no account has been marked yet. The marker is stored on the user record and remains in place if that admin changes email or password. Admins can explicitly change another account's role from its employee detail page.

### 3. Start the client

In another terminal:

```bash
cd client
npm install
npm run dev
```

Open `http://localhost:5173`. Vite forwards `/api` and `/uploads` requests to the API on port 5000.

### 4. Run the tests

```bash
cd server
npm test
```

The test suite creates a separate PostgreSQL database by adding `_test` to the name in `DATABASE_URL`. The PostgreSQL user must have permission to create it.

## Environment variables

Set these in `server/.env`. The example values are placeholders.

```env
PORT=5000
NODE_ENV=development
CLIENT_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/hr_system
JWT_ACCESS_SECRET=replace-with-a-long-random-value
JWT_REFRESH_SECRET=replace-with-another-long-random-value
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
STORAGE_DRIVER=disk
INITIAL_ADMIN_EMAIL=admin@example.invalid
INITIAL_ADMIN_PASSWORD=replace-with-a-unique-long-password
INITIAL_ADMIN_EMPLOYEE_ID=ADMIN001
COMPANY_NAME=Your Company
```

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string. |
| `JWT_ACCESS_SECRET` | Yes in production | Secret used to sign access tokens. Development has a fallback; production needs a unique secret. |
| `JWT_REFRESH_SECRET` | Yes in production | Secret used to sign refresh tokens. Keep it different from the access-token secret. |
| `PORT` | No | API port. Defaults to `5000`. |
| `NODE_ENV` | No | Set to `production` when deploying. This enables secure cookies and PostgreSQL SSL. |
| `CLIENT_ORIGIN` | No | Allowed frontend origin for CORS. Defaults to `http://localhost:5173`. |
| `JWT_ACCESS_EXPIRES` | No | Access token lifetime. Defaults to `15m`. |
| `JWT_REFRESH_EXPIRES` | No | Refresh token lifetime. Defaults to `7d`. |
| `STORAGE_DRIVER` | No | `disk` or `s3`. Defaults to `disk`. |
| `INITIAL_ADMIN_EMAIL` | No | Email for creating the first admin account. |
| `INITIAL_ADMIN_PASSWORD` | No | Password for the initial admin. Set it with the email; it must be at least 12 characters, or 16 in production. |
| `INITIAL_ADMIN_EMPLOYEE_ID` | No | Employee ID for the bootstrap admin; defaults to `ADMIN001`. |
| `COMPANY_NAME` | No | Company label printed on attendance summary PDFs. Defaults to `HR System`. |
| `S3_BUCKET` | Only for S3 | Bucket name for uploaded files. |
| `S3_REGION` | Only for S3 | AWS region for the bucket. |
| `AWS_ACCESS_KEY_ID` | Only for S3 | AWS credential when the app is not running with an instance role. |
| `AWS_SECRET_ACCESS_KEY` | Only for S3 | AWS secret when the app is not running with an instance role. |
| `SMTP_HOST` | No | SMTP host. Leave empty to disable the startup check. |
| `SMTP_PORT` | No | SMTP port. Defaults to `587`. |
| `SMTP_USER` | No | SMTP username. |
| `SMTP_PASS` | No | SMTP password or app password. |
| `MAIL_FROM` | No | From address used by the mailer. |

## Limitations

- There is no password reset flow. Admins can change their own email and password after verifying their current password. A password change invalidates all existing access and refresh tokens for that account.
- There are no payroll periods or payroll finalization records. The app cannot tell whether an attendance record belongs to finalized payroll, so it has no reopening or finalized-period correction flow.
- Existing account roles and passwords are preserved at startup. Admins can create admin accounts; HR staff can create only employee and HR staff accounts. Existing accounts are not automatically promoted.
- The app sends notifications in the interface but does not send email. SMTP settings are checked at startup.
- Attendance pay rates are used by attendance import and export, but not by payroll calculations. Salary is a fixed monthly structure with basic pay, HRA, allowances, and deductions. Payslips, tax rules, and automatic deductions are not supported. The currency is INR.
- Leave approval marks every date in the requested range, including weekends and holidays. The app has no holiday calendar.
- Monthly leave summaries count approved leave requests. Imported attendance rows marked as leave are not included.
- The app applies `server/src/db/schema.sql` at startup and has no migration framework.
- Excel imports interpret clock times in the API server's local timezone.
- S3 storage is available, but local disk is the default. In production, `server/uploads` needs persistent storage or regular backups. S3 has no automated tests.
- There are no frontend tests.

## Before publishing

- Set a unique `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` before bootstrapping an admin account.
- Replace the placeholder values in `server/.env.example` before deployment.
- Keep `.env` files, `server/uploads`, database dumps, and `node_modules` out of source control.
- Add a license file before distributing the code.
