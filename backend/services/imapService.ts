import Imap from 'imap';

let imapConnection: Imap | null = null;
let connectionState: 'idle' | 'connecting' | 'ready' | 'error' = 'idle';

/**
 * Get or create IMAP connection with connection reuse and lifecycle management
 */
function getImapConnection(): Imap {
  // If we have a valid connection that's ready, reuse it
  if (imapConnection && connectionState === 'ready') {
    return imapConnection;
  }

  // Create new connection
  const user = process.env.IMAP_USER;
  const password = process.env.IMAP_PASSWORD;
  
  if (!user || !password) {
    throw new Error('IMAP_USER and IMAP_PASSWORD environment variables are required');
  }
  
  // Close existing connection if any
  if (imapConnection) {
    try {
      imapConnection.end();
    } catch (err) {
      // Ignore errors when closing
    }
  }

  connectionState = 'connecting';
  
  imapConnection = new Imap({
    user,
    password,
    host: process.env.IMAP_HOST || 'imap.gmail.com',
    port: parseInt(process.env.IMAP_PORT || '993'),
    tls: true,
    // Security: Only allow self-signed certs in development
    // In production, SSL certificates are validated to prevent MITM attacks
    tlsOptions: { rejectUnauthorized: process.env.NODE_ENV !== 'development' },
  });

  // Handle connection lifecycle
  imapConnection.once('ready', () => {
    connectionState = 'ready';
  });

  imapConnection.once('error', (err: Error) => {
    console.error('[IMAP Service] Connection error:', err.message);
    connectionState = 'error';
    // Connection will be recreated on next use
  });

  imapConnection.once('end', () => {
    connectionState = 'idle';
    imapConnection = null;
  });

  return imapConnection;
}

/**
 * Execute a function with an IMAP connection
 * Handles connection lifecycle automatically
 */
export async function withImapConnection<T>(
  operation: (imap: Imap) => Promise<T>,
  closeAfterUse: boolean = true
): Promise<T> {
  const imap = getImapConnection();
  
  // If connection is not ready, wait for it
  if (connectionState === 'connecting') {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('IMAP connection timeout'));
      }, 10000);

      imap.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });

      imap.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  try {
    // Connect if not already connected
    if (connectionState !== 'ready') {
      await new Promise<void>((resolve, reject) => {
        imap.once('ready', () => resolve());
        imap.once('error', reject);
        if (connectionState !== 'connecting') {
          imap.connect();
        }
      });
    }

    const result = await operation(imap);

    // Close connection if requested (for one-off operations)
    if (closeAfterUse && imapConnection === imap) {
      imap.end();
      connectionState = 'idle';
    }

    return result;
  } catch (error) {
    // On error, mark connection as invalid so it will be recreated
    if (imapConnection === imap) {
      connectionState = 'error';
    }
    throw error;
  }
}

/**
 * Create a new IMAP connection for one-time use
 * Use this when you need a dedicated connection that will be closed after use
 */
export function createImapConnection(): Imap {
  const user = process.env.IMAP_USER;
  const password = process.env.IMAP_PASSWORD;
  
  if (!user || !password) {
    throw new Error('IMAP_USER and IMAP_PASSWORD environment variables are required');
  }
  
  return new Imap({
    user,
    password,
    host: process.env.IMAP_HOST || 'imap.gmail.com',
    port: parseInt(process.env.IMAP_PORT || '993'),
    tls: true,
    // Security: Only allow self-signed certs in development
    // In production, SSL certificates are validated to prevent MITM attacks
    tlsOptions: { rejectUnauthorized: process.env.NODE_ENV !== 'development' },
  });
}
