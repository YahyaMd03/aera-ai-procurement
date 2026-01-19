import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

let transporter: Transporter | null = null;

interface Vendor {
  name: string;
  email: string;
  contactName?: string | null;
}

interface RFP {
  title: string;
  description: string;
  budget?: number | null;
  deadline?: Date | null;
  requirements: any;
}

function getTransporter(): Transporter {
  if (!transporter) {
    // Validate required environment variables
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPassword = process.env.SMTP_PASSWORD;

    if (!smtpHost || !smtpUser || !smtpPassword) {
      const missing = [];
      if (!smtpHost) missing.push('SMTP_HOST');
      if (!smtpUser) missing.push('SMTP_USER');
      if (!smtpPassword) missing.push('SMTP_PASSWORD');
      
      throw new Error(
        `SMTP configuration is incomplete. Missing environment variables: ${missing.join(', ')}. ` +
        `Please configure these in your .env file. See README.md for setup instructions.`
      );
    }

    transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: smtpUser,
        pass: smtpPassword,
      },
      connectionTimeout: 30000, // 30 second connection timeout
      greetingTimeout: 30000, // 30 second greeting timeout
      socketTimeout: 30000, // 30 second socket timeout
      // TLS options for better compatibility
      tls: {
        // Allow self-signed certificates if SMTP_ALLOW_INSECURE is set to 'true'
        // Also allow in development mode for easier local testing
        rejectUnauthorized: process.env.SMTP_ALLOW_INSECURE !== 'true' && process.env.NODE_ENV === 'production',
      },
    });
  }
  return transporter;
}

/**
 * Send RFP email to vendor with retry logic
 */
