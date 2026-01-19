import Imap from 'imap';
import { simpleParser } from 'mailparser';
import cron from 'node-cron';
import { randomUUID } from 'crypto';
import { parseVendorResponse } from './aiService.js';
import { evaluateProposal } from './proposalEvaluationService.js';
import { db } from '../src/db/index.js';
import { vendorsTable, rfpsTable, proposalsTable, sentEmailsTable, conversationsTable } from '../src/db/schema.js';
import { eq, or, like, desc, and } from 'drizzle-orm';
import { addMessage } from './conversationService.js';

let imap: Imap | null = null;
let isPolling = false;

function getImapConnection(): Imap {
  if (!imap) {
    const user = process.env.IMAP_USER;
    const password = process.env.IMAP_PASSWORD;
    
    if (!user || !password) {
      throw new Error('IMAP_USER and IMAP_PASSWORD environment variables are required');
    }
    
    imap = new Imap({
      user,
      password,
      host: process.env.IMAP_HOST || 'imap.gmail.com',
      port: parseInt(process.env.IMAP_PORT || '993'),
      tls: true,
      tlsOptions: { 
        // Allow self-signed certificates if IMAP_ALLOW_INSECURE is set to 'true'
        // This is needed for some email providers or when behind proxies
        rejectUnauthorized: process.env.IMAP_ALLOW_INSECURE !== 'true',
      },
    });
  }
  return imap;
}

/**
 * Process a single email message
 */
async function processEmailMessage(msg: any): Promise<void> {
  return new Promise((resolve, reject) => {
    msg.on('body', (stream: any, info: any) => {
      simpleParser(stream, async (err: Error | null, parsed: any) => {
        if (err) {
          console.error('Error parsing email:', err);
          return reject(err);
        }

        try {
          // Check if this is a reply to an RFP email
          const subject = parsed.subject || '';
          const fromEmail = parsed.from?.value?.[0]?.address;
          const emailBody = parsed.text || parsed.html || '';

          console.log(`[Email Poller] Processing email: Subject="${subject}", From="${fromEmail}"`);

          // Look for RFP in subject or check if sender is a known vendor
          const hasKeyword = subject.toLowerCase().includes('rfp') || subject.toLowerCase().includes('proposal') || subject.toLowerCase().includes('quote');
          
          if (!hasKeyword) {
            console.log(`[Email Poller] Skipping email: Subject doesn't contain 'rfp', 'proposal', or 'quote'`);
            resolve();
            return;
          }

          // Find vendor by email
          const vendor = await db.query.vendorsTable.findFirst({
            where: eq(vendorsTable.email, fromEmail),
          });

          if (!vendor) {
            console.log(`[Email Poller] Skipping email: Sender ${fromEmail} is not a known vendor`);
            resolve();
            return;
          }

          // Try to find matching RFP by subject or recent RFPs
          const subjectPrefix = subject.split(':')[0]?.trim() || '';
          const rfps = await db.query.rfpsTable.findMany({
            where: or(
              like(rfpsTable.title, `%${subjectPrefix}%`),
              eq(rfpsTable.status, 'sent')
            ),
            orderBy: [desc(rfpsTable.createdAt)],
            limit: 1,
          });

          const rfp = rfps[0];

          if (!rfp) {
            console.log(`[Email Poller] Skipping email: No matching RFP found for subject "${subject}"`);
            resolve();
            return;
          }

          // Parse the email with AI
          const parsedData = await parseVendorResponse(emailBody, parsed.attachments || []);

          // Check if proposal already exists
          const existingProposal = await db.query.proposalsTable.findFirst({
            where: and(
              eq(proposalsTable.rfpId, rfp.id),
              eq(proposalsTable.vendorId, vendor.id)
            ),
            with: {
              vendor: true,
            },
          });

          // Find the conversation that sent this RFP (via sentEmailsTable)
          // Use findMany and take first to support ordering
          const sentEmails = await db.query.sentEmailsTable.findMany({
            where: and(
              eq(sentEmailsTable.rfpId, rfp.id),
              eq(sentEmailsTable.vendorId, vendor.id)
            ),
            orderBy: [desc(sentEmailsTable.sentAt)],
            limit: 1,
          });
          const sentEmail = sentEmails[0];
          
          // If no conversationId in sentEmail, try to find conversation by RFP ID in agentState
          let conversationId = sentEmail?.conversationId;
          if (!conversationId) {
            const allConversations = await db.query.conversationsTable.findMany({
              limit: 100, // Search through recent conversations
            });
            
            // Find conversation with this RFP in agentState
            for (const conv of allConversations) {
              const agentState = conv.agentState as any;
              if (agentState?.rfpId === rfp.id) {
                conversationId = conv.id;
                console.log(`[Email Poller] Found conversation ${conversationId} for RFP ${rfp.id} via agentState`);
                break;
              }
            }
          }

          // Evaluate proposal against RFP requirements
          const proposalForEvaluation = {
            id: existingProposal?.id || '',
            vendor: { id: vendor.id, name: vendor.name },
            totalPrice: parsedData.totalPrice,
            deliveryDays: parsedData.deliveryDays,
            paymentTerms: parsedData.paymentTerms,
            warranty: parsedData.warranty,
            notes: parsedData.notes,
            completeness: parsedData.completeness,
            rawEmail: emailBody,
            parsedData: parsedData,
          };

          const evaluation = evaluateProposal(proposalForEvaluation, {
            budget: rfp.budget,
            requirements: rfp.requirements as any,
          });

          // Store evaluation in parsedData
          const parsedDataWithEvaluation = {
            ...parsedData,
            evaluation: {
              overallScore: evaluation.overallScore,
              criteria: evaluation.criteria,
              strengths: evaluation.strengths,
              weaknesses: evaluation.weaknesses,
              concerns: evaluation.concerns,
            },
          };

          const now = new Date();
          const proposalData = {
            rfpId: rfp.id,
            vendorId: vendor.id,
            emailMessageId: parsed.messageId,
            rawEmail: emailBody,
            parsedData: parsedDataWithEvaluation as any,
            totalPrice: parsedData.totalPrice,
            deliveryDays: parsedData.deliveryDays,
            paymentTerms: parsedData.paymentTerms,
            warranty: parsedData.warranty,
            notes: parsedData.notes,
            completeness: parsedData.completeness,
            updatedAt: now,
          };

          let proposalId: string;
          const isNewProposal = !existingProposal;

          if (existingProposal) {
            // Update existing proposal
            proposalId = existingProposal.id;
            await db.update(proposalsTable)
              .set(proposalData)
              .where(eq(proposalsTable.id, existingProposal.id));
          } else {
            // Create new proposal
            proposalId = randomUUID();
            await db.insert(proposalsTable).values({
              ...proposalData,
              id: proposalId,
              createdAt: now,
            });
          }

          console.log(`[Email Poller] Processed proposal from ${vendor.name} for RFP ${rfp.title} (Score: ${evaluation.overallScore}/100)`);

          // Invalidate comparison cache when proposal is created/updated
          if (isNewProposal || existingProposal) {
            await db.update(rfpsTable)
              .set({ comparisonCache: null, comparisonCacheUpdatedAt: null })
              .where(eq(rfpsTable.id, rfp.id));
            console.log(`[Email Poller] Invalidated comparison cache for RFP ${rfp.id}`);
          }

          // Update conversation if found (either from sentEmail or agentState)
          if (conversationId && isNewProposal) {
            try {
              const evaluationSummary = `Overall Score: ${evaluation.overallScore}/100\n` +
                `Price: ${evaluation.criteria.price.score}/100 - ${evaluation.criteria.price.reasoning}\n` +
                `Delivery: ${evaluation.criteria.delivery.score}/100 - ${evaluation.criteria.delivery.reasoning}\n` +
                `Requirements Match: ${evaluation.criteria.requirements.itemsMatched}/${evaluation.criteria.requirements.itemsTotal} items (${evaluation.criteria.requirements.score}/100)\n` +
                (evaluation.strengths.length > 0 ? `Strengths: ${evaluation.strengths.join(', ')}\n` : '') +
                (evaluation.weaknesses.length > 0 ? `Weaknesses: ${evaluation.weaknesses.join(', ')}\n` : '') +
                (evaluation.concerns.length > 0 ? `Concerns: ${evaluation.concerns.join(', ')}\n` : '');

              const message = `📧 **Proposal Received from ${vendor.name}**\n\n` +
                `I've received and evaluated a proposal from ${vendor.name} for the RFP "${rfp.title}".\n\n` +
                `**Evaluation Summary:**\n${evaluationSummary}\n` +
                `You can view the full proposal details and comparison in the RFP view.`;

              await addMessage(conversationId, 'assistant', message);
              console.log(`[Email Poller] Added proposal notification to conversation ${conversationId}`);
            } catch (error) {
              console.error(`[Email Poller] Error updating conversation:`, error);
              // Don't fail the proposal processing if conversation update fails
            }
          }
        } catch (error) {
          console.error('Error processing email:', error);
        }

        resolve();
      });
    });
  });
}

