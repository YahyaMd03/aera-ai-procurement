import express, { Request, Response, NextFunction } from 'express';
import { db } from '../src/db/index.js';
import { rfpsTable, vendorsTable, conversationsTable, sentEmailsTable } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { 
  createConversation, 
  getConversation, 
  getConversationsBySession, 
  getActiveConversation,
  addMessage, 
  updateAgentState, 
  updateConversationStatus,
  getRecentMessages,
  updateConversationTitle,
  normalizeRfpDraft,
  processRfpDraft
} from '../services/conversationService.js';
import { cache, CACHE_TTL } from '../services/cacheService.js';
import { chatWithAgentState, generateConversationTitle } from '../services/aiService.js';
import { summarizeAgentState } from '../src/types/agentState.js';
import type { AgentState } from '../src/types/agentState.js';

const router = express.Router();

/**
 * Middleware to verify sessionId and optionally verify conversation ownership
 * @param requireConversation - If true, validates that conversation exists and belongs to session
 */
async function verifySession(
  req: Request, 
  res: Response, 
  next: NextFunction,
  requireConversation: boolean = false
) {
  try {
    const sessionId = (req.query.sessionId as string) || req.body.sessionId;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    // If conversation verification is required, check conversation access
    if (requireConversation) {
      const conversationId = req.params.id;
      if (!conversationId) {
        return res.status(400).json({ error: 'Conversation ID is required' });
      }

      const conversation = await getConversation(conversationId);
      
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      if (conversation.sessionId !== sessionId) {
        return res.status(403).json({ error: 'Access denied: This conversation does not belong to your session' });
      }

      // Attach conversation to request for use in route handlers
      (req as any).conversation = conversation;
    }

    // Attach sessionId to request
    (req as any).sessionId = sessionId;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware to verify that a conversation belongs to the requesting session
 */
const verifyConversationAccess = (req: Request, res: Response, next: NextFunction) => {
  return verifySession(req, res, next, true);
};

/**
 * Get or create active conversation for a session
 * POST /api/conversations
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    // Try to get active conversation first
    let conversation = await getActiveConversation(sessionId);

    // If no active conversation, create a new one
    if (!conversation) {
      const newConversation = await createConversation(
        sessionId, 
        'Hello! I\'m Aera AI, your procurement assistant. I can help you create RFPs (Request for Proposals), manage vendors, compare proposals, and streamline your procurement process. What would you like to get started with today?'
      );
      conversation = await getConversation(newConversation.id);
    }

    res.json(conversation);
  } catch (error) {
    next(error);
  }
});

/**
 * Get all conversations for a session
 * GET /api/conversations?sessionId=xxx
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionId } = req.query;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId query parameter is required' });
    }

    const conversations = await getConversationsBySession(sessionId);
    res.json(conversations);
  } catch (error) {
    next(error);
  }
});

/**
 * Get a specific conversation
 * GET /api/conversations/:id?sessionId=xxx
 */
router.get('/:id', verifyConversationAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conversation = (req as any).conversation;
    res.json(conversation);
  } catch (error) {
    next(error);
  }
});

/**
 * Send a message in a conversation
 * POST /api/conversations/:id/message
 */
