import express, { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { createRFPFromNaturalLanguage, compareProposals, chatWithAI } from '../services/aiService.js';
import { sendRFPEmail } from '../services/emailService.js';
import { db } from '../src/db/index.js';
import { rfpsTable, vendorsTable, sentEmailsTable } from '../src/db/schema.js';
import { eq, inArray } from 'drizzle-orm';

const router = express.Router();

// Create RFP from natural language
router.post('/create-rfp', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userInput } = req.body;

    if (!userInput) {
      return res.status(400).json({ error: 'userInput is required' });
    }

    const rfpData = await createRFPFromNaturalLanguage(userInput);

    // Save to database
    const now = new Date();
    const [rfp] = await db.insert(rfpsTable).values({
      id: randomUUID(),
      title: rfpData.title,
      description: rfpData.description,
      budget: rfpData.budget,
      deadline: rfpData.deadline,
      requirements: rfpData.requirements,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    }).returning();

    res.status(201).json(rfp);
  } catch (error) {
    next(error);
  }
});

// Send RFP to vendors
router.post('/send-rfp', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rfpId, vendorIds, conversationId } = req.body;

    if (!rfpId || !vendorIds || !Array.isArray(vendorIds) || vendorIds.length === 0) {
      return res.status(400).json({ error: 'RFP ID and vendor IDs array are required' });
    }

    const rfp = await db.query.rfpsTable.findFirst({
      where: eq(rfpsTable.id, rfpId),
    });

    if (!rfp) {
      return res.status(404).json({ error: 'RFP not found' });
    }

    // If conversationId provided, verify RFP belongs to conversation
    if (conversationId) {
      const { getConversation } = await import('../services/conversationService.js');
      const conversation = await getConversation(conversationId);
      
      if (conversation) {
        const agentState = conversation.agentState as any;
        // Verify the RFP ID matches (if agent state has one)
        if (agentState.rfpId && agentState.rfpId !== rfpId) {
          return res.status(400).json({ 
            error: 'RFP ID does not match the conversation\'s RFP' 
          });
        }
        // Allow sending if RFP exists, even if workflow step isn't exactly 'ready_to_send'
        // This allows users to send RFPs directly from the chat interface
      }
    }

    const vendors = await db.query.vendorsTable.findMany({
      where: inArray(vendorsTable.id, vendorIds),
    });

    if (vendors.length !== vendorIds.length) {
      return res.status(400).json({ error: 'One or more vendors not found' });
    }

    const results: Array<{
      vendorId: string;
      vendorName: string;
      success: boolean;
      messageId?: string;
      error?: string;
    }> = [];

    const now = new Date();
    
    // Helper function to process a single vendor email
    const processVendorEmail = async (vendor: typeof vendors[0]) => {
      try {
        const emailResult = await sendRFPEmail(vendor, rfp);
        
        // Always save sent email record (conversationId is optional)
        await db.insert(sentEmailsTable).values({
          id: randomUUID(),
          conversationId: conversationId || null,
          rfpId: rfpId,
          vendorId: vendor.id,
          emailMessageId: emailResult.messageId,
          subject: emailResult.subject,
          body: emailResult.body,
          sentAt: now,
        });
        
        return {
          vendorId: vendor.id,
          vendorName: vendor.name,
          success: true,
          messageId: emailResult.messageId,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to send RFP to vendor ${vendor.name} (${vendor.email}):`, errorMessage);
        return {
          vendorId: vendor.id,
          vendorName: vendor.name,
          success: false,
          error: errorMessage,
        };
      }
    };

    // Process vendors in parallel with concurrency limit (5 at a time)
    const CONCURRENCY_LIMIT = 5;
    for (let i = 0; i < vendors.length; i += CONCURRENCY_LIMIT) {
      const batch = vendors.slice(i, i + CONCURRENCY_LIMIT);
      const batchResults = await Promise.all(batch.map(processVendorEmail));
      results.push(...batchResults);
    }

    // Update RFP status to 'sent'
    await db.update(rfpsTable)
      .set({ status: 'sent', updatedAt: now })
      .where(eq(rfpsTable.id, rfpId));

    // If conversationId provided, update conversation state
    if (conversationId) {
      const { updateAgentState, updateConversationStatus, addMessage } = await import('../services/conversationService.js');
      await updateAgentState(conversationId, {
        workflowStep: 'sent',
        lastAction: `RFP sent to ${results.filter(r => r.success).length} vendor(s)`,
      });
      await updateConversationStatus(conversationId, 'sent');
      await addMessage(conversationId, 'system', `RFP successfully sent to ${results.filter(r => r.success).length} vendor(s).`);
    }

    res.json({ results });
  } catch (error) {
    next(error);
  }
});

// Compare proposals for an RFP
router.get('/compare/:rfpId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rfpId } = req.params;
    const { refresh } = req.query; // Allow manual refresh via ?refresh=true

    const rfp = await db.query.rfpsTable.findFirst({
      where: eq(rfpsTable.id, rfpId),
      with: {
        proposals: {
          with: {
            vendor: true,
          },
        },
      },
    });

    if (!rfp) {
      return res.status(404).json({ error: 'RFP not found' });
    }

    if (rfp.proposals.length === 0) {
      return res.status(400).json({ error: 'No proposals found for this RFP' });
    }

    // Check cache first (unless refresh is requested)
    let comparison;
    if (!refresh && rfp.comparisonCache && rfp.comparisonCacheUpdatedAt) {
      // Check if cache is still valid
      // Cache is valid if:
      // 1. It was updated after the last proposal update
      // 2. The number of proposals matches what was cached
      const cachedComparison = rfp.comparisonCache as any;
      const cachedProposalCount = cachedComparison.evaluations?.length || 0;
      const currentProposalCount = rfp.proposals.length;
      
      const lastProposalUpdate = rfp.proposals.reduce((latest: Date | null, proposal: any) => {
        const proposalUpdate = proposal.updatedAt ? new Date(proposal.updatedAt) : null;
        if (!latest) return proposalUpdate;
        if (!proposalUpdate) return latest;
        return proposalUpdate > latest ? proposalUpdate : latest;
      }, null);

      const cacheUpdate = new Date(rfp.comparisonCacheUpdatedAt);
      
      // Cache is valid if proposal count matches and cache is newer than last proposal update
      const proposalCountMatches = cachedProposalCount === currentProposalCount;
      const cacheIsNewer = !lastProposalUpdate || cacheUpdate >= lastProposalUpdate;
      
      if (proposalCountMatches && cacheIsNewer) {
        console.log(`[Compare] Using cached comparison for RFP ${rfpId} (${currentProposalCount} proposals)`);
        comparison = rfp.comparisonCache;
      } else {
        if (!proposalCountMatches) {
          console.log(`[Compare] Cache invalidated - proposal count changed (${cachedProposalCount} -> ${currentProposalCount})`);
        } else {
          console.log(`[Compare] Cache invalidated - proposals updated after cache`);
        }
        comparison = null; // Will regenerate below
      }
    }

    // Generate new comparison if cache miss or refresh requested
    if (!comparison || refresh) {
      console.log(`[Compare] Generating new comparison for RFP ${rfpId}${refresh ? ' (manual refresh)' : ''}`);
      comparison = await compareProposals(rfp, rfp.proposals);
      
      // Save to cache
      await db.update(rfpsTable)
        .set({
          comparisonCache: comparison as any,
          comparisonCacheUpdatedAt: new Date(),
        })
        .where(eq(rfpsTable.id, rfpId));
    }

    res.json({
      rfp,
      comparison,
      cached: !refresh && !!rfp.comparisonCache && !!rfp.comparisonCacheUpdatedAt,
    });
  } catch (error) {
    next(error);
  }
});

// Get email configuration status (minimal info, no sensitive data)
// Only returns whether email is configured, not the actual configuration
router.get('/email-config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const isConfigured = !!(
      process.env.SMTP_HOST && 
      process.env.SMTP_USER && 
      process.env.SMTP_PASSWORD
    );

    // Only return configuration status, not sensitive details
    res.json({
      configured: isConfigured,
    });
  } catch (error) {
    next(error);
  }
});

// General chat endpoint
router.post('/chat', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { message, conversationHistory } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    // Get context (RFPs and vendors) for better responses
    const rfps = await db.query.rfpsTable.findMany({
      orderBy: (rfpsTable, { desc }) => [desc(rfpsTable.createdAt)],
      limit: 10,
    });

    const vendors = await db.query.vendorsTable.findMany({
      limit: 20,
    });

    const response = await chatWithAI(message, conversationHistory || [], {
      rfps,
      vendors,
    });

    res.json({ response });
  } catch (error) {
    next(error);
  }
});

export default router;
