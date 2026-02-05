# Apex Legal Platform - Production Setup Guide

This guide will help you set up the Apex Legal Platform with a real PostgreSQL database and backend API.

## Prerequisites

1. **Node.js 18+** - [Download](https://nodejs.org/)
2. **PostgreSQL 14+** - [Download](https://www.postgresql.org/download/)
3. **Git** - [Download](https://git-scm.com/)

## Quick Start (5 Minutes)

### Step 1: Install PostgreSQL

**macOS (using Homebrew):**
```bash
brew install postgresql@15
brew services start postgresql@15
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

**Windows:**
Download and install from [postgresql.org](https://www.postgresql.org/download/windows/)

### Step 2: Create Database and User

```bash
# Connect to PostgreSQL
sudo -u postgres psql

# Run these SQL commands:
CREATE USER apex_user WITH PASSWORD 'apex_password';
CREATE DATABASE apex_legal OWNER apex_user;
GRANT ALL PRIVILEGES ON DATABASE apex_legal TO apex_user;
\q
```

### Step 3: Install Dependencies

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ..
npm install
```

### Step 4: Initialize Database

```bash
cd backend

# Create the database tables
npm run db:init

# Seed with demo data (optional but recommended)
npm run db:seed
```

### Step 5: Start the Servers

**Terminal 1 - Backend API:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
# From project root
npm run dev
```

### Step 6: Access the Application

1. Open http://localhost:5173 in your browser
2. Login with demo credentials:
   - **Email:** admin@apex.law
   - **Password:** apex2024

---

## Configuration

### Backend Environment Variables

Edit `backend/.env`:

```env
# Database
DATABASE_URL=postgresql://apex_user:apex_password@localhost:5432/apex_legal

# Security (CHANGE THESE IN PRODUCTION!)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_REFRESH_SECRET=your-refresh-token-secret-change-this-too
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Server
PORT=3001
NODE_ENV=development

# Frontend URL
FRONTEND_URL=http://localhost:5173

# File Upload
MAX_FILE_SIZE=50000000
UPLOAD_DIR=./uploads
```

### Frontend Environment Variables

Edit `.env` in project root:

```env
VITE_API_URL=http://localhost:3001/api
```

---

## Production Deployment

### Security Checklist

- [ ] Change JWT secrets to strong random values
- [ ] Use HTTPS (SSL/TLS certificates)
- [ ] Set `NODE_ENV=production`
- [ ] Use a managed PostgreSQL service (AWS RDS, Azure, etc.)
- [ ] Enable database connection pooling
- [ ] Set up proper CORS origins
- [ ] Configure rate limiting appropriately
- [ ] Set up database backups
- [ ] Enable audit logging storage
- [ ] Configure email service for invitations

### Environment Variables for Production

```env
# Backend
DATABASE_URL=postgresql://user:password@your-db-host:5432/apex_legal?sslmode=require
JWT_SECRET=<generate with: openssl rand -base64 64>
JWT_REFRESH_SECRET=<generate with: openssl rand -base64 64>
NODE_ENV=production
FRONTEND_URL=https://your-domain.com

# Frontend
VITE_API_URL=https://api.your-domain.com/api
```

---

## API Endpoints Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Register new user & firm |
| POST | /api/auth/login | Login |
| POST | /api/auth/logout | Logout |
| POST | /api/auth/refresh | Refresh access token |
| GET | /api/auth/me | Get current user |
| PUT | /api/auth/password | Update password |

### Clients
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/clients | List clients |
| GET | /api/clients/:id | Get client |
| POST | /api/clients | Create client |
| PUT | /api/clients/:id | Update client |
| DELETE | /api/clients/:id | Delete client |

### Matters
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/matters | List matters |
| GET | /api/matters/:id | Get matter |
| POST | /api/matters | Create matter |
| PUT | /api/matters/:id | Update matter |
| DELETE | /api/matters/:id | Delete matter |

### Time Entries
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/time-entries | List time entries |
| POST | /api/time-entries | Create time entry |
| PUT | /api/time-entries/:id | Update time entry |
| DELETE | /api/time-entries/:id | Delete time entry |

### Invoices
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/invoices | List invoices |
| GET | /api/invoices/:id | Get invoice |
| POST | /api/invoices | Create invoice |
| PUT | /api/invoices/:id | Update invoice |
| POST | /api/invoices/:id/payments | Record payment |
| DELETE | /api/invoices/:id | Delete invoice |

### Calendar
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/calendar | List events |
| POST | /api/calendar | Create event |
| PUT | /api/calendar/:id | Update event |
| DELETE | /api/calendar/:id | Delete event |

### Documents
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/documents | List documents |
| POST | /api/documents | Upload document |
| GET | /api/documents/:id/download | Download document |
| PUT | /api/documents/:id | Update metadata |
| DELETE | /api/documents/:id | Delete document |

### Team & Groups
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/team | List team members |
| PUT | /api/team/:id | Update team member |
| DELETE | /api/team/:id | Remove team member |
| GET | /api/team/invitations | List invitations |
| POST | /api/team/invitations | Send invitation |
| DELETE | /api/team/invitations/:id | Revoke invitation |
| GET | /api/team/groups | List groups |
| POST | /api/team/groups | Create group |

### Firm
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/firm | Get firm details |
| PUT | /api/firm | Update firm |
| GET | /api/firm/dashboard | Dashboard stats |
| GET | /api/firm/audit-logs | Audit logs |
| GET | /api/firm/notifications | Notifications |

---

## Troubleshooting

### Database Connection Issues

**Error: "Connection refused"**
- Ensure PostgreSQL is running: `sudo systemctl status postgresql`
- Check the port: `sudo netstat -tlnp | grep 5432`

**Error: "Authentication failed"**
- Verify credentials in `backend/.env`
- Check `pg_hba.conf` for local authentication settings

### Backend Issues

**Error: "EADDRINUSE"**
- Port 3001 is in use. Kill the process or change PORT in `.env`

**Error: "Module not found"**
- Run `npm install` in the backend directory

### Frontend Issues

**CORS Errors**
- Ensure `FRONTEND_URL` in backend `.env` matches your frontend URL
- Check that the backend is running

---

## Database Schema

The database includes these main tables:
- `firms` - Law firm organizations
- `users` - User accounts with roles
- `clients` - Client records (persons/companies)
- `matters` - Legal matters/cases
- `time_entries` - Billable time records
- `expenses` - Expense records
- `invoices` - Invoice records
- `payments` - Payment records
- `calendar_events` - Calendar/deadlines
- `documents` - Document metadata
- `trust_accounts` - IOLTA/trust accounts
- `trust_transactions` - Trust transactions
- `groups` - Practice groups
- `audit_logs` - Activity audit trail

---

## Support

For issues or questions:
1. Check this setup guide
2. Review the API documentation above
3. Check console logs in browser and terminal
4. Ensure all environment variables are set correctly

---

Built with ❤️ for modern law firms
