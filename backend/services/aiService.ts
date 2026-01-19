import OpenAI from 'openai';
import { z } from 'zod';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Schema for RFP structure
const RFPSchema = z.object({
  title: z.string(),
  description: z.string(),
  budget: z.number().nullable().optional(),
  deadline: z.string().nullable().optional(), // ISO date string
  requirements: z.object({
    items: z.array(z.object({
      name: z.string(),
      quantity: z.number().optional(),
      specifications: z.string().optional(),
    })),
    deliveryDays: z.number().nullable().optional(),
    paymentTerms: z.string().nullable().optional(),
    warranty: z.string().nullable().optional(),
    otherRequirements: z.array(z.string()).optional(),
  }),
});

// Schema for proposal parsing
const ProposalSchema = z.object({
  totalPrice: z.number().nullable().optional(),
  itemPrices: z.array(z.object({
    item: z.string(),
    price: z.number(),
    quantity: z.number().optional(),
  })).optional(),
  deliveryDays: z.number().nullable().optional(),
  paymentTerms: z.string().nullable().optional(),
  warranty: z.string().nullable().optional(),
  // Accept both string and array for notes, normalize to string
  notes: z.union([
    z.string(),
    z.array(z.string()),
  ]).nullable().optional().transform((val) => {
    if (val === null || val === undefined) return null;
    if (Array.isArray(val)) {
      return val.join('\n');
    }
    return val;
  }),
  completeness: z.number().min(0).max(1).optional(), // 0-1 score
});

export interface RFPData {
  title: string;
  description: string;
  budget: number | null;
  deadline: Date | null;
  requirements: {
    items: Array<{
      name: string;
      quantity?: number;
      specifications?: string;
    }>;
    deliveryDays?: number | null;
    paymentTerms?: string | null;
    warranty?: string | null;
    otherRequirements?: string[];
  };
}

export interface ProposalData {
  totalPrice?: number | null;
  itemPrices?: Array<{
    item: string;
    price: number;
    quantity?: number;
  }>;
  deliveryDays?: number | null;
  paymentTerms?: string | null;
  warranty?: string | null;
  notes?: string | null;
  completeness?: number;
}

/**
 * Convert natural language procurement request into structured RFP
 */
