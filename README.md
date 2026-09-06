# University Management System — Backend

A single-institution university management backend built as an industry-style REST API — role-based academic operations (enrollment, attendance, exams, results, GPA/transcripts) plus bKash payment integration for semester fees.

## Problem → Solution

Academic institutions running registration, attendance, and results through disconnected spreadsheets end up with double-booked seats, unenforced prerequisites, and manually-computed (and manually-wrong) GPAs. This system focuses on three things a spreadsheet can't do safely:

- **Transaction-safe enrollment** — no seat oversells under concurrent registration requests.
- **Structural prerequisite validation** — a course's prerequisites are graph relationships, checked against actually-published results, not a string list.
- **Deterministic, re-computable GPA** — computed from published results only, cached, invalidated on any change — never hand-entered.

## Tech Stack

| Layer | Choice |
|---|---|
| Runtime / Language | Node.js, TypeScript (ESM) |
| Framework | Express.js |
| Database / ORM | PostgreSQL, Prisma 7 |
| Cache / Queue backend | Redis |
| Auth | JWT (access + refresh, cookie-based), Google OAuth (google-auth-library) |
| Validation | Zod |
| File uploads | Multer + Cloudinary (instructor resumes) |
| Email | Nodemailer + EJS templates |
| PDF generation | pdfkit (result sheets, transcripts) |
| Payments | bKash Tokenized Checkout (sandbox) |
| Dates | date-fns |

## Roles

| Role | Can do |
|---|---|
| **Student** | Register (OTP-verified) or sign in with Google; browse & enroll in sections; view attendance/results/transcript; pay and cancel semester fees |
| **Instructor** | Self-apply with a resume (OTP-verified, admin-reviewed); mark attendance for own sections; create exams and submit marks |
| **Admin** | Manage departments/courses/semesters/sections; review instructor applications; generate fees; publish/override results; view dashboard summary |

## Architecture Notes

### Why instructors self-apply instead of being created by an admin
An admin creating instructor accounts directly requires already having each instructor's email on hand, and (worse) means the admin sets — and therefore knows — the instructor's password. Instead: instructor applies with a resume → OTP-verifies their email → admin approves/rejects → **only on approval** is a password generated and emailed. An unapproved applicant has no password and literally cannot log in; the invariant enforces itself instead of being checked separately everywhere.

### Why enrollment uses `updateMany` instead of read-then-write
```ts
const seatUpdate = await tx.section.updateMany({
  where: { id: section.id, enrolledCount: { lt: section.capacity } },
  data: { enrolledCount: { increment: 1 } },
});
if (seatUpdate.count === 0) throw new AppError(409, "Section is full");
```
Two concurrent requests for the last seat both see `enrolledCount < capacity` under a read-then-write model — both increment, capacity is oversold. `updateMany` with the capacity check in the same atomic statement means Postgres row-locking serializes the two requests: whichever commits first wins, the second one's `WHERE` clause simply no longer matches and its `count` comes back `0`. Verified as a real test case in the Postman collection (Student A takes the last seat, Student B's identical request gets a 409).

### Why the bKash payment ↔ Fee mapping lives in the database, not Redis
The first version of this cached `paymentID → feeId` in Redis with a TTL. That's fragile — a Redis restart or an expired key between "student redirected to bKash" and "bKash calls back" loses the mapping and the payment is never recorded, even though bKash actually collected the money. The `Payment` row is now created (status `PENDING`) at *init* time with bKash's `paymentID` as a durable, unique, database-level key; the callback looks it up by that field directly. No TTL to outlive.

### Why bKash network calls sit outside `$transaction` blocks
`execute` and `refund` are calls to bKash's servers, not the local database. Wrapping them inside a Prisma `$transaction` holds a database lock open for however long bKash takes to respond — under load that risks transaction timeouts for an operation that has nothing to do with the transaction's actual purpose. The pattern here is: do the network call first, then run a short transaction over just the resulting database writes.

### GPA scale
Standard Bangladesh public-university 4.00-scale letter grade bands (80%+ = 4.00 down to 40% = 2.00 pass, below 40% = 0.00). Adjust `PERCENTAGE_TO_GRADE_POINT` in `result.service.ts` if your institution's scale differs.

## Known Limitations / Deliberate Scope Cuts

