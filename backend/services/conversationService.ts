import { db } from '../src/db/index.js';
import { conversationsTable, messagesTable, rfpsTable } from '../src/db/schema.js';
import { eq, desc, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type { AgentState, ConversationStatus } from '../src/types/agentState.js';
import { createDefaultAgentState, summarizeAgentState } from '../src/types/agentState.js';

/**
 * Create a new conversation
 */
export async function createConversation(sessionId: string, initialMessage?: string, title?: string) {
  const defaultState = createDefaultAgentState();
  
  const [conversation] = await db.insert(conversationsTable).values({
    id: randomUUID(),
    sessionId,
    title: title || null,
    status: 'drafting_rfp',
    agentState: defaultState as any,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  // Add initial assistant message if provided
  if (initialMessage) {
    await db.insert(messagesTable).values({
      id: randomUUID(),
      conversationId: conversation.id,
      role: 'assistant',
      content: initialMessage,
      createdAt: new Date(),
    });
  }

  return conversation;
}

/**
 * Get conversation by ID with messages
 */
export async function getConversation(conversationId: string) {
  const conversation = await db.query.conversationsTable.findFirst({
    where: eq(conversationsTable.id, conversationId),
    with: {
      messages: {
        orderBy: [desc(messagesTable.createdAt)],
        limit: 100, // Get last 100 messages
      },
    },
  });

  if (!conversation) {
    return null;
  }

  // Reverse messages to chronological order
  conversation.messages.reverse();

  return conversation;
}

/**
 * Get all conversations for a session
 */
export async function getConversationsBySession(sessionId: string) {
  const conversations = await db.query.conversationsTable.findMany({
    where: eq(conversationsTable.sessionId, sessionId),
    orderBy: [desc(conversationsTable.updatedAt)],
    with: {
      messages: {
        orderBy: [desc(messagesTable.createdAt)],
        limit: 1, // Just get the last message for preview
      },
    },
  });

  return conversations;
}

/**
 * Get the most recent active conversation for a session
 */
export async function getActiveConversation(sessionId: string) {
  const conversations = await db.query.conversationsTable.findMany({
    where: and(
      eq(conversationsTable.sessionId, sessionId),
      eq(conversationsTable.status, 'drafting_rfp')
    ),
    orderBy: [desc(conversationsTable.updatedAt)],
    limit: 1,
  });

  if (conversations.length === 0) {
    return null;
  }

  return getConversation(conversations[0].id);
}

/**
 * Add a message to a conversation
 */
export async function addMessage(
  conversationId: string,
  role: 'user' | 'assistant' | 'system',
  content: string
) {
  const [message] = await db.insert(messagesTable).values({
    id: randomUUID(),
    conversationId,
    role,
    content,
    createdAt: new Date(),
  }).returning();

  // Update conversation's updatedAt timestamp
  await db.update(conversationsTable)
    .set({ updatedAt: new Date() })
    .where(eq(conversationsTable.id, conversationId));

  return message;
}

/**
 * Update agent state
 */
export async function updateAgentState(
  conversationId: string,
  state: Partial<AgentState>
) {
  const conversation = await db.query.conversationsTable.findFirst({
    where: eq(conversationsTable.id, conversationId),
  });

  if (!conversation) {
    throw new Error('Conversation not found');
  }

  const currentState = conversation.agentState as AgentState;
  const updatedState: AgentState = {
    ...currentState,
    ...state,
    metadata: {
      ...currentState.metadata,
      ...state.metadata,
      lastUpdated: new Date().toISOString(),
    },
  };

  await db.update(conversationsTable)
    .set({
      agentState: updatedState as any,
      updatedAt: new Date(),
    })
    .where(eq(conversationsTable.id, conversationId));

  return updatedState;
}

/**
 * Update conversation status
 */
export async function updateConversationStatus(
  conversationId: string,
  status: ConversationStatus
) {
  await db.update(conversationsTable)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(eq(conversationsTable.id, conversationId));
}

/**
 * Get recent messages for context (last N messages)
 */
export async function getRecentMessages(conversationId: string, limit: number = 3) {
  const messages = await db.query.messagesTable.findMany({
    where: eq(messagesTable.conversationId, conversationId),
    orderBy: [desc(messagesTable.createdAt)],
    limit,
  });

  // Reverse to chronological order
  return messages.reverse();
}

/**
 * Update conversation title
 */
export async function updateConversationTitle(conversationId: string, title: string) {
  await db.update(conversationsTable)
    .set({
      title,
      updatedAt: new Date(),
    })
    .where(eq(conversationsTable.id, conversationId));
}

/**
 * Normalize RFP draft structure - handles malformed data from AI
 */
export function normalizeRfpDraft(existingDraft: any, draftUpdate: any): any {
  // Normalize existing rfpDraft requirements if it's a string
  let normalizedExistingRfpDraft = { ...existingDraft };
  
  if (normalizedExistingRfpDraft.requirements && typeof normalizedExistingRfpDraft.requirements === 'string') {
    try {
      normalizedExistingRfpDraft.requirements = JSON.parse(normalizedExistingRfpDraft.requirements);
    } catch (e) {
      delete normalizedExistingRfpDraft.requirements;
    }
  }

  if (!draftUpdate) {
    return normalizedExistingRfpDraft;
  }

  const update = { ...draftUpdate };
  
  // Normalize structure: move items from top level to requirements.items if needed
  if (update.items && !update.requirements?.items) {
    if (!update.requirements) {
      update.requirements = {};
    }
    if (typeof update.items === 'string') {
      try {
        update.requirements.items = JSON.parse(update.items);
      } catch {
        update.requirements.items = [{ name: update.items }];
      }
    } else if (Array.isArray(update.items)) {
      update.requirements.items = update.items;
    }
    delete update.items;
  }
  
  // Move deliveryRequirements to requirements.deliveryDays if needed
  if (update.deliveryRequirements && !update.requirements?.deliveryDays) {
    if (!update.requirements) {
      update.requirements = {};
    }
    const deliveryDays = typeof update.deliveryRequirements === 'string' 
      ? parseInt(update.deliveryRequirements) 
      : update.deliveryRequirements;
    if (!isNaN(deliveryDays)) {
      update.requirements.deliveryDays = deliveryDays;
    }
    delete update.deliveryRequirements;
  }
  
  // Normalize budget and deadline
  if (update.budget === '' || update.budget === null) {
    delete update.budget;
  } else if (typeof update.budget === 'string') {
    const budgetNum = parseFloat(update.budget);
    update.budget = isNaN(budgetNum) ? undefined : budgetNum;
  }
  
  if (update.deadline === '' || update.deadline === null) {
    delete update.deadline;
  }
  
  // Merge drafts
  return {
    ...normalizedExistingRfpDraft,
    ...update,
    requirements: (update.requirements || normalizedExistingRfpDraft.requirements)
      ? {
          ...(normalizedExistingRfpDraft.requirements || {}),
          ...(update.requirements || {}),
          items: [
            ...(normalizedExistingRfpDraft.requirements?.items || []),
            ...(update.requirements?.items || []),
          ].filter((item, index, self) => 
            index === self.findIndex((i) => i.name === item.name)
          ),
        }
      : undefined,
  };
}

/**
 * Update existing RFP from draft
 */
export async function updateRfpFromDraft(rfpId: string, mergedRfpDraft: any): Promise<void> {
  const existingRfp = await db.query.rfpsTable.findFirst({
    where: eq(rfpsTable.id, rfpId),
  });

  if (!existingRfp) {
    return;
  }

  const requirements = {
    items: mergedRfpDraft.requirements?.items || [],
    deliveryDays: mergedRfpDraft.requirements?.deliveryDays || null,
    paymentTerms: mergedRfpDraft.requirements?.paymentTerms || null,
    warranty: mergedRfpDraft.requirements?.warranty || null,
    otherRequirements: mergedRfpDraft.requirements?.otherRequirements || [],
  };

  const updateData: any = {
    updatedAt: new Date(),
  };

  // Update title if provided and different from current
  // If current title is "Auto-generated title" and we have a description, use description as title
  if (existingRfp.title === 'Auto-generated title' && mergedRfpDraft.description && 
      mergedRfpDraft.description.trim() !== '') {
    // Generate title from description (first 40 chars)
    const titleFromDesc = mergedRfpDraft.description.length > 40 
      ? mergedRfpDraft.description.substring(0, 40).trim() + '...'
      : mergedRfpDraft.description.trim();
    updateData.title = titleFromDesc;
  } else if (mergedRfpDraft.title && 
      mergedRfpDraft.title.trim() !== '' && 
      mergedRfpDraft.title !== 'Auto-generated title' &&
      mergedRfpDraft.title !== existingRfp.title) {
    updateData.title = mergedRfpDraft.title;
  }

  if (mergedRfpDraft.description && 
      mergedRfpDraft.description.trim() !== '' &&
      mergedRfpDraft.description !== existingRfp.description) {
    updateData.description = mergedRfpDraft.description;
  }

  if (mergedRfpDraft.budget !== undefined && mergedRfpDraft.budget !== null) {
    updateData.budget = mergedRfpDraft.budget;
  }

  if (mergedRfpDraft.deadline) {
    updateData.deadline = new Date(mergedRfpDraft.deadline);
  }

  const hasRequirementsData = 
    (mergedRfpDraft.requirements?.items && mergedRfpDraft.requirements.items.length > 0) ||
    mergedRfpDraft.requirements?.deliveryDays ||
    mergedRfpDraft.requirements?.paymentTerms ||
    mergedRfpDraft.requirements?.warranty ||
    (mergedRfpDraft.requirements?.otherRequirements && mergedRfpDraft.requirements.otherRequirements.length > 0);

  if (hasRequirementsData) {
    updateData.requirements = requirements;
  }

  if (Object.keys(updateData).length > 1) {
    // Invalidate comparison cache if requirements or budget changed
    if (updateData.requirements || updateData.budget !== undefined) {
      updateData.comparisonCache = null;
      updateData.comparisonCacheUpdatedAt = null;
    }
    
    await db.update(rfpsTable)
      .set(updateData)
      .where(eq(rfpsTable.id, rfpId));
  }
}

/**
 * Create new RFP from draft
 */
export async function createRfpFromDraft(mergedRfpDraft: any): Promise<string | null> {
  const hasTitle = mergedRfpDraft.title && mergedRfpDraft.title.trim() !== '';
  const hasDescription = mergedRfpDraft.description && mergedRfpDraft.description.trim() !== '';
  const hasItems = mergedRfpDraft.requirements?.items && mergedRfpDraft.requirements.items.length > 0;
  
  if (!hasTitle || (!hasDescription && !hasItems)) {
    return null;
  }

  const requirements = {
    items: mergedRfpDraft.requirements?.items || [],
    deliveryDays: mergedRfpDraft.requirements?.deliveryDays || null,
    paymentTerms: mergedRfpDraft.requirements?.paymentTerms || null,
    warranty: mergedRfpDraft.requirements?.warranty || null,
    otherRequirements: mergedRfpDraft.requirements?.otherRequirements || [],
  };
  
  // If title is "Auto-generated title", generate a better title from description
  let finalTitle = mergedRfpDraft.title!;
  if (finalTitle === 'Auto-generated title' && mergedRfpDraft.description) {
    const desc = mergedRfpDraft.description.trim();
    finalTitle = desc.length > 50 
      ? desc.substring(0, 50).trim() + '...'
      : desc;
  }

  const [rfp] = await db.insert(rfpsTable).values({
    id: randomUUID(),
    title: finalTitle,
    description: mergedRfpDraft.description || finalTitle,
    budget: mergedRfpDraft.budget || null,
    deadline: mergedRfpDraft.deadline ? new Date(mergedRfpDraft.deadline) : null,
    requirements: requirements as any,
    status: 'draft',
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();
  
  return rfp.id;
}

/**
 * Process RFP draft - creates or updates RFP based on draft state
 * Returns the RFP ID if created/updated, null otherwise
 */
export async function processRfpDraft(
  conversationId: string,
  agentState: AgentState,
  stateUpdate: any
): Promise<string | null> {
  if (!stateUpdate.rfpDraft) {
    return agentState.rfpId || null;
  }

  const existingRfpDraft = agentState.rfpDraft || {};
  const mergedRfpDraft = normalizeRfpDraft(existingRfpDraft, stateUpdate.rfpDraft);

  // Update existing RFP if rfpId exists
  if (agentState.rfpId) {
    await updateRfpFromDraft(agentState.rfpId, mergedRfpDraft);
    return agentState.rfpId;
  }

  // Create new RFP if we have enough information
  const newRfpId = await createRfpFromDraft(mergedRfpDraft);
  
  if (newRfpId) {
    await updateAgentState(conversationId, {
      rfpId: newRfpId,
      workflowStep: 'ready_to_send',
      lastAction: 'RFP created automatically from collected information',
    });
    await updateConversationStatus(conversationId, 'ready_to_send');
  }

  return newRfpId;
}
