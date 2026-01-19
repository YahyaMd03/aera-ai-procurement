/**
 * Debug script for email poller
 * 
 * This script helps debug why emails aren't showing up in the inbox.
 * Run with: npx tsx backend/scripts/debugEmailPoller.ts
 */

import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { db } from '../src/db/index.js';
import { vendorsTable, rfpsTable, proposalsTable } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env' });

interface EmailCheckResult {
  found: boolean;
  isUnseen: boolean;
  subject: string;
  fromEmail: string;
  date: Date;
  hasKeyword: boolean;
  isKnownVendor: boolean;
  vendorName?: string;
  matchedRfp?: string;
  proposalExists: boolean;
}

async function checkEmail(imap: Imap, seqno: number): Promise<EmailCheckResult> {
  return new Promise((resolve, reject) => {
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

      msg.once('end', async () => {
        const subject = headers.subject || '';
        const fromHeader = headers.from || '';
        const fromEmail = extractEmail(fromHeader);
        const date = headers.date ? new Date(headers.date) : new Date();
        const isUnseen = !flags.includes('\\Seen');

        // Check if subject has keywords
        const hasKeyword = 
          subject.toLowerCase().includes('rfp') || 
          subject.toLowerCase().includes('proposal') || 
          subject.toLowerCase().includes('quote');

        // Check if vendor exists
        let vendor = null;
        let vendorName: string | undefined;
        if (fromEmail) {
          vendor = await db.query.vendorsTable.findFirst({
            where: eq(vendorsTable.email, fromEmail),
          });
          vendorName = vendor?.name;
        }

        // Check if RFP exists (sent status)
        const rfps = await db.query.rfpsTable.findMany({
          where: eq(rfpsTable.status, 'sent'),
          orderBy: (rfpsTable, { desc }) => [desc(rfpsTable.createdAt)],
          limit: 1,
        });
        const matchedRfp = rfps[0]?.title;

        // Check if proposal already exists
        let proposalExists = false;
        if (vendor && rfps[0]) {
          const proposal = await db.query.proposalsTable.findFirst({
            where: eq(proposalsTable.vendorId, vendor.id),
          });
          proposalExists = !!proposal;
        }

        resolve({
          found: true,
          isUnseen,
          subject,
          fromEmail: fromEmail || 'Unknown',
          date,
          hasKeyword,
          isKnownVendor: !!vendor,
          vendorName,
          matchedRfp,
          proposalExists,
        });
      });
    });

    f.once('error', (err: Error) => {
      reject(err);
    });
  });
}

function extractEmail(fromHeader: string): string {
  const emailMatch = fromHeader.match(/<(.+?)>/);
  if (emailMatch) {
    return emailMatch[1];
  }
  // If no angle brackets, try to extract email-like string
  const emailPattern = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/;
  const match = fromHeader.match(emailPattern);
  return match ? match[1] : '';
}