export async function sendRFPEmail(vendor: Vendor, rfp: RFP, retries: number = 2): Promise<{ success: boolean; messageId?: string; subject?: string; body?: string }> {
  const transporter = getTransporter();
  
  // Use description as title if title is a placeholder
  const displayTitle = (rfp.title === 'Auto-generated title' || rfp.title?.trim() === '') 
    ? (rfp.description || 'Request for Proposal')
    : rfp.title;
  
  const deadlineText = rfp.deadline
    ? `\n\nDeadline: ${new Date(rfp.deadline).toLocaleDateString()}`
    : '';
  
  const budgetText = rfp.budget
    ? `\nBudget: $${rfp.budget.toLocaleString()}`
    : '';
  
  const requirementsText = formatRequirements(rfp.requirements);

  // Avoid duplicating title and description if they're the same
  const titleSection = displayTitle && displayTitle.trim() !== '' ? `${displayTitle}\n\n` : '';
  const descriptionSection = (rfp.description && rfp.description.trim() !== displayTitle?.trim()) 
    ? `${rfp.description}\n` 
    : '';

  const emailBody = `
Dear ${vendor.contactName || vendor.name},

We are requesting a proposal for the following procurement:

${titleSection}${descriptionSection}${budgetText}${deadlineText}

Requirements:
${requirementsText}

Please provide your proposal including:
- Detailed pricing for all items
- Delivery timeline
- Payment terms
- Warranty information
- Any additional terms or conditions

Please reply to this email with your proposal.

Thank you,
Procurement Team
  `.trim();

  try {
    const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER;
    if (!fromEmail) {
      throw new Error('SMTP_FROM or SMTP_USER must be configured');
    }

    // Log SMTP configuration (without sensitive data)
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT || '587';
    console.log(`[Email Service] Attempting to send RFP email to ${vendor.email} (${vendor.name})`);
    console.log(`[Email Service] SMTP Config: ${smtpHost}:${smtpPort}, From: ${fromEmail}`);
    console.log(`[Email Service] Environment: ${process.env.NODE_ENV || 'unknown'}`);
    
    // Verify connection first (helps with debugging) - only on first attempt
    if (retries === 2) {
      try {
        console.log(`[Email Service] Verifying SMTP connection...`);
        await transporter.verify();
        console.log(`[Email Service] SMTP connection verified successfully`);
      } catch (verifyError: any) {
        const verifyMsg = verifyError instanceof Error ? verifyError.message : 'Unknown verification error';
        console.error(`[Email Service] SMTP verification failed:`, verifyMsg);
        console.error(`[Email Service] Verification error details:`, {
          code: verifyError?.code,
          command: verifyError?.command,
          response: verifyError?.response,
          responseCode: verifyError?.responseCode,
          errno: verifyError?.errno,
          syscall: verifyError?.syscall,
          address: verifyError?.address,
          port: verifyError?.port,
        });
        throw new Error(`SMTP connection verification failed: ${verifyMsg}`);
      }
    }
    
    const info = await transporter.sendMail({
      from: fromEmail,
      to: vendor.email,
      subject: `RFP: ${displayTitle}`,
      text: emailBody,
      html: emailBody.replace(/\n/g, '<br>'),
    });

    console.log(`[Email Service] Email sent successfully to ${vendor.email}. Message ID: ${info.messageId}`);
    
    const emailSubject = `RFP: ${displayTitle}`;
    
    return {
      success: true,
      messageId: info.messageId,
      subject: emailSubject,
      body: emailBody,
    };
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorCode = error?.code || 'NO_CODE';
    const errorCommand = error?.command || 'NO_COMMAND';
    const errorResponse = error?.response || 'NO_RESPONSE';
    
    console.error(`[Email Service] Error sending email to ${vendor.email} (${vendor.name}):`, errorMessage);
    console.error(`[Email Service] Error details:`, {
      code: errorCode,
      command: errorCommand,
      response: errorResponse,
      responseCode: error?.responseCode,
      errno: error?.errno,
      syscall: error?.syscall,
      address: error?.address,
      port: error?.port,
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || '587',
      environment: process.env.NODE_ENV,
    });
    console.error(`[Email Service] Full error object:`, error);
    
    // Retry logic for transient errors
    const isRetryableError = errorCode === 'ETIMEDOUT' || 
                             errorCode === 'ECONNRESET' || 
                             errorCode === 'ECONNREFUSED' ||
                             errorMessage.includes('timeout') ||
                             errorCode === 'EAI_AGAIN';
    
    if (isRetryableError && retries > 0) {
      const delay = (3 - retries) * 2000; // 2s, 4s delays
      console.log(`[Email Service] Retryable error detected. Retrying in ${delay}ms... (${retries} attempts remaining)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return sendRFPEmail(vendor, rfp, retries - 1);
    }
    
    // Provide more specific error messages
    let userFriendlyError = errorMessage;
    if (errorCode === 'ETIMEDOUT' || errorCode === 'ECONNRESET' || errorMessage.includes('timeout')) {
      userFriendlyError = `Connection timeout to ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || '587'}. This may be due to network restrictions or firewall blocking outbound SMTP connections.`;
    } else if (errorCode === 'ECONNREFUSED') {
      userFriendlyError = `Connection refused to ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || '587'}. Check if the SMTP server is accessible from this network.`;
    } else if (errorCode === 'ENOTFOUND' || errorCode === 'EAI_AGAIN') {
      userFriendlyError = `Cannot resolve SMTP host ${process.env.SMTP_HOST}. Check DNS configuration.`;
    }
    
    throw new Error(`Failed to send email to ${vendor.name} (${vendor.email}): ${userFriendlyError}`);
  }
}

function formatRequirements(requirements: any): string {
  if (!requirements) return 'None specified';
  
  let text = '';
  
  if (requirements.items && requirements.items.length > 0) {
    text += '\nItems:\n';
    requirements.items.forEach((item: any, idx: number) => {
      text += `${idx + 1}. ${item.name}`;
      if (item.quantity) text += ` (Qty: ${item.quantity})`;
      if (item.specifications) text += ` - ${item.specifications}`;
      text += '\n';
    });
  }
  
  if (requirements.deliveryDays) {
    text += `\nDelivery: ${requirements.deliveryDays} days\n`;
  }
  
  if (requirements.paymentTerms) {
    text += `Payment Terms: ${requirements.paymentTerms}\n`;
  }
  
  if (requirements.warranty) {
    text += `Warranty: ${requirements.warranty}\n`;
  }
  
  if (requirements.otherRequirements && requirements.otherRequirements.length > 0) {
    text += '\nOther Requirements:\n';
    requirements.otherRequirements.forEach((req: string, idx: number) => {
      text += `${idx + 1}. ${req}\n`;
    });
  }
  
  return text || 'None specified';
}

/**
 * Verify email configuration
 */
export async function verifyEmailConfig(): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if required env vars are set
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
      const missing = [];
      if (!process.env.SMTP_HOST) missing.push('SMTP_HOST');
      if (!process.env.SMTP_USER) missing.push('SMTP_USER');
      if (!process.env.SMTP_PASSWORD) missing.push('SMTP_PASSWORD');
      return { 
        success: false, 
        error: `Missing required environment variables: ${missing.join(', ')}` 
      };
    }

    const transporter = getTransporter();
    await transporter.verify();
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