export async function createRFPFromNaturalLanguage(userInput: string): Promise<RFPData> {
  const prompt = `You are an AI assistant that helps convert natural language procurement requests into structured RFPs (Request for Proposal).

User request: "${userInput}"

Extract the following information and return it as JSON:
- title: A concise title for this RFP
- description: A clear description of what needs to be procured
- budget: Total budget amount (number, or null if not specified)
- deadline: Delivery deadline in ISO 8601 format (or null if not specified)
- requirements: An object containing:
  - items: Array of items with name, quantity (if specified), and specifications
  - deliveryDays: Number of days for delivery (or null)
  - paymentTerms: Payment terms mentioned (or null)
  - warranty: Warranty requirements (or null)
  - otherRequirements: Array of any other requirements mentioned

Be precise and extract all numerical values, dates, and specifications. If something is not mentioned, use null.

Return ONLY valid JSON, no markdown, no code blocks.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a precise JSON extraction assistant. Always return valid JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('No content in OpenAI response');
    }
    const parsed = JSON.parse(content);
    
    // Validate with Zod
    const validated = RFPSchema.parse(parsed);
    
    // Convert deadline string to Date if present and normalize budget
    const result: RFPData = {
      ...validated,
      budget: validated.budget ?? null,
      deadline: validated.deadline ? new Date(validated.deadline) : null,
    };
    
    return result;
  } catch (error) {
    console.error('Error creating RFP from natural language:', error);
    throw new Error(`Failed to parse RFP: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parse vendor response email into structured proposal data
 */
export async function parseVendorResponse(emailBody: string, attachments: any[] = []): Promise<ProposalData> {
  const attachmentsText = attachments.length > 0
    ? `\n\nAttachments found: ${attachments.length} file(s)`
    : '';

  const prompt = `You are an AI assistant that extracts structured proposal data from vendor response emails.

Email content:
${emailBody}
${attachmentsText}

Extract the following information and return it as JSON:
- totalPrice: Total price quoted (number, or null if not found)
- itemPrices: Array of items with their prices (optional)
  - item: Item name/description
  - price: Price for this item
  - quantity: Quantity (if specified)
- deliveryDays: Number of days for delivery (or null)
- paymentTerms: Payment terms (or null)
- warranty: Warranty offered (or null)
- notes: Any additional notes or conditions
- completeness: A score from 0 to 1 indicating how complete this proposal is (1 = very complete, 0 = very incomplete)

Be thorough and extract all pricing information, even if it's in tables or lists. If prices are mentioned in different currencies or formats, normalize to a single number.

Return ONLY valid JSON, no markdown, no code blocks.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a precise JSON extraction assistant. Always return valid JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('No content in OpenAI response');
    }
    const parsed = JSON.parse(content);
    
    // Validate with Zod
    const validated = ProposalSchema.parse(parsed);
    
    return validated;
  } catch (error) {
    console.error('Error parsing vendor response:', error);
    throw new Error(`Failed to parse vendor response: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * General conversational chat with context about RFPs, vendors, and proposals
 * @deprecated Use chatWithAgentState instead for persistent conversations
 */
export async function chatWithAI(
  userMessage: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  context?: {
    rfps?: any[];
    vendors?: any[];
  }
): Promise<string> {
  const contextInfo = context
    ? `
Current Context:
- RFPs: ${context.rfps?.length || 0} RFPs available
- Vendors: ${context.vendors?.length || 0} vendors in system
${context.rfps && context.rfps.length > 0 ? `Recent RFPs: ${context.rfps.slice(0, 3).map((r: any) => r.title).join(', ')}` : ''}
${context.vendors && context.vendors.length > 0 ? `Available Vendors: ${context.vendors.slice(0, 5).map((v: any) => v.name).join(', ')}` : ''}
`
    : '';

  const systemPrompt = `You are Aera AI, a helpful AI procurement assistant. You help users with:
- Creating RFPs (Request for Proposals) from natural language
- Managing vendors and sending RFPs to them
- Comparing vendor proposals
- Answering questions about procurement processes

You can understand natural language requests and guide users through the procurement workflow. Be conversational, helpful, and proactive. If a user asks about something you can help with (like creating an RFP), guide them on how to do it.

${contextInfo}

Keep responses concise but informative. If the user is asking about something specific (like an RFP or vendor), you can reference the context provided.`;

  try {
    const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-10), // Keep last 10 messages for context
      { role: 'user', content: userMessage },
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages as any,
      temperature: 0.7, // Higher temperature for more natural conversation
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('No content in OpenAI response');
    }

    return content;
  } catch (error) {
    console.error('Error in chat:', error);
    throw new Error(`Failed to get chat response: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Normalize state update to handle common LLM response issues
 */
function normalizeStateUpdate(stateUpdate: any): any {
  if (!stateUpdate || typeof stateUpdate !== 'object') {
    return stateUpdate;
  }

  const normalized = { ...stateUpdate };

  // Handle rfpDraft normalization
  if (normalized.rfpDraft && typeof normalized.rfpDraft === 'object') {
    normalized.rfpDraft = { ...normalized.rfpDraft };

    // If requirements is a string, try to parse it
    if (normalized.rfpDraft.requirements !== undefined) {
      if (typeof normalized.rfpDraft.requirements === 'string') {
        try {
          // Try to parse as JSON
          const parsed = JSON.parse(normalized.rfpDraft.requirements);
          if (typeof parsed === 'object' && parsed !== null) {
            normalized.rfpDraft.requirements = parsed;
          } else {
            // If parsed value is not an object, remove it
            console.warn('Parsed requirements is not an object, removing it:', parsed);
            delete normalized.rfpDraft.requirements;
          }
        } catch (e) {
          // If parsing fails, remove it
          console.warn('Failed to parse requirements string, removing it:', normalized.rfpDraft.requirements);
          delete normalized.rfpDraft.requirements;
        }
      } else if (typeof normalized.rfpDraft.requirements !== 'object' || normalized.rfpDraft.requirements === null) {
        // If it's not a string and not an object, remove it
        delete normalized.rfpDraft.requirements;
      }
    }
  }

  return normalized;
}

/**
 * Agent state update schema for LLM response parsing
 * Uses union to handle string requirements that should be objects
 */
const AgentStateUpdateSchema = z.object({
  workflowStep: z.enum(['initial', 'collecting_requirements', 'drafting_rfp', 'reviewing_rfp', 'selecting_vendors', 'ready_to_send', 'sent', 'waiting_for_proposals', 'comparing_proposals', 'closed']).optional(),
  conversationTitle: z.string().optional(), // Auto-generated title (3-4 words) for the conversation
  rfpDraft: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    budget: z.number().nullable().optional(),
    deadline: z.string().nullable().optional(), // Allow null for deadline
    requirements: z.union([
      z.object({
        items: z.array(z.object({
          name: z.string(),
          quantity: z.number().optional(),
          specifications: z.string().optional(),
        })).optional(),
        deliveryDays: z.number().optional(),
        paymentTerms: z.string().optional(),
        warranty: z.string().optional(),
        otherRequirements: z.array(z.string()).optional(),
      }),
      z.string().transform((str) => {
        // If it's a string, try to parse it or return empty object
        try {
          const parsed = JSON.parse(str);
          return typeof parsed === 'object' && parsed !== null ? parsed : {};
        } catch {
          return {};
        }
      }),
    ]).optional(),
    vendorsSelected: z.array(z.string()).optional(),
    missingFields: z.array(z.string()).optional(),
  }).optional(),
  lastAction: z.string().optional(),
  rfpId: z.string().optional(),
}).optional();

/**
 * Chat with AI using agent state and recent messages
 * Returns both the response and updated agent state
 */
export async function chatWithAgentState(
  userMessage: string,
  agentStateSummary: string,
  recentMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [],
  context?: {
    rfps?: any[];
    vendors?: any[];
  }
): Promise<{ response: string; stateUpdate: any; showSendButton: boolean }> {
  const contextInfo = context
    ? `
Current System Context:
- RFPs: ${context.rfps?.length || 0} RFPs available
- Vendors: ${context.vendors?.length || 0} vendors in system
${context.rfps && context.rfps.length > 0 ? `Recent RFPs: ${context.rfps.slice(0, 3).map((r: any) => r.title).join(', ')}` : ''}
${context.vendors && context.vendors.length > 0 ? `Available Vendors: ${context.vendors.slice(0, 5).map((v: any) => v.name).join(', ')}` : ''}
`
    : '';

  const systemPrompt = `You are Aera AI, a helpful AI procurement assistant. You help users with:
- Creating RFPs (Request for Proposals) from natural language
- Managing vendors and sending RFPs to them
- Comparing vendor proposals
- Answering questions about procurement processes

Current Agent State:
${agentStateSummary}

${contextInfo}

Your role:
1. Guide users through the procurement workflow
2. Collect information needed for RFPs (NEVER ask for title - generate it automatically)
3. Update the agent state as you gather information
4. Be conversational, helpful, and proactive
5. Automatically generate conversation titles when users mention procurement needs

IMPORTANT RULES:
- NEVER ask the user for a title. Always generate it automatically based on their procurement request.
- When the user mentions a procurement need (items, services, equipment, etc.), automatically generate a conversationTitle (3-4 words, concise and descriptive).
- Only ask for essential RFP details: items with quantities/specifications, budget, deadline, delivery requirements, payment terms, warranty needs.
- Do NOT ask for title, description (extract from context), or other information that can be inferred.
- Structure rfpDraft correctly: title, description, budget, deadline at top level; items, deliveryDays, paymentTerms, warranty inside requirements object.
- NEVER mention title or description in your conversational responses - these are internal fields only used for menu/list display.
- When summarizing RFP information in responses, ONLY mention procurement-related fields: items (with quantities/specifications), budget, deadline/delivery days, payment terms, warranty, and other requirements.

RFP DRAFT STRUCTURE (IMPORTANT - follow this exactly):
{
  "title": "Auto-generated title (3-4 words)",
  "description": "Clear description extracted from conversation",
  "budget": number or null,
  "deadline": "ISO date string or null",
  "requirements": {
    "items": [
      {"name": "item name", "quantity": number (optional), "specifications": "string (optional)"}
    ],
    "deliveryDays": number or null,
    "paymentTerms": "string or null",
    "warranty": "string or null",
    "otherRequirements": ["string array"]
  },
  "missingFields": ["list of missing fields"]
}

WORKFLOW STEPS:
- "initial": Starting conversation
- "collecting_requirements": Gathering RFP information
- "drafting_rfp": Creating RFP draft
- "ready_to_send": RFP is complete and ready to send (set this when you have title, description, and at least items)
- "selecting_vendors": User is selecting vendors
- "sent": RFP has been sent

After responding, you should also provide an updated agent state in JSON format if the conversation has progressed. Include:
- conversationTitle: A concise 3-4 word title for this conversation (only if user mentioned procurement needs and title is not already set)
- workflowStep: Current step in the workflow. Set to "ready_to_send" when RFP has enough information (title, description, items)
- rfpDraft: Any RFP information collected - MUST follow the structure above
- lastAction: Description of what just happened
- missingFields: Fields that still need to be collected (NEVER include "title" in missingFields)

Return your response in this format:
{
  "response": "Your conversational response to the user",
  "showSendButton": true/false (set to true ONLY when user confirms they want to send the RFP),
  "stateUpdate": {
    "conversationTitle": "Laptop Procurement Office" (only if generating new title),
    "workflowStep": "ready_to_send" (when RFP is complete),
    "rfpDraft": { 
      "title": "Office Laptop Procurement",
      "description": "...",
      "requirements": {
        "items": [...]
      }
    },
    "lastAction": "...",
    "missingFields": [...]
  }
}

CRITICAL RESPONSE RULES:
- When summarizing RFP information in your "response" field, DO NOT mention title or description.
- ONLY include procurement-related fields in your summaries: items (with quantities/specifications), budget, deadline/delivery days, payment terms, warranty, and other requirements.
- Title and description are stored internally (in stateUpdate.rfpDraft) but should NEVER appear in the conversational response text.
- Example good response: "Your RFP includes: 20 laptops, budget of $50,000, delivery in 30 days, payment terms of online and USD, and 2 years warranty."
- Example bad response: "Title: Auto-generated title. Description: Request for proposal..."

IMPORTANT: Only set "showSendButton": true when:
- The user explicitly confirms they want to send the RFP (e.g., "yes, send it", "go ahead", "send to vendors", etc.)
- AND the RFP has enough information to be sent (has title, description, and items)
- Do NOT set it to true just because the RFP is ready - wait for user confirmation

If no state update is needed, set stateUpdate to null.`;

  try {
    const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...recentMessages.slice(-3), // Last 3 messages for tone continuity
      { role: 'user', content: userMessage },
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages as any,
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('No content in OpenAI response');
    }

    const parsed = JSON.parse(content);
    
    // Validate response structure
    if (!parsed.response) {
      throw new Error('LLM response missing "response" field');
    }

    // Extract showSendButton flag if present
    const showSendButton = parsed.showSendButton === true;

    // Normalize and validate state update if provided
    let stateUpdate = null;
    if (parsed.stateUpdate) {
      // Preprocess state update to handle common issues
      const normalizedStateUpdate = normalizeStateUpdate(parsed.stateUpdate);
      
      // Use safeParse to handle validation errors gracefully
      const validationResult = AgentStateUpdateSchema.safeParse(normalizedStateUpdate);
      
      if (validationResult.success) {
        stateUpdate = validationResult.data;
      } else {
        // If validation fails, try to salvage what we can by removing invalid fields
        // This prevents the entire request from failing
        const salvaged = { ...normalizedStateUpdate };
        if (salvaged.rfpDraft?.requirements && typeof salvaged.rfpDraft.requirements !== 'object') {
          delete salvaged.rfpDraft.requirements;
        }
        
        // Try validation again with salvaged data
        const retryResult = AgentStateUpdateSchema.safeParse(salvaged);
        if (retryResult.success) {
          stateUpdate = retryResult.data;
        } else {
          // If still failing, just use the normalized data without strict validation
          // This is better than failing the entire request
          stateUpdate = salvaged;
        }
      }
    }

    return {
      response: parsed.response,
      stateUpdate,
      showSendButton: showSendButton || false,
    };
  } catch (error) {
    console.error('Error in chatWithAgentState:', error);
    throw new Error(`Failed to get chat response: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate a conversation title from the first few messages
 */
export async function generateConversationTitle(messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>): Promise<string> {
  // Get the first user message and a few subsequent messages
  const userMessages = messages.filter(m => m.role === 'user').slice(0, 3);
  
  if (userMessages.length === 0) {
    return 'New Conversation';
  }

  const messagesText = userMessages.map(m => m.content).join('\n');

  const prompt = `Based on the following conversation messages, generate a concise, descriptive title (3-4 words) that captures the main topic or purpose of this conversation.

Messages:
${messagesText}

Return ONLY the title text, nothing else. Make it specific and meaningful. Keep it to 3-4 words maximum. Examples:
- "Office Laptop Procurement"
- "Software Vendor Comparison"
- "Equipment Budget Planning"
- "Monitor Purchase Request"`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that generates concise, descriptive titles for conversations. Return only the title text, no quotes, no markdown.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 20,
    });

    const title = response.choices[0].message.content?.trim() || 'New Conversation';
    
    // Remove quotes if present
    return title.replace(/^["']|["']$/g, '');
  } catch (error) {
    console.error('Error generating conversation title:', error);
    // Fallback to first user message truncated
    const firstMessage = userMessages[0]?.content || '';
    return firstMessage.substring(0, 40) + (firstMessage.length > 40 ? '...' : '');
  }
}

/**
 * Compare proposals and generate AI recommendation with detailed scoring
 */
export async function compareProposals(rfpData: any, proposals: any[]): Promise<any> {
  // Import evaluation service
  const { evaluateProposals } = await import('./proposalEvaluationService.js');
  
  // First, perform detailed evaluation of each proposal
  const evaluations = evaluateProposals(proposals, {
    budget: rfpData.budget,
    requirements: rfpData.requirements || {},
  });

  // Prepare detailed proposals text with evaluations for AI
  const proposalsText = evaluations.map((evaluation, idx) => {
    const proposal = proposals.find(p => p.vendor.id === evaluation.vendorId)!;
    const data = proposal.parsedData || {};
    return `
Proposal ${idx + 1} - ${evaluation.vendorName}:
- Overall Score: ${evaluation.overallScore}/100
- Total Price: ${proposal.totalPrice || data.totalPrice || 'Not specified'}
- Price Evaluation: ${evaluation.criteria.price.reasoning} (Score: ${evaluation.criteria.price.score}/100)
- Delivery: ${proposal.deliveryDays || data.deliveryDays || 'Not specified'} days
- Delivery Evaluation: ${evaluation.criteria.delivery.reasoning} (Score: ${evaluation.criteria.delivery.score}/100)
- Requirements Match: ${evaluation.criteria.requirements.itemsMatched}/${evaluation.criteria.requirements.itemsTotal} items (Score: ${evaluation.criteria.requirements.score}/100)
- Payment Terms: ${proposal.paymentTerms || data.paymentTerms || 'Not specified'} (Score: ${evaluation.criteria.paymentTerms.score}/100)
- Warranty: ${proposal.warranty || data.warranty || 'Not specified'} (Score: ${evaluation.criteria.warranty.score}/100)
- Completeness: ${evaluation.criteria.completeness.score}/100
- Strengths: ${evaluation.strengths.length > 0 ? evaluation.strengths.join(', ') : 'None'}
- Weaknesses: ${evaluation.weaknesses.length > 0 ? evaluation.weaknesses.join(', ') : 'None'}
- Concerns: ${evaluation.concerns.length > 0 ? evaluation.concerns.join(', ') : 'None'}
- Notes: ${proposal.notes || data.notes || 'None'}
`;
  }).join('\n');

  // Create detailed breakdown of requirement matching
  const requirementsBreakdown = evaluations.map(evaluation => {
    const itemDetails = evaluation.criteria.requirements.itemBreakdown.map(item => {
      return `  - ${item.itemName}: ${item.matchesQuantity && item.specificationsMatch ? '✓ Matches' : '✗ Issues'} (${item.reasoning})`;
    }).join('\n');
    
    return `${evaluation.vendorName}:\n${itemDetails}`;
  }).join('\n\n');

  const prompt = `You are an AI assistant helping a procurement manager compare vendor proposals for an RFP.

RFP Details:
- Title: ${rfpData.title}
- Description: ${rfpData.description}
- Budget: ${rfpData.budget ? `$${rfpData.budget}` : 'Not specified'}
- Deadline: ${rfpData.deadline ? new Date(rfpData.deadline).toLocaleDateString() : 'Not specified'}
- Requirements: ${JSON.stringify(rfpData.requirements, null, 2)}

Detailed Proposal Evaluations:
${proposalsText}

Requirement Matching Breakdown:
${requirementsBreakdown}

The proposals have been scored based on:
1. Price compliance with budget (25% weight)
2. Delivery timeline (20% weight)
3. Requirement item matching (30% weight)
4. Payment terms alignment (5% weight)
5. Warranty compliance (10% weight)
6. Proposal completeness (5% weight)
7. Other requirements (5% weight)

Based on these detailed evaluations, provide:
1. A comprehensive summary comparing all proposals
2. A recommendation on which vendor to choose (use exact vendor name from above) or "needs_more_info" if critical information is missing
3. Detailed reasoning for the recommendation, referencing specific scores and criteria
4. A ranked list of all vendors with brief justification
5. Any additional concerns or red flags not already captured in the evaluations
6. Suggestions for negotiation points or clarifications needed

Return your analysis as JSON with:
- summary: A comprehensive summary of the comparison
- recommendation: The recommended vendor name (exact name from proposals) or "needs_more_info"
- reasoning: Detailed reasoning for the recommendation, referencing specific evaluation scores
- ranking: Array of objects with {vendorName, rank, justification}
- concerns: Array of any additional concerns or red flags
- negotiationPoints: Array of suggested negotiation points or clarification questions for vendors
- scores: Object with overall scores for each vendor (already calculated, just confirm)

Return ONLY valid JSON, no markdown, no code blocks.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a procurement analysis assistant. Always return valid JSON only. Use exact vendor names as provided.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('No content in OpenAI response');
    }
    const parsed = JSON.parse(content);
    
    // Combine AI analysis with detailed evaluations
    return {
      ...parsed,
      evaluations, // Include detailed evaluation results
      scores: evaluations.reduce((acc, evaluation) => {
        acc[evaluation.vendorName] = evaluation.overallScore;
        return acc;
      }, {} as Record<string, number>),
    };
  } catch (error) {
    console.error('Error comparing proposals:', error);
    throw new Error(`Failed to compare proposals: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