- **Flat semester fee, not per-credit-hour billing.** Every student in a semester is charged the same admin-set amount regardless of credit load. Per-credit billing is a larger design change, intentionally deferred.
- **Fee payment status does not block enrollment.** A student can enroll with an unpaid fee — there's no hard dependency between the two in the current business rules.
- **Rate limiting is not yet implemented** on auth endpoints (login/refresh/forgot-password), despite being in the original design.
- **No per-credit-hour or per-section refund proration** — fee cancellation refunds the full paid amount via bKash, gated only by the semester's `enrollmentEnd` deadline.
- **Analytics/reporting is out of scope** for this submission — only the admin dashboard summary (aggregate counts) is implemented.
- **Course deletion does not check prerequisite dependencies** — deleting a course that's listed as another course's prerequisite doesn't currently warn or block.

## Getting Started

```bash
npm install
npx prisma generate
npx prisma migrate dev
npx tsx prisma/seed.ts   # creates the bootstrap Admin account — see below
npm run dev
```

### Bootstrap Admin

There is no public "become an admin" endpoint (that would be a security hole). The seed script creates one Admin account directly in the database:

```
email:testeradmin@gmail.com
password:testerAdmin@admin12345
```

Log in once, then either change this password or create additional admins via `POST /api/v1/users/admins`.

### Environment Variables

```dotenv
# App
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/university_db

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_ACCESS_SECRET=
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=
JWT_REFRESH_EXPIRES_IN=7d
BCRYPT_SALT_ROUNDS=12

# Google OAuth
GOOGLE_CLIENT_ID=

# Cloudinary (instructor resumes)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Email (Nodemailer)
EMAIL_SENDER=

# bKash (sandbox)
BKASH_BASE_URL=https://tokenized.sandbox.bka.sh/v1.2.0-beta
BKASH_USERNAME=
BKASH_PASSWORD=
BKASH_APP_KEY=
BKASH_APP_SECRET=
BKASH_CALLBACK_URL=https://<your-public-url>/api/v1/payments/bkash/callback
```

> **Local testing note:** bKash's sandbox redirects from *their* servers — it cannot reach `localhost`. Use a tunnel (e.g. `ngrok http 5000`) and set `BKASH_CALLBACK_URL` to the tunnel's HTTPS URL plus the callback path. This is only needed for local dev; a deployed instance uses its own public URL directly.

## API Overview

All routes are prefixed `/api/v1`.

| Module | Base path | Notes |
|---|---|---|
| Auth | `/auth` | register, verify-email, login, google, refresh-token, forgot/reset-password, change-password, complete-profile, me |
| Users | `/users` | admin-only: create additional admins |
| Instructors | `/instructors` | apply, verify-email, review (admin), list applications (admin) |
| Departments | `/departments` | CRUD (admin write, all roles read) |
| Courses | `/courses` | CRUD + prerequisite graph (admin write, all roles read) |
| Semesters | `/semesters` | CRUD + status lifecycle: `UPCOMING → OPEN → CLOSED` (admin) |
| Sections | `/sections` | CRUD, links course + semester + instructor (admin write) |
| Enrollments | `/enrollments` | enroll, drop, my enrollments (student) |
| Attendance | `/attendance` | sessions, marking (instructor), my attendance (student) |
| Exams | `/exams` | create (instructor), list per section |
| Results | `/results` | submit (instructor), publish/override (admin), transcript + result sheets (student, JSON/PDF/email) |
| Fees | `/fees` | generate for a semester (admin, bulk) |
| Payments | `/payments` | bKash init/callback, cancel (refund), my fees (student), all payments (admin) |
| Dashboard | `/dashboard` | summary counts (admin) |
| Transcript | `/transcript` | admin-facing view of any student's transcript by ID |

A full Postman collection covering the end-to-end test flow (bootstrap → department → instructor application → course/semester/section → student registration → enrollment incl. the seat-full negative test → fee/payment → exam/result/GPA) is included separately.

## Folder Structure

```
src/
  app/
    config/          # env var loading
    lib/              # prisma, redis, nodemailer, cloudinary, bkash, pdf clients
    middleware/       # auth (JWT + RBAC), validateRequest, error handlers
    module/
      auth/ user/ instructor/ department/ course/ semester/ section/
      enrollment/ attendance/ exam/ result/ fee/ payment/ dashboard/
      each: *.interface.ts, *.validation.ts, *.service.ts, *.controller.ts, *.route.ts
    templates/        # EJS email templates
  app.ts
  server.ts
prisma/
  schema/             # split schema files (enums, user, academic, payment)
  seed.ts
```

## License

Academic project — not licensed for production use as-is.