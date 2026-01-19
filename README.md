# AI-Powered RFP Management System

An end-to-end web application that streamlines the procurement workflow using AI to create RFPs from natural language, automatically parse vendor responses, and provide intelligent proposal comparisons.

## Features

- **Natural Language RFP Creation**: Describe procurement needs in plain English, and the AI converts it into a structured RFP
- **Vendor Management**: Maintain a database of vendors with contact information
- **Email Integration**: Send RFPs to vendors via email and automatically receive and parse responses
- **AI-Powered Parsing**: Automatically extract pricing, terms, and conditions from vendor response emails
- **Intelligent Comparison**: Get AI-assisted recommendations on which vendor to choose with detailed reasoning

## Tech Stack

### Frontend

- **Next.js 16** (React framework)
- **TypeScript** for type safety
- **Tailwind CSS** for styling
- **Axios** for API calls
- **Lucide React** for icons

### Backend

- **Node.js** with **Express**
- **PostgreSQL** database
- **Drizzle ORM** for database operations
- **OpenAI GPT-4o-mini** for AI capabilities
- **Nodemailer** for email sending
- **IMAP** for email receiving
- **node-cron** for background email polling

## Prerequisites

- Node.js 20+ and npm
- PostgreSQL database
- OpenAI API key
- Email account with SMTP/IMAP access (Gmail recommended)

## Project Setup

### 1. Clone and Install Dependencies

```bash
# Install root dependencies
npm install

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Database Setup

1. Create a PostgreSQL database:

```sql
CREATE DATABASE rfp_db;
```

2. Configure the database connection in `backend/.env`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/rfp_db?schema=public"
```

3. Run Drizzle migrations:

```bash
cd backend
npm run db:generate
npm run db:migrate
```

### 3. Environment Configuration

Copy `backend/.env.example` to `backend/.env` and fill in your credentials:

```bash
cd backend
cp .env.example .env
```

Required environment variables:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/rfp_db?schema=public"

# Server
PORT=3001
NODE_ENV=development

# OpenAI API
OPENAI_API_KEY=your_openai_api_key_here

# Email Configuration (SMTP for sending)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password_here
SMTP_FROM=your_email@gmail.com

# Email Configuration (IMAP for receiving)
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=your_email@gmail.com
IMAP_PASSWORD=your_app_password_here

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:3000
```

### 4. Gmail Setup (Recommended)

If using Gmail:

1. Enable 2-Factor Authentication
2. Generate an App Password:
   - Go to Google Account → Security → 2-Step Verification → App passwords
   - Create an app password for "Mail"
   - Use this password in `SMTP_PASSWORD` and `IMAP_PASSWORD`

### 5. Run the Application

From the root directory:

```bash
npm run dev
```

This starts both:

- Backend server on `http://localhost:3001`
- Frontend on `http://localhost:3000`

Or run separately:

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

## API Documentation

### RFPs

- `GET /api/rfps` - Get all RFPs
- `GET /api/rfps/:id` - Get single RFP with proposals
- `POST /api/rfps` - Create RFP manually
- `PUT /api/rfps/:id` - Update RFP
- `DELETE /api/rfps/:id` - Delete RFP

### Vendors

- `GET /api/vendors` - Get all vendors
- `GET /api/vendors/:id` - Get single vendor
- `POST /api/vendors` - Create vendor
- `PUT /api/vendors/:id` - Update vendor
- `DELETE /api/vendors/:id` - Delete vendor

### Proposals

- `GET /api/proposals` - Get all proposals (optional `?rfpId=xxx` filter)
- `GET /api/proposals/:id` - Get single proposal
- `POST /api/proposals` - Create proposal manually
- `PUT /api/proposals/:id` - Update proposal
- `DELETE /api/proposals/:id` - Delete proposal

### AI Endpoints

- `POST /api/ai/create-rfp` - Create RFP from natural language

  ```json
  {
    "userInput": "I need to procure laptops and monitors..."
  }
  ```

  Returns: Created RFP object

- `POST /api/ai/send-rfp` - Send RFP to vendors

  ```json
  {
    "rfpId": "uuid",
    "vendorIds": ["vendor-uuid-1", "vendor-uuid-2"]
  }
  ```

  Returns: Array of send results

- `GET /api/ai/compare/:rfpId` - Compare proposals for an RFP
  Returns: Comparison object with summary, recommendation, reasoning, concerns, and scores

## Usage Examples

### Creating an RFP via Chat

Type in the chat interface:

```
I need to procure laptops and monitors for our new office. Budget is $50,000 total. Need delivery within 30 days. We need 20 laptops with 16GB RAM and 15 monitors 27-inch. Payment terms should be net 30, and we need at least 1 year warranty.
```

The AI will extract:

- Title and description
- Budget: $50,000
- Deadline: 30 days
- Items: 20 laptops (16GB RAM), 15 monitors (27-inch)
- Payment terms: net 30
- Warranty: 1 year

### Sending RFP to Vendors

1. Navigate to the RFP in the sidebar
2. Select vendors from the checklist
3. Click "Send RFP to vendors"
4. Emails are automatically sent with the RFP details

### Receiving Vendor Responses

The background email poller:

- Runs every 5 minutes
- Checks for unread emails in the inbox
- Identifies vendor responses (by email address or subject)
- Parses the email content with AI
- Creates/updates proposals automatically

