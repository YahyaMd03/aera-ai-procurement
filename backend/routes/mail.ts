import express, { Request, Response, NextFunction } from 'express';
import { createImapConnection } from '../services/imapService.js';
import { db } from '../src/db/index.js';
import { sentEmailsTable } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { pollInbox } from '../services/emailPoller.js';
import { verifyEmailConfig } from '../services/emailService.js';

const router = express.Router();

/**
 * Get all sent emails (global)
 * GET /api/sent-emails
 */
router.get('/sent-emails', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get all sent emails with related RFP and vendor data
    const sentEmails = await db.query.sentEmailsTable.findMany({
      with: {
        rfp: true,
        vendor: true,
        conversation: true,
      },
      orderBy: (sentEmailsTable, { desc }) => [desc(sentEmailsTable.sentAt)],
    });

    res.json(sentEmails);
  } catch (error) {
    next(error);
  }
});

/**
 * Get single sent email by ID
 * GET /api/sent-emails/:id
 */
router.get('/sent-emails/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const emailId = req.params.id;

    const sentEmail = await db.query.sentEmailsTable.findFirst({
      where: eq(sentEmailsTable.id, emailId),
      with: {
        rfp: true,
        vendor: true,
        conversation: true,
      },
    });

    if (!sentEmail) {
      return res.status(404).json({ error: 'Sent email not found' });
    }

    res.json(sentEmail);
  } catch (error) {
    next(error);
  }
});

/**
 * List all emails from IMAP inbox
 * GET /api/mail/inbox?days=7&limit=50
 */
