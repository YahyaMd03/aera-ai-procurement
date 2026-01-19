/**
 * Agent State Interface
 * Tracks the current state of the procurement workflow
 */

export type ConversationStatus = 
  | 'drafting_rfp' 
  | 'collecting_requirements' 
  | 'ready_to_send' 
  | 'sent' 
  | 'closed';

export type WorkflowStep = 
  | 'initial' 
  | 'collecting_requirements' 
  | 'drafting_rfp' 
  | 'reviewing_rfp' 
  | 'selecting_vendors' 
  | 'ready_to_send' 
  | 'sent' 
  | 'waiting_for_proposals' 
  | 'comparing_proposals' 
  | 'closed';

export interface RFPDraft {
  title?: string;
  description?: string;
  budget?: number;
  deadline?: string; // ISO date string
  requirements?: {
    items?: Array<{
      name: string;
      quantity?: number;
      specifications?: string;
    }>;
    deliveryDays?: number;
    paymentTerms?: string;
    warranty?: string;
    otherRequirements?: string[];
  };
  vendorsSelected?: string[]; // Array of vendor IDs
  missingFields?: string[]; // Fields that still need to be collected
}

export interface AgentState {
  workflowStep: WorkflowStep;
  rfpDraft?: RFPDraft;
  lastAction?: string; // Description of last action taken
  rfpId?: string; // ID of created RFP (if any)
  metadata?: {
    startedAt?: string;
    lastUpdated?: string;
    [key: string]: any;
  };
}

/**
 * Default agent state
 */
export function createDefaultAgentState(): AgentState {
  return {
    workflowStep: 'initial',
    rfpDraft: {
      missingFields: ['title', 'description', 'requirements'],
    },
    lastAction: 'Conversation started',
    metadata: {
      startedAt: new Date().toISOString(),
    },
  };
}

/**
 * Summarize agent state for LLM context
 */
export function summarizeAgentState(state: AgentState): string {
  const parts: string[] = [];
  
  parts.push(`Workflow Step: ${state.workflowStep}`);
  
  if (state.rfpDraft) {
    const draft = state.rfpDraft;
    parts.push('\nRFP Draft Status:');
    
    if (draft.title) parts.push(`- Title: ${draft.title}`);
    if (draft.description) parts.push(`- Description: ${draft.description}`);
    if (draft.budget) parts.push(`- Budget: $${draft.budget.toLocaleString()}`);
    if (draft.deadline) parts.push(`- Deadline: ${draft.deadline}`);
    
    if (draft.requirements?.items && draft.requirements.items.length > 0) {
      parts.push(`- Items: ${draft.requirements.items.length} item(s) specified`);
    }
    
    if (draft.vendorsSelected && draft.vendorsSelected.length > 0) {
      parts.push(`- Vendors Selected: ${draft.vendorsSelected.length} vendor(s)`);
    }
    
    if (draft.missingFields && draft.missingFields.length > 0) {
      parts.push(`- Missing Fields: ${draft.missingFields.join(', ')}`);
    }
  }
  
  if (state.rfpId) {
    parts.push(`\nRFP Created: ${state.rfpId}`);
  }
  
  if (state.lastAction) {
    parts.push(`\nLast Action: ${state.lastAction}`);
  }
  
  return parts.join('\n');
}