router.post('/:id/message', verifyConversationAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { message } = req.body;
    const conversation = (req as any).conversation;
    const conversationId = conversation.id;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    // Add user message
    await addMessage(conversationId, 'user', message);

    // Get agent state and recent messages
    const agentState = conversation.agentState as AgentState;
    const agentStateSummary = summarizeAgentState(agentState);
    const recentMessages = await getRecentMessages(conversationId, 3);

    // Get context (RFPs and vendors) with caching
    const CACHE_KEY_RFPS = 'rfps:list:10';
    const CACHE_KEY_VENDORS = 'vendors:list:20';
    
    let rfps = cache.get<any[]>(CACHE_KEY_RFPS);
    if (!rfps) {
      rfps = await db.query.rfpsTable.findMany({
        orderBy: (rfpsTable, { desc }) => [desc(rfpsTable.createdAt)],
        limit: 10,
      });
      cache.set(CACHE_KEY_RFPS, rfps, CACHE_TTL.RFPS);
    }

    let vendors = cache.get<any[]>(CACHE_KEY_VENDORS);
    if (!vendors) {
      vendors = await db.query.vendorsTable.findMany({
        limit: 20,
      });
      cache.set(CACHE_KEY_VENDORS, vendors, CACHE_TTL.VENDORS);
    }

    // Call LLM with agent state
    let aiResponse: string;
    let stateUpdate: any = null;
    let showSendButton: boolean = false;
    
    try {
      const result = await chatWithAgentState(
        message,
        agentStateSummary,
        recentMessages.map(m => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content })),
        { rfps, vendors }
      );
      aiResponse = result.response;
      stateUpdate = result.stateUpdate;
      showSendButton = result.showSendButton || false;
    } catch (error: any) {
      // Log error for debugging (server-side only)
      console.error('Error calling chatWithAgentState:', error);
      
      // Determine user-friendly error message
      let userFriendlyError = 'I apologize, but I encountered an issue processing your request. Please try rephrasing your message or try again in a moment.';
      if (error.message?.includes('validation') || error.message?.includes('Expected')) {
        userFriendlyError = 'I had trouble understanding the format of that information. Could you please rephrase your request?';
      } else if (error.message?.includes('API') || error.message?.includes('OpenAI')) {
        userFriendlyError = 'The AI service is temporarily unavailable. Please try again in a moment.';
      }
      
      // Log system message for debugging (but don't add it as a visible message)
      // System messages should not be displayed to users in the chat
      console.error(`[System] Error in conversation ${conversationId}:`, error.message || 'An unexpected error occurred');
      
      // Add a helpful assistant response (not a system error message)
      aiResponse = userFriendlyError;
      
      // Reload conversation to return updated state
      const updatedConversation = await getConversation(conversationId);
      
      return res.status(200).json({
        conversation: updatedConversation,
        message: aiResponse,
        stateUpdate: null,
      });
    }

    // Add assistant response
    await addMessage(conversationId, 'assistant', aiResponse);

    // Update agent state if LLM provided updates
    let updatedState = agentState;
    if (stateUpdate) {
      // Normalize and merge RFP draft if present
      const mergedRfpDraft = stateUpdate.rfpDraft 
        ? normalizeRfpDraft(agentState.rfpDraft || {}, stateUpdate.rfpDraft)
        : agentState.rfpDraft;

      updatedState = await updateAgentState(conversationId, {
        ...stateUpdate,
        rfpDraft: mergedRfpDraft,
      });

      // Process RFP draft - create or update RFP as needed
      if (mergedRfpDraft) {
        try {
          await processRfpDraft(conversationId, updatedState, stateUpdate);
          // Reload state to get updated rfpId if RFP was created
          const reloadedConv = await getConversation(conversationId);
          if (reloadedConv) {
            updatedState = reloadedConv.agentState as AgentState;
          }
        } catch (error) {
          console.error('Error processing RFP draft:', error);
          // Continue without failing the request
        }
      }

      // Update conversation title if AI generated one
      if (stateUpdate.conversationTitle && (!conversation.title || conversation.title === 'New Conversation')) {
        try {
          await updateConversationTitle(conversationId, stateUpdate.conversationTitle);
        } catch (error) {
          console.error('Error updating conversation title:', error);
        }
      }

      // Update conversation status based on workflow step
      if (stateUpdate.workflowStep) {
        let newStatus: 'drafting_rfp' | 'collecting_requirements' | 'ready_to_send' | 'sent' | 'closed' = 'drafting_rfp';
        
        if (stateUpdate.workflowStep === 'ready_to_send') {
          newStatus = 'ready_to_send';
        } else if (stateUpdate.workflowStep === 'collecting_requirements') {
          newStatus = 'collecting_requirements';
        } else if (stateUpdate.workflowStep === 'sent') {
          newStatus = 'sent';
        } else if (stateUpdate.workflowStep === 'closed') {
          newStatus = 'closed';
        }

        await updateConversationStatus(conversationId, newStatus);
      }
    }

    // Reload conversation to return updated state
    const updatedConversation = await getConversation(conversationId);

    res.json({
      conversation: updatedConversation,
      message: aiResponse,
      stateUpdate: stateUpdate || null,
      showSendButton: showSendButton || false,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Create a new conversation
 * POST /api/conversations/new
 */
router.post('/new', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionId, title } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const conversation = await createConversation(
      sessionId, 
      'Hello! I\'m Aera AI, your procurement assistant. I can help you create RFPs (Request for Proposals), manage vendors, compare proposals, and streamline your procurement process. What would you like to get started with today?', 
      title
    );
    const fullConversation = await getConversation(conversation.id);

    res.status(201).json(fullConversation);
  } catch (error) {
    next(error);
  }
});

/**
 * Update conversation title
 * PATCH /api/conversations/:id/title
 */
router.patch('/:id/title', verifyConversationAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title } = req.body;
    const conversationId = req.params.id;

    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'title is required and must be a string' });
    }

    await updateConversationTitle(conversationId, title);
    const updatedConversation = await getConversation(req.params.id);

    res.json(updatedConversation);
  } catch (error) {
    next(error);
  }
});

/**
 * Get sent emails for a conversation
 * GET /api/conversations/:id/sent-emails?sessionId=xxx
 */
router.get('/:id/sent-emails', verifyConversationAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conversationId = req.params.id;

    // Get sent emails for this conversation with related RFP and vendor data
    const sentEmails = await db.query.sentEmailsTable.findMany({
      where: eq(sentEmailsTable.conversationId, conversationId),
      with: {
        rfp: true,
        vendor: true,
      },
      orderBy: (sentEmailsTable, { desc }) => [desc(sentEmailsTable.sentAt)],
    });

    res.json(sentEmails);
  } catch (error) {
    next(error);
  }
});

export default router;