router.get('/inbox', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const limit = parseInt(req.query.limit as string) || 50;

    const imap = createImapConnection();

    return new Promise<void>((resolve) => {
      const emails: any[] = [];

      imap.once('ready', () => {
        imap.openBox('INBOX', false, (err: Error | null, box: any) => {
          if (err) {
            imap.end();
            return next(err);
          }

          // Calculate date range
          const sinceDate = new Date();
          sinceDate.setDate(sinceDate.getDate() - days);

          // Search for all emails (both seen and unseen) from the specified date range
          imap.search([['SINCE', sinceDate]], (err: Error | null, results: number[] | null) => {
            if (err) {
              imap.end();
              return next(err);
            }

            if (!results || results.length === 0) {
              imap.end();
              return res.json({ emails: [], total: 0 });
            }

            // Limit results and sort (most recent first)
            const emailsToFetch = results.slice(-limit).reverse();
            let processedCount = 0;

            const fetchEmail = (seqno: number) => {
              return new Promise<void>((resolveEmail) => {
                const f = imap.fetch([seqno], {
                  bodies: 'HEADER',
                  struct: true,
                });

                f.on('message', (msg: any) => {
                  let flags: string[] = [];
                  let headers: any = {};

                  msg.on('attributes', (attrs: any) => {
                    flags = attrs.flags || [];
                  });

                  msg.on('body', (stream: any) => {
                    let buffer = '';
                    stream.on('data', (chunk: any) => {
                      buffer += chunk.toString('utf8');
                    });
                    stream.on('end', () => {
                      const headerLines = buffer.split('\r\n');
                      headerLines.forEach((line: string) => {
                        const colonIndex = line.indexOf(':');
                        if (colonIndex > 0) {
                          const key = line.substring(0, colonIndex).trim().toLowerCase();
                          const value = line.substring(colonIndex + 1).trim();
                          if (headers[key]) {
                            headers[key] += ' ' + value;
                          } else {
                            headers[key] = value;
                          }
                        }
                      });
                    });
                  });

                  msg.once('end', () => {
                    const isUnseen = !flags.includes('\\Seen');
                    const subject = headers.subject || '(no subject)';
                    const fromHeader = headers.from || '';
                    const toHeader = headers.to || '';
                    const dateHeader = headers.date || '';
                    const messageId = headers['message-id'] || '';

                    // Extract email addresses
                    const extractEmail = (header: string): string => {
                      const emailMatch = header.match(/<(.+?)>/);
                      if (emailMatch) {
                        return emailMatch[1];
                      }
                      const emailPattern = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/;
                      const match = header.match(emailPattern);
                      return match ? match[1] : header.substring(0, 50);
                    };

                    const fromEmail = extractEmail(fromHeader);
                    const toEmail = extractEmail(toHeader);
                    const date = dateHeader ? new Date(dateHeader) : new Date();

                    emails.push({
                      seqno,
                      subject: subject.replace(/^Re:\s*/i, '').replace(/^Fwd?:\s*/i, '').trim(),
                      from: fromHeader,
                      fromEmail,
                      to: toHeader,
                      toEmail,
                      date: date.toISOString(),
                      messageId,
                      isUnseen,
                      flags: flags,
                      hasKeyword: 
                        subject.toLowerCase().includes('rfp') || 
                        subject.toLowerCase().includes('proposal') || 
                        subject.toLowerCase().includes('quote'),
                    });

                    processedCount++;
                    resolveEmail();
                  });
                });

                f.once('error', (err: Error) => {
                  console.error(`Error fetching email #${seqno}:`, err);
                  processedCount++;
                  resolveEmail();
                });
              });
            };

            // Fetch all emails in parallel (but limit concurrency)
            Promise.all(emailsToFetch.map(seqno => fetchEmail(seqno))).then(() => {
              imap.end();
              
              // Sort by date (most recent first)
              emails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
              
              res.json({
                emails,
                total: emails.length,
                range: {
                  days,
                  since: sinceDate.toISOString(),
                },
              });
              resolve();
            });
          });
        });
      });

      imap.once('error', (err: Error) => {
        imap.end();
        next(err);
      });

      imap.connect();
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Manually trigger email poller
 * POST /api/mail/poll
 */
router.post('/poll', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await pollInbox();
    res.json({ success: true, message: 'Email poll completed' });
  } catch (error) {
    next(error);
  }
});

/**
 * Test SMTP connection and configuration
 * GET /api/mail/test-smtp
 */
router.get('/test-smtp', async (req: Request, res: Response, next: NextFunction) => {
  try {
    
    // Check environment variables
    const config = {
      SMTP_HOST: process.env.SMTP_HOST || 'NOT SET',
      SMTP_PORT: process.env.SMTP_PORT || 'NOT SET',
      SMTP_USER: process.env.SMTP_USER ? `${process.env.SMTP_USER.substring(0, 3)}***` : 'NOT SET',
      SMTP_FROM: process.env.SMTP_FROM || 'NOT SET',
      SMTP_PASSWORD_SET: !!process.env.SMTP_PASSWORD,
      NODE_ENV: process.env.NODE_ENV || 'NOT SET',
    };
    
    
    // Verify connection
    const verification = await verifyEmailConfig();
    
    if (verification.success) {
      res.json({
        success: true,
        message: 'SMTP connection verified successfully',
        config: config,
      });
    } else {
      res.status(500).json({
        success: false,
        error: verification.error,
        config: config,
      });
    }
  } catch (error: any) {
    const errorDetails = {
      message: error instanceof Error ? error.message : 'Unknown error',
      code: error?.code,
      command: error?.command,
      response: error?.response,
      responseCode: error?.responseCode,
      errno: error?.errno,
      syscall: error?.syscall,
      address: error?.address,
      port: error?.port,
    };
    
    console.error('[SMTP Test] Error:', errorDetails);
    
    res.status(500).json({
      success: false,
      error: errorDetails.message,
      details: errorDetails,
      config: {
        SMTP_HOST: process.env.SMTP_HOST || 'NOT SET',
        SMTP_PORT: process.env.SMTP_PORT || 'NOT SET',
        NODE_ENV: process.env.NODE_ENV || 'NOT SET',
      },
    });
  }
});

export default router;
