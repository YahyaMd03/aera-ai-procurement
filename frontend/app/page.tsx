'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import Shell from '@/components/Shell';
import { getSessionId } from '@/lib/session';
import { apiUrl } from '@/lib/api';

async function getRFPs() {
  try {
    const response = await axios.get(apiUrl('/api/rfps'));
    return Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    console.error('Error fetching RFPs:', error);
    return [];
  }
}

async function getVendors() {
  try {
    const response = await axios.get(apiUrl('/api/vendors'));
    return Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    console.error('Error fetching vendors:', error);
    return [];
  }
}

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // On home page, redirect to active conversation or create one
    async function redirectToConversation() {
      const sessionId = getSessionId();
      if (sessionId && !sessionId.startsWith('temp_')) {
        try {
          // Try to get or create active conversation
          const response = await axios.post(apiUrl('/api/conversations'), {
            sessionId,
          });
          const conversation = response.data;
          // Redirect to the conversation URL
          router.push(`/chat/${conversation.id}`);
        } catch (error) {
          console.error('Error loading conversation:', error);
        }
      }
    }

    redirectToConversation();
  }, [router]);

  // Show loading while redirecting
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-gray-500">Loading...</div>
    </div>
  );
}
