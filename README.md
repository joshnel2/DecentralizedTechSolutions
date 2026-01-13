# Apex - AI-Native Legal Practice Management

<!-- v1.2.0 - API Keys & Team Management -->

<p align="center">
  <img src="public/favicon.svg" width="80" height="80" alt="Apex Logo" />
</p>

Apex is a modern, AI-native legal practice management platform designed for forward-thinking law firms. Built with React, TypeScript, and Azure OpenAI integration, it provides comprehensive tools for managing matters, clients, billing, documents, and more.

## Table of Contents

- [Features](#-features)
- [Getting Started](#-getting-started)
- [Architecture](#-architecture)
- [API Documentation](#-api-documentation)
- [Authentication](#-authentication)
- [Database Schema](#-database-schema)
- [Deployment](#-deployment)
- [Development](#-development)
- [Environment Variables](#-environment-variables)

---

## ✨ Features

### Core Practice Management
- **Matters Management** - Track cases, litigation, corporate work with rich metadata and custom fields
- **Client Management** - Comprehensive profiles for individuals and organizations
- **Calendar & Scheduling** - Deadlines, court dates, meetings, and reminders with recurrence support
- **Time Tracking** - Quick timers, manual entry, and AI-powered suggestions
- **Billing & Invoicing** - Hourly, flat fee, contingency, and retainer billing methods
- **Document Management** - Azure File Share integration with AI-powered summaries
- **Trust Accounting** - IOLTA compliance and trust ledger management

### AI-Native Features
- **AI Assistant** - Chat-based interface for legal research, drafting, and analysis
- **Azure OpenAI Integration** - Secure, enterprise-grade AI capabilities
- **Document Analysis** - Automatic summarization and key point extraction
- **Time Entry Suggestions** - AI-generated billable time recommendations
- **Matter Insights** - Intelligent case analysis and risk assessment
- **Redline AI** - Automated document comparison and markup

### Administration & Security
- **Team & Groups** - User management with role-based permissions
- **Firm Settings** - Configure billing rates, prefixes, and preferences
- **API Keys** - Secure integrations with external systems
- **Audit Logging** - Track all platform activity
- **Two-Factor Authentication** - Enhanced account security
- **Matter-Level Permissions** - Granular access control

### Integrations
- **Microsoft 365** - Outlook calendar and email sync
- **QuickBooks** - Accounting integration
- **Azure File Share** - Document storage (Apex Drive)
- **Stripe Connect** - Payment processing

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- PostgreSQL 14+
- Azure account (for AI and file storage)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/apex.git
   cd apex
   ```

2. **Install dependencies**
   ```bash
   # Frontend
   npm install

   # Backend
   cd backend && npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Initialize the database**
   ```bash
   psql $DATABASE_URL -f backend/src/db/schema.sql
   ```

5. **Run migrations**
   ```bash
   for f in backend/src/db/migrations/*.sql; do psql $DATABASE_URL -f "$f"; done
   ```

6. **Start the development servers**
   ```bash
   # Terminal 1 - Frontend
   npm run dev

   # Terminal 2 - Backend
   cd backend && npm run dev
   ```

---

## 🏗 Architecture

### Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | React 18, TypeScript, Vite |
| State Management | Zustand |
| Styling | CSS Modules |
| Backend | Node.js, Express |
| Database | PostgreSQL |
| AI | Azure OpenAI (GPT-4) |
| File Storage | Azure File Share |
| Authentication | JWT + HTTP-only cookies |

### Project Structure

```
apex/
├── src/                    # Frontend source
│   ├── components/         # React components
│   ├── pages/              # Page components
│   │   └── developer/      # Developer portal pages
│   ├── stores/             # Zustand stores
│   ├── services/           # API clients
│   ├── hooks/              # Custom hooks
│   ├── contexts/           # React contexts
│   └── types/              # TypeScript types
├── backend/
│   ├── src/
│   │   ├── routes/         # API routes
│   │   ├── middleware/     # Express middleware
│   │   ├── db/             # Database schema & migrations
│   │   └── utils/          # Utility functions
├── public/                 # Static assets
└── docs/                   # Documentation
```

---

## 📚 API Documentation

Full API documentation is available in the **Developer Portal** at `/developer`.

### Base URL

```
https://your-firm.apexlegal.app/api
```

### Core Endpoints

| Resource | Endpoint | Description |
|----------|----------|-------------|
| Matters | `/api/matters` | Legal matters and cases |
| Clients | `/api/clients` | Client contacts |
| Time Entries | `/api/time-entries` | Billable time records |
| Invoices | `/api/invoices` | Bills and payments |
| Calendar | `/api/calendar` | Events and deadlines |
| Documents | `/api/documents` | File management |
| Team | `/api/team` | User management |

### Example Request

```bash
curl -X GET "https://your-firm.apexlegal.app/api/matters" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json"
```

### Example Response

```json
{
  "matters": [
    {
      "id": "uuid-1234",
      "number": "M-2024-0001",
      "name": "Smith v. Jones",
      "clientId": "client-uuid",
      "status": "active",
      "matterType": "litigation",
      "billingMethod": "hourly",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 150,
  "page": 1,
  "pageSize": 50
}
```

---

## 🔐 Authentication

### API Keys

API keys provide programmatic access to the Apex API. Create and manage keys in the Developer Portal (`/developer/apps`).

```bash
# Include in Authorization header
Authorization: Bearer apex_your_api_key_here
```

### Permissions

API keys have granular permissions:

| Permission | Description |
|------------|-------------|
| `matters:read` | View matters |
| `matters:write` | Create/update matters |
| `clients:read` | View clients |
| `clients:write` | Create/update clients |
| `documents:read` | View/download documents |
| `documents:write` | Upload documents |
| `calendar:read` | View calendar events |
| `calendar:write` | Create/update events |
| `billing:read` | View time entries & invoices |
| `billing:write` | Create time entries & invoices |

### User Authentication

For user sessions (web app), Apex uses JWT tokens with HTTP-only cookies:

```javascript
// Login
POST /api/auth/login
{ "email": "user@firm.com", "password": "..." }

// Returns access token in HTTP-only cookie
```

---

## 🗄 Database Schema

### Core Tables

#### Firms
```sql
CREATE TABLE firms (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  subdomain VARCHAR(100) UNIQUE NOT NULL,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### Users
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  firm_id UUID REFERENCES firms(id),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  role VARCHAR(50) DEFAULT 'staff',
  hourly_rate DECIMAL(10,2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### Matters
```sql
CREATE TABLE matters (
  id UUID PRIMARY KEY,
  firm_id UUID REFERENCES firms(id),
  client_id UUID REFERENCES clients(id),
  number VARCHAR(50),
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  matter_type VARCHAR(100),
  billing_method VARCHAR(50),
  responsible_attorney_id UUID REFERENCES users(id),
  open_date DATE,
  close_date DATE,
  description TEXT,
  custom_fields JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### Clients
```sql
CREATE TABLE clients (
  id UUID PRIMARY KEY,
  firm_id UUID REFERENCES firms(id),
  type VARCHAR(50) DEFAULT 'individual',
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  notes TEXT,
  custom_fields JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### Time Entries
```sql
CREATE TABLE time_entries (
  id UUID PRIMARY KEY,
  firm_id UUID REFERENCES firms(id),
  matter_id UUID REFERENCES matters(id),
  user_id UUID REFERENCES users(id),
  date DATE NOT NULL,
  hours DECIMAL(5,2) NOT NULL,
  rate DECIMAL(10,2),
  amount DECIMAL(10,2),
  description TEXT,
  billable BOOLEAN DEFAULT true,
  billed BOOLEAN DEFAULT false,
  activity_code VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Running Migrations

```bash
# Run all migrations
for f in backend/src/db/migrations/*.sql; do
  echo "Running $f..."
  psql $DATABASE_URL -f "$f"
done
```

---

## 🚢 Deployment

### Azure Deployment

Apex is designed for deployment on Azure:

1. **Azure App Service** - Frontend and backend hosting
2. **Azure Database for PostgreSQL** - Database
3. **Azure File Share** - Document storage
4. **Azure OpenAI** - AI capabilities
5. **Azure Key Vault** - Secrets management

### Environment Configuration

Set these environment variables in your deployment:

```bash
# Database
DATABASE_URL=postgres://user:pass@host:5432/dbname

# JWT
JWT_SECRET=your-jwt-secret
JWT_REFRESH_SECRET=your-refresh-secret

# Azure OpenAI
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_KEY=your-api-key
AZURE_OPENAI_DEPLOYMENT=gpt-4

# Azure Storage
AZURE_STORAGE_CONNECTION_STRING=your-connection-string
AZURE_FILE_SHARE_NAME=apex-files

# App
FRONTEND_URL=https://your-app.azurewebsites.net
NODE_ENV=production
```

### Build Commands

```bash
# Frontend build
npm run build

# Backend (runs directly with Node.js)
cd backend && npm start
```

---

## 💻 Development

### Running Locally

```bash
# Start frontend dev server
npm run dev

# Start backend dev server (separate terminal)
cd backend && npm run dev
```

### Code Style

- TypeScript strict mode enabled
- ESLint for code linting
- Prettier for code formatting

### Testing

```bash
# Run frontend tests
npm test

# Run backend tests
cd backend && npm test
```

### Adding New API Endpoints

1. Create route file in `backend/src/routes/`
2. Add route to `backend/src/server.js`
3. Add API client function in `src/services/api.ts`
4. Update types in `src/types/index.ts`

---

## ⚙️ Environment Variables

### Required Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing access tokens |
| `JWT_REFRESH_SECRET` | Secret for signing refresh tokens |

### Azure Integration

| Variable | Description |
|----------|-------------|
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI endpoint URL |
| `AZURE_OPENAI_KEY` | Azure OpenAI API key |
| `AZURE_OPENAI_DEPLOYMENT` | GPT model deployment name |
| `AZURE_STORAGE_CONNECTION_STRING` | Azure Storage connection |
| `AZURE_FILE_SHARE_NAME` | File share name for documents |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Backend server port | 3001 |
| `NODE_ENV` | Environment | development |
| `FRONTEND_URL` | Frontend URL for CORS | http://localhost:5173 |

---

## 📄 License

Copyright © 2024 Apex Legal Technology. All rights reserved.

---

## 🤝 Support

- **Documentation**: [/developer](/developer)
- **Email**: support@apexlegal.app
- **Developer Support**: developers@apexlegal.app
