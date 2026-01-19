'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import { getSessionId } from '@/lib/session';
import { apiUrl } from '@/lib/api';

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const conversationId = params.conversationId as string;
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string>('');

  useEffect(() => {
    setSessionId(getSessionId());
  }, []);

  useEffect(() => {
    async function verifyConversation() {
      if (conversationId && sessionId && !sessionId.startsWith('temp_')) {
        try {
          await axios.get(
            `${apiUrl('/api/conversations')}/${conversationId}?sessionId=${sessionId}`
          );
          // Conversation exists and belongs to session - all good
          setError(null);
        } catch (err: any) {
          if (err.response?.status === 403 || err.response?.status === 404) {
            setError('Conversation not found or access denied');
            setTimeout(() => {
              router.push('/');
            }, 2000);
          } else {
            setError('Error loading conversation');
          }
        }
      } else if (sessionId.startsWith('temp_')) {
        const timer = setTimeout(() => {
          setSessionId(getSessionId());
        }, 100);
        return () => clearTimeout(timer);
      }
    }

    verifyConversation();
  }, [conversationId, sessionId, router]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  return null; // Shell will render the chat interface based on URL
}
