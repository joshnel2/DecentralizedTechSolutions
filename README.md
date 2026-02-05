# Apex - AI-Native Legal Practice Management

<p align="center">
  <img src="public/favicon.svg" width="80" height="80" alt="Apex Logo" />
</p>

Apex is a modern, AI-native legal practice management platform designed for forward-thinking law firms. Built with React, TypeScript, and Azure OpenAI integration, it provides comprehensive tools for managing matters, clients, billing, and more.

## ✨ Features

### Core Practice Management
- **Matters Management** - Track cases, litigation, corporate work, and more with rich metadata
- **Client Management** - Comprehensive client profiles for individuals and organizations
- **Calendar & Scheduling** - Deadlines, court dates, meetings, and reminders
- **Time Tracking** - Quick timers, manual entry, and AI-powered suggestions
- **Billing & Invoicing** - Hourly, flat fee, contingency, and retainer billing
- **Document Management** - File storage with AI-powered summaries

### AI-Native Features
- **AI Assistant** - Chat-based interface for legal research, drafting, and analysis
- **Azure OpenAI Integration** - Secure, enterprise-grade AI capabilities
- **Document Analysis** - Automatic summarization and key point extraction
- **Time Entry Suggestions** - AI-generated billable time recommendations
- **Matter Insights** - Intelligent case analysis and risk assessment

### Administration
- **Team & Groups** - User management with role-based permissions
- **Firm Settings** - Configure billing rates, prefixes, and preferences
- **API Keys** - Secure integrations with external systems
- **Audit Logging** - Track all platform activity

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone <repository-url>

# Install dependencies
npm install

# Start development server
npm run dev
```

### Demo Account
Use these credentials to explore the platform:
- **Email:** admin@apex.law
- **Password:** apex2024

## 🛠️ Technology Stack

- **Frontend:** React 18, TypeScript, React Router
- **State Management:** Zustand
- **Styling:** CSS Modules with CSS Variables
- **Charts:** Recharts
- **Icons:** Lucide React
- **Date Handling:** date-fns
- **Build Tool:** Vite

## 📁 Project Structure

```
src/
├── components/       # Reusable UI components
├── pages/           # Page components
├── stores/          # Zustand state stores
├── styles/          # Global styles
└── types/           # TypeScript type definitions
```

## 🎨 Design System

Apex uses a distinctive midnight & gold color palette with:
- **Font Families:** Instrument Serif (headings), DM Sans (body), JetBrains Mono (code)
- **Dark Theme:** Optimized for long working sessions
- **AI Accent:** Purple tones for AI-related features

### Key CSS Variables
```css
--apex-gold: #D97706;
--apex-deep: #0F172A;
--apex-ai: #8B5CF6;
```

## 🔧 Configuration

### Azure OpenAI Setup

1. Navigate to Settings > Firm Settings
2. Enter your Azure OpenAI credentials:
   - Endpoint URL
   - API Key
   - Deployment Name

## 📄 License

This project is proprietary software for Apex Legal Technologies.

## 🤝 Support

For support, please contact support@apex.law

---

Built with ❤️ for modern law firms