/**
 * Poll inbox for new emails
 */
export async function pollInbox(): Promise<void> {
  if (isPolling) {
    return;
  }

  if (!process.env.IMAP_USER || !process.env.IMAP_PASSWORD) {
    return;
  }

  isPolling = true;
  const imap = getImapConnection();

  return new Promise((resolve, reject) => {
    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err: Error | null, box: any) => {
        if (err) {
          console.error('Error opening inbox:', err);
          isPolling = false;
          return reject(err);
        }

        // Search for unread emails from last 24 hours
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        imap.search(['UNSEEN', ['SINCE', yesterday]], (err: Error | null, results: number[] | null) => {
          if (err) {
            console.error('Error searching emails:', err);
            isPolling = false;
            return reject(err);
          }

          if (!results || results.length === 0) {
            console.log('[Email Poller] No unread emails found in the last 24 hours');
            imap.end();
            isPolling = false;
            return resolve();
          }

          console.log(`[Email Poller] Found ${results.length} unread email(s), processing...`);

          // Process each email
          const f = imap.fetch(results, { bodies: '' });
          const promises: Promise<void>[] = [];

          f.on('message', (msg: any) => {
            promises.push(processEmailMessage(msg));
          });

          f.once('error', (err: Error) => {
            console.error('Error fetching emails:', err);
            isPolling = false;
            reject(err);
          });

          f.once('end', async () => {
            await Promise.all(promises);
            imap.end();
            isPolling = false;
            resolve();
          });
        });
      });
    });

    imap.once('error', (err: Error) => {
      console.error('IMAP error:', err);
      isPolling = false;
      reject(err);
    });

    imap.connect();
  });
}

/**
 * Start the email poller (runs every 15 seconds)
 */
export function startEmailPoller(): void {
  // Poll immediately on start
  pollInbox().catch(err => {
    console.error('Initial email poll failed:', err);
  });

  // Then poll every 15 seconds (using 6-field cron format: second minute hour day month weekday)
  cron.schedule('*/15 * * * * *', () => {
    pollInbox().catch(err => {
      console.error('Scheduled email poll failed:', err);
    });
  });

  console.log('Email poller scheduled to run every 15 seconds');
}