### Comparing Proposals

1. Navigate to an RFP with multiple proposals
2. Click "Compare Proposals" or use chat: "Compare proposals for [RFP title]"
3. View AI-generated:
   - Summary comparison
   - Vendor recommendation
   - Detailed reasoning
   - Concerns and red flags
   - Numerical scores

## Architecture Decisions

### Data Models

**RFP**: Core procurement request with structured requirements stored as JSON

- Allows flexibility for different RFP types
- Requirements extracted by AI are stored in a consistent structure

**Vendor**: Master data for suppliers

- Simple contact information model
- Linked to proposals for tracking

**Proposal**: Vendor response to an RFP

- Stores both raw email and AI-parsed structured data
- Completeness score (0-1) for quality assessment
- Links to both RFP and Vendor

### AI Integration

**Deterministic JSON Responses**: All AI calls use `response_format: { type: 'json_object' }` with Zod validation

- Ensures consistent, parseable responses
- Temperature set to 0.1-0.3 for consistency

**Service Layer**: All AI logic in `backend/services/aiService.js`

- Clear separation of concerns
- Reusable functions
- Error handling and validation

**Three Main AI Functions**:

1. `createRFPFromNaturalLanguage()` - Extracts structured RFP from text
2. `parseVendorResponse()` - Extracts proposal data from email
3. `compareProposals()` - Generates comparison and recommendation

### Email Flow

**Sending**: Uses Nodemailer with SMTP

- Sends formatted RFP emails to selected vendors
- Includes all requirements and specifications

**Receiving**: Background poller using IMAP

- Polls every 5 minutes (configurable)
- Matches emails to vendors by email address
- Matches emails to RFPs by subject or recent RFPs
- Automatically parses and creates proposals

### UI/UX

**ChatGPT-Style Interface**:

- Left sidebar for navigation (RFPs, Vendors)
- Main panel for conversational workspace
- Natural language driven workflow

**Views**:

- Chat: Natural language interaction
- RFP View: Detailed RFP with proposals
- Vendor View: Vendor management
- Comparison View: AI-assisted comparison

## Assumptions & Limitations

### Assumptions

1. **Single User**: No authentication or multi-tenant support
2. **Email Matching**: Vendor responses matched by email address (vendor must be in system)
3. **RFP Matching**: Uses subject line keywords or matches to most recent "sent" RFP
4. **Email Format**: Assumes vendors reply to the RFP email (threading)
5. **Proposal Format**: AI can extract data from free-form text, tables, or simple attachments

### Limitations

1. **Email Polling**: 5-minute delay (not real-time)
2. **Attachment Parsing**: Basic support (text extraction, not full PDF parsing)
3. **Multi-Currency**: Assumes single currency (normalized to numbers)
4. **Complex RFPs**: Best for standard procurement (equipment, services, etc.)
5. **Email Provider**: Tested with Gmail; other providers may need configuration

## AI Tools Usage

This project was built with assistance from:

- **Cursor AI** (primary development assistant)
- Used for:
  - Code structure and architecture design
  - API endpoint implementation
  - React component development
  - Database schema design
  - Error handling patterns
  - TypeScript type definitions

**Key Learnings**:

- Structured prompts with clear JSON schemas improve AI reliability
- Zod validation ensures data integrity from AI responses
- Service layer separation makes AI integration testable and maintainable
- Background polling is simpler than webhooks for email receiving

## Development

### Database Management

```bash
# Generate Drizzle migrations
npm run db:generate

# Run migrations
npm run db:migrate

# Open Drizzle Studio (database GUI)
npm run db:studio

# Push schema changes directly (dev only)
npm run db:push
```

### Project Structure

```
.
├── backend/
│   ├── src/
│   │   └── db/
│   │       ├── schema.ts       # Drizzle database schema
│   │       └── index.ts        # Database connection
│   ├── drizzle.config.ts       # Drizzle configuration
│   ├── routes/                 # API routes
│   │   ├── rfp.js
│   │   ├── vendor.js
│   │   ├── proposal.js
│   │   └── ai.js
│   ├── services/               # Business logic
│   │   ├── aiService.js        # AI integration
│   │   ├── emailService.js     # Email sending
│   │   └── emailPoller.js      # Email receiving
│   ├── server.js               # Express server
│   └── package.json
├── frontend/
│   ├── app/                    # Next.js app directory
│   │   ├── page.tsx            # Main page
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/             # React components
│   │   ├── Sidebar.tsx
│   │   ├── ChatInterface.tsx
│   │   ├── RFPView.tsx
│   │   ├── VendorView.tsx
│   │   └── ComparisonView.tsx
│   └── package.json
└── README.md
```

## Troubleshooting

### Email Not Sending

- Verify SMTP credentials
- Check Gmail app password is correct
- Ensure "Less secure app access" is enabled (if not using app password)

### Email Not Receiving

- Verify IMAP credentials
- Check email poller is running (check server logs)
- Ensure vendor email matches exactly in database

### AI Parsing Errors

- Check OpenAI API key is valid
- Verify API quota/credits
- Check response format in `aiService.js` logs

### Database Connection Issues

- Verify PostgreSQL is running
- Check DATABASE_URL format
- Run `npm run db:generate` to generate Drizzle migrations

## License

This project is built as a demonstration/assignment project.