async function debugEmailPoller() {
  console.log('🔍 Email Poller Debug Tool\n');
  console.log('Checking configuration...\n');

  // Check environment variables
  const imapUser = process.env.IMAP_USER;
  const imapPassword = process.env.IMAP_PASSWORD;
  const imapHost = process.env.IMAP_HOST || 'imap.gmail.com';
  const imapPort = parseInt(process.env.IMAP_PORT || '993');

  if (!imapUser || !imapPassword) {
    console.error('❌ Missing IMAP credentials!');
    console.error('   Set IMAP_USER and IMAP_PASSWORD in .env file');
    process.exit(1);
  }

  console.log(`✅ IMAP Configuration:`);
  console.log(`   Host: ${imapHost}`);
  console.log(`   Port: ${imapPort}`);
  console.log(`   User: ${imapUser}\n`);

  // Check database for vendors and RFPs
  console.log('📊 Checking database...\n');
  const vendors = await db.query.vendorsTable.findMany();
  const rfps = await db.query.rfpsTable.findMany({
    where: eq(rfpsTable.status, 'sent'),
  });
  const proposals = await db.query.proposalsTable.findMany();

  console.log(`   Vendors: ${vendors.length}`);
  if (vendors.length > 0) {
    console.log(`   Vendor emails:`);
    vendors.forEach((v: any) => {
      console.log(`     - ${v.email} (${v.name})`);
    });
  }
  console.log(`   Sent RFPs: ${rfps.length}`);
  if (rfps.length > 0) {
    console.log(`   RFP titles:`);
    rfps.forEach((r: any) => {
      console.log(`     - ${r.title}`);
    });
  }
  console.log(`   Existing proposals: ${proposals.length}\n`);

  // Connect to IMAP
  console.log('📧 Connecting to IMAP server...\n');
  
  const imap = new Imap({
    user: imapUser,
    password: imapPassword,
    host: imapHost,
    port: imapPort,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
  });

  return new Promise<void>((resolve, reject) => {
    imap.once('ready', () => {
      console.log('✅ Connected to IMAP server\n');

      imap.openBox('INBOX', false, (err: Error | null, box: any) => {
        if (err) {
          console.error('❌ Error opening INBOX:', err);
          imap.end();
          return reject(err);
        }

        console.log(`📬 INBOX opened (${box.messages.total} total messages)\n`);

        // Check recent emails (last 24 hours)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        // Search for ALL emails from last 24 hours (not just unseen)
        imap.search([['SINCE', yesterday]], (err: Error | null, results: number[] | null) => {
          if (err) {
            console.error('❌ Error searching emails:', err);
            imap.end();
            return reject(err);
          }

          if (!results || results.length === 0) {
            console.log('ℹ️  No emails found in the last 24 hours\n');
            imap.end();
            return resolve();
          }

          console.log(`📨 Found ${results.length} email(s) in the last 24 hours\n`);
          console.log('=' .repeat(80));

          // Check each email (limit to last 10 to avoid too much output)
          const emailsToCheck = results.slice(-10).reverse(); // Most recent first
          let checkedCount = 0;

          Promise.all(
            emailsToCheck.map(async (seqno) => {
              try {
                const result = await checkEmail(imap, seqno);
                checkedCount++;

                console.log(`\n📧 Email #${seqno} (${checkedCount}/${emailsToCheck.length})`);
                console.log(`   Subject: ${result.subject || '(no subject)'}`);
                console.log(`   From: ${result.fromEmail}`);
                console.log(`   Date: ${result.date.toLocaleString()}`);
                console.log(`   Status: ${result.isUnseen ? '✅ UNSEEN' : '👁️  READ'}`);
                console.log(`   Has keyword (rfp/proposal/quote): ${result.hasKeyword ? '✅ YES' : '❌ NO'}`);
                console.log(`   Known vendor: ${result.isKnownVendor ? `✅ YES (${result.vendorName})` : '❌ NO'}`);
                if (result.matchedRfp) {
                  console.log(`   Matched RFP: ✅ ${result.matchedRfp}`);
                } else {
                  console.log(`   Matched RFP: ❌ None found`);
                }
                console.log(`   Proposal exists: ${result.proposalExists ? '✅ YES' : '❌ NO'}`);

                // Diagnostic message
                if (!result.isUnseen) {
                  console.log(`   ⚠️  WARNING: Email is marked as READ. Poller only checks UNSEEN emails.`);
                }
                if (!result.hasKeyword) {
                  console.log(`   ⚠️  WARNING: Subject doesn't contain 'rfp', 'proposal', or 'quote'.`);
                }
                if (!result.isKnownVendor) {
                  console.log(`   ⚠️  WARNING: Sender email (${result.fromEmail}) is not in vendor database.`);
                }
                if (!result.matchedRfp) {
                  console.log(`   ⚠️  WARNING: No sent RFP found to match this email to.`);
                }
                if (result.isUnseen && result.hasKeyword && result.isKnownVendor && result.matchedRfp && !result.proposalExists) {
                  console.log(`   ✅ This email SHOULD be processed by the poller!`);
                }

                return result;
              } catch (error) {
                console.error(`   ❌ Error checking email #${seqno}:`, error);
                return null;
              }
            })
          ).then(() => {
            console.log('\n' + '='.repeat(80));
            console.log('\n📋 Summary:\n');
            console.log('The email poller will ONLY process emails that meet ALL of these criteria:');
            console.log('  1. ✅ Email is UNSEEN (unread)');
            console.log('  2. ✅ Subject contains "rfp", "proposal", or "quote"');
            console.log('  3. ✅ Sender email matches a vendor in the database');
            console.log('  4. ✅ An RFP with status "sent" exists');
            console.log('\n💡 Tips:');
            console.log('  - If email is READ, mark it as unread in your email client');
            console.log('  - If vendor not found, add the vendor email to the database');
            console.log('  - If no RFP found, make sure an RFP has been sent');
            console.log('  - The poller runs every 5 minutes automatically');
            console.log('  - You can manually trigger it by restarting the backend server\n');

            imap.end();
            resolve();
          }).catch((error) => {
            console.error('Error:', error);
            imap.end();
            reject(error);
          });
        });
      });
    });

    imap.once('error', (err: Error) => {
      console.error('❌ IMAP connection error:', err);
      reject(err);
    });

    imap.connect();
  });
}

// Run the debug script
debugEmailPoller()
  .then(() => {
    console.log('✅ Debug complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Debug failed:', error);
    process.exit(1);
  });
