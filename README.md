# ESG Compliance Report Generator

**Regulatory Compliance Auditor Tool — Restaurant Industry**

A structured, professional tool for generating ESG (Environmental, Social, Governance) compliance reports for local restaurant operations.

---

## Purpose

This application enables restaurant operators and compliance officers to:

- Input operational data across Environmental, Social, and Governance categories
- Track data completion status in real-time
- Generate ready-to-file compliance reports
- Export reports in HTML or JSON format
- Identify compliance flags and receive actionable recommendations

---

## Data Categories

### Entity Information
- Legal business name, EIN, entity type
- Business address and regulatory jurisdiction
- Reporting period and location count

### Environmental (E)
- Energy consumption (electricity, natural gas)
- Renewable energy usage
- Water usage and recycling
- Waste management (solid, recycled, composted)
- Grease disposal and food donation programs
- Refrigerant types and leak incidents
- HVAC maintenance schedules

### Social (S)
- Workforce composition (full-time, part-time)
- Minimum wage compliance
- Benefits (health insurance, paid leave)
- Training certifications (food handler, allergen, anti-harassment)
- OSHA incidents and workers' compensation claims

### Governance (G)
- Business licenses and permits
- Health department inspections and scores
- Insurance coverage (liability, workers' comp, property)
- Employee handbook and ethics policies
- Data privacy documentation

---

## Compliance Scoring

The system calculates scores (0-100) for each ESG category:

| Rating | Score Range |
|--------|-------------|
| EXCELLENT | 90-100 |
| GOOD | 80-89 |
| SATISFACTORY | 70-79 |
| NEEDS IMPROVEMENT | 60-69 |
| NON-COMPLIANT | 0-59 |

---

## Compliance Flags

Reports automatically flag issues by severity:

- **CRITICAL** — Immediate regulatory action required
- **WARNING** — Significant compliance risk
- **ADVISORY** — Improvement opportunity

---

## Getting Started

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:5173
```

### Production Build

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

---

## Export Formats

### HTML Report
- Printable, styled document
- Signature block for authorization
- Full compliance flags and recommendations

### JSON Report
- Machine-readable structured data
- Complete data model with scores and flags
- Suitable for API integration or archival

---

## Tech Stack

- **Vanilla JavaScript** — No framework dependencies
- **SCSS** — Modular, maintainable styles
- **Vite** — Fast build tooling
- **LocalStorage** — Client-side data persistence

---

## Disclaimer

This tool generates reports based on self-reported data and does not constitute legal advice or an official regulatory audit. Verify all information with appropriate regulatory authorities.

---

**Version 1.0** | Restaurant Industry ESG Standards
