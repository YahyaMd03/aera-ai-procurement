# Persistent Episodic Memory + Agent State Architecture

## Overview

This document describes the redesigned chat + AI system that moves from "stateless last-N messages" to a **persistent episodic memory + agent state architecture**.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐    ┌──────────────────────────────────────┐  │
│  │ Session      │    │  ChatInterface Component              │  │
│  │ Management   │───▶│  - Conversation List Sidebar          │  │
│  │ (localStorage)│   │  - Message Display                    │  │
│  └──────────────┘    │  - Input Handler                       │  │
│                      └──────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│                      POST /api/conversations/:id/message         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend (Express/Node)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Conversation Routes (/api/conversations)                │   │
│  │  - POST / (get or create active)                        │   │
│  │  - GET / (list by session)                               │   │
│  │  - GET /:id (get conversation)                           │   │
│  │  - POST /:id/message (send message)                      │   │
│  │  - POST /new (create new)                                │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Conversation Service                                     │   │
│  │  - createConversation()                                   │   │
│  │  - getConversation()                                      │   │
│  │  - addMessage()                                           │   │
│  │  - updateAgentState()                                     │   │
│  │  - getRecentMessages()                                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  AI Service (chatWithAgentState)                          │   │
│  │  Input:                                                   │   │
│  │  - User message                                           │   │
│  │  - Agent state summary                                    │   │
│  │  - Last 3 messages (tone continuity)                     │   │
│  │  Output:                                                  │   │
│  │  - AI response                                            │   │
│  │  - State update (workflow step, RFP draft, etc.)         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Database (PostgreSQL)                                    │   │
│  │  - Conversation table (id, sessionId, status, agentState)│  │
│  │  - Message table (id, conversationId, role, content)     │  │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Database Schema

### Conversation Table

```sql
CREATE TABLE "Conversation" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "sessionId" VARCHAR(255) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'drafting_rfp',
    "agentState" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX "Conversation_sessionId_idx" ON "Conversation"("sessionId");
CREATE INDEX "Conversation_status_idx" ON "Conversation"("status");
```

### Message Table

```sql
CREATE TABLE "Message" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "conversationId" UUID NOT NULL REFERENCES "Conversation"("id") ON DELETE CASCADE,
    "role" VARCHAR(20) NOT NULL, -- 'user' | 'assistant' | 'system'
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");
```

## Agent State TypeScript Interface

```typescript
type ConversationStatus =
  | "drafting_rfp"
  | "collecting_requirements"
  | "ready_to_send"
  | "sent"
  | "closed";

type WorkflowStep =
  | "initial"
  | "collecting_requirements"
  | "drafting_rfp"
  | "reviewing_rfp"
  | "selecting_vendors"
  | "ready_to_send"
  | "sent"
  | "waiting_for_proposals"
  | "comparing_proposals"
  | "closed";

interface RFPDraft {
  title?: string;
  description?: string;
  budget?: number;
  deadline?: string;
  requirements?: {
    items?: Array<{ name: string; quantity?: number; specifications?: string }>;
    deliveryDays?: number;
    paymentTerms?: string;
    warranty?: string;
    otherRequirements?: string[];
  };
  vendorsSelected?: string[];
  missingFields?: string[];
}

interface AgentState {
  workflowStep: WorkflowStep;
  rfpDraft?: RFPDraft;
  lastAction?: string;
  rfpId?: string;
  metadata?: {
    startedAt?: string;
    lastUpdated?: string;
    [key: string]: any;
  };
}
```

## API Flow

### 1. Get or Create Active Conversation

```
POST /api/conversations
Body: { sessionId: string }
Response: Conversation object with messages
```

### 2. Send Message

```
POST /api/conversations/:id/message
Body: { message: string }
Response: {
  conversation: Conversation,
  message: string,
  stateUpdate: AgentStateUpdate | null
}
```

**Flow:**

1. Load conversation from DB
2. Append user message to messages table
3. Construct LLM input:
   - System prompt
   - Agent state summary (from `summarizeAgentState()`)
   - Last 3 messages (for tone continuity)
   - Current user message
