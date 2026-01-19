import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rfpRoutes from './routes/rfp.js';
import vendorRoutes from './routes/vendor.js';
import proposalRoutes from './routes/proposal.js';
import aiRoutes from './routes/ai.js';
import conversationRoutes from './routes/conversation.js';
import mailRoutes from './routes/mail.js';
import { startEmailPoller } from './services/emailPoller.js';
import { apiLimiter, aiLimiter, emailLimiter } from './src/middleware/rateLimiter.js';

dotenv.config();

const app = express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow API calls
}));

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting - apply to all API routes
app.use('/api', apiLimiter);

// Stricter rate limiting for AI endpoints
app.use('/api/ai', aiLimiter);

// Stricter rate limiting for email operations
app.use('/api/ai/send-rfp', emailLimiter);

app.use(express.json({ limit: '10mb' })); // Limit JSON payload size

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/rfps', rfpRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/proposals', proposalRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api', mailRoutes);

// Error handling middleware
app.use((err: Error & { status?: number }, req: Request, res: Response, next: NextFunction) => {
  // Log error details server-side only
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString(),
  });

  // Determine appropriate status code
  const statusCode = err.status || 500;
  
  // Prepare response - never expose stack traces in production
  const response: any = {
    error: statusCode === 500 
      ? 'An internal server error occurred' 
      : (err.message || 'An error occurred'),
  };

  // Only include additional details in development
  if (process.env.NODE_ENV === 'development') {
    response.details = err.message;
    if (err.stack) {
      response.stack = err.stack;
    }
  }

  res.status(statusCode).json(response);
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  // Check SMTP configuration
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    console.warn('⚠️  SMTP configuration is incomplete. Email sending will not work.');
    console.warn('   Required: SMTP_HOST, SMTP_USER, SMTP_PASSWORD');
    console.warn('   See README.md for setup instructions.');
  } else {
    console.log('✓ SMTP configuration found');
  }
  
  // Start email poller
  if (process.env.IMAP_USER && process.env.IMAP_PASSWORD) {
    startEmailPoller();
    console.log('✓ Email poller started');
  } else {
    console.warn('⚠️  Email poller not started - IMAP credentials not configured');
  }
});

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  try {
    // Close database connections
    const { closeDatabaseConnection } = await import('./src/db/index.js');
    await closeDatabaseConnection();
    
    console.log('✓ Graceful shutdown completed');
    process.exit(0);
  } catch (err) {
    console.error('Error during graceful shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - just log the error
});

// Handle uncaught exceptions (but let the process exit if it's a critical error)
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // For database connection errors, don't crash - let the pool handle reconnection
  if (error.message?.includes('Connection terminated') || 
      error.message?.includes('ECONNRESET') ||
      error.message?.includes('connection')) {
    console.log('Database connection error handled - pool will reconnect');
    return;
  }
  // For other critical errors, exit
  gracefulShutdown('uncaughtException').then(() => process.exit(1));
});
