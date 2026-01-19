/**
 * Session management for user differentiation
 * Uses localStorage to persist session ID across page refreshes
 * Client-side only (handles SSR)
 */

const SESSION_ID_KEY = 'aera_session_id';

export function getSessionId(): string {
  // Check if we're in the browser (client-side)
  if (typeof window === 'undefined') {
    // Return a temporary ID for SSR - will be replaced on client
    return `temp_${Date.now()}`;
  }
  
  let sessionId = localStorage.getItem(SESSION_ID_KEY);
  
  if (!sessionId) {
    // Generate a new session ID
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    localStorage.setItem(SESSION_ID_KEY, sessionId);
  }
  
  return sessionId;
}

export function clearSession(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(SESSION_ID_KEY);
  }
}
