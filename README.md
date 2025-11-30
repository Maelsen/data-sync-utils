# Click A Tree - Mews Integration

Mews PMS integration for Click A Tree - automatically tracks tree product sales and generates monthly invoices.

## 🚀 Features

- **Automated Sync**: Polls Mews API for new "Tree" product orders
- **Dashboard**: View stats, recent orders, and invoices
- **Invoice Generation**: Create PDF invoices for monthly billing
- **Prisma ORM**: Type-safe database with SQLite

## 📋 Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env` and add your Mews credentials:
```bash
DATABASE_URL="file:./dev.db"
MEWS_CLIENT_TOKEN="your_client_token"
MEWS_ACCESS_TOKEN="your_access_token"
```

### 3. Initialize Database
```bash
npx prisma migrate dev
```

### 4. Run Development Server
```bash
npm run dev
```

## 🏗️ Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Database**: SQLite + Prisma ORM
- **PDF Generation**: PDFKit
- **Styling**: Tailwind CSS

## 📦 Production Build

For stable database connections, use production mode:
```bash
npm run build
npm run start
```

## 📝 Project Structure

- `lib/` - Core logic (Mews client, sync, invoice generation)
- `app/` - Next.js pages and API routes
- `prisma/` - Database schema and migrations

## 🔒 Security

- `.env` file is gitignored
- Database file is gitignored
- Use environment variables for all credentials
