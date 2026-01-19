/**
 * API configuration and base URL
 * Uses environment variable or defaults to localhost for development
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Helper function to build API endpoint URLs
 */
export function apiUrl(path: string): string {
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  // Remove trailing slash from base URL if present
  const base = API_BASE_URL.replace(/\/$/, '');
  return `${base}${normalizedPath}`;
}