4. Call LLM (`chatWithAgentState`)
5. Parse response (gets both text response and state update)
6. Update:
   - Messages table (assistant reply)
   - Agent state in conversation
   - Conversation status (if workflow step changed)

### 3. RFP Sending

```
POST /api/ai/send-rfp
Body: { rfpId: string, vendorIds: string[], conversationId?: string }
```

**Validation:**

- If `conversationId` provided, checks `agentState.workflowStep === 'ready_to_send'`
- On success:
  - Updates conversation status to 'sent'
  - Updates agent state
  - Adds system message

## LLM Prompt Construction Strategy

### Input to LLM:

1. **System Prompt**: Role definition + context info (RFPs, vendors)
2. **Agent State Summary**: Summarized current state (workflow step, RFP draft status, missing fields)
3. **Recent Messages** (last 3): For conversational tone continuity
4. **Current User Message**: The new message to respond to

### Output from LLM:

```json
{
  "response": "Conversational response to user",
  "stateUpdate": {
    "workflowStep": "...",
    "rfpDraft": { ... },
    "lastAction": "...",
    "missingFields": [...]
  }
}
```

### Key Benefits:

- **Efficient**: Only sends summary + 3 messages (not full history)
- **Context-aware**: Agent state provides workflow context
- **Persistent**: State survives page refreshes
- **Scalable**: Works with long conversation histories

## Frontend Data Flow

### Session Management

- Uses `localStorage` to persist `sessionId`
- Generated on first visit: `session_${timestamp}_${random}`
- Used to group conversations by user

### Conversation Loading

1. On mount: Load all conversations for session
2. Get or create active conversation
3. Display messages from conversation
4. On page refresh: Restore last active conversation

### Message Sending

1. User types message
2. Optimistically add to UI
3. POST to `/api/conversations/:id/message`
4. Receive updated conversation + AI response
5. Update UI with actual messages from DB
6. Check for RFP creation in state update
7. Refresh conversation list

### Conversation Switching

- Sidebar shows all conversations
- Click to switch: Load conversation messages
- "New Conversation" button creates fresh conversation

## Key Improvements

### Before (Stateless):

- ❌ History lost on page refresh
- ❌ Sent full conversation history every time (inefficient)
- ❌ No workflow tracking
- ❌ No conversation persistence

### After (Persistent + Agent State):

- ✅ Conversations persist in database
- ✅ Only sends summary + 3 messages (efficient)
- ✅ Tracks workflow state (drafting_rfp, ready_to_send, etc.)
- ✅ Agent state guides LLM responses
- ✅ Survives page refreshes
- ✅ Multiple conversations per session
- ✅ Clean separation of concerns

## Migration Steps

1. **Run Database Migration**:

   ```bash
   psql -d your_database -f backend/prisma/migrations/20260120000000_add_conversations/migration.sql
   ```

2. **Backend Changes** (Already implemented):

   - ✅ New schema tables
   - ✅ Agent state types
   - ✅ Conversation service
   - ✅ Updated AI service
   - ✅ New API routes
   - ✅ RFP sending validation

3. **Frontend Changes** (Already implemented):
   - ✅ Session management
   - ✅ Conversation loading
   - ✅ New ChatInterface with sidebar
   - ✅ Message sending to new endpoint

## Testing Checklist

- [ ] Create new conversation
- [ ] Send messages and verify persistence
- [ ] Refresh page and verify conversation loads
- [ ] Switch between conversations
- [ ] Verify agent state updates correctly
- [ ] Test RFP creation flow
- [ ] Test RFP sending with agent state validation
- [ ] Verify session isolation (different users)

## Future Enhancements

1. **Conversation Search**: Full-text search across messages
2. **Conversation Export**: Export conversation as PDF/JSON
3. **Agent State Visualization**: UI to view current agent state
4. **Workflow Transitions**: Visual workflow diagram
5. **Multi-user Support**: Proper user authentication
6. **Conversation Archiving**: Archive old conversations
