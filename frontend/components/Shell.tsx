'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import axios from 'axios';
import Sidebar from '@/components/Sidebar';
import ChatInterface from '@/components/ChatInterface';
import RFPView from '@/components/RFPView';
import ComparisonView from '@/components/ComparisonView';
import VendorView from '@/components/VendorView';
import MailView from '@/components/MailView';
import { getSessionId } from '@/lib/session';
import { apiUrl } from '@/lib/api';

type View = 'chat' | 'rfp' | 'comparison' | 'vendor' | 'mail-inbox' | 'mail-sent';

interface ShellProps {
  initialRFPs: any[];
  initialVendors: any[];
  initialConversationId?: string | null;
}

export default function Shell({ initialRFPs, initialVendors, initialConversationId }: ShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [currentView, setCurrentView] = useState<View>('chat');
  const [selectedRFPId, setSelectedRFPId] = useState<string | null>(null);
  const [rfps, setRfps] = useState<any[]>(initialRFPs);
  const [vendors, setVendors] = useState<any[]>(initialVendors);
  const [conversations, setConversations] = useState<any[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(initialConversationId || null);
  const [sessionId, setSessionId] = useState<string>('');

  useEffect(() => {
    setSessionId(getSessionId());
  }, []);

  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);

  // Sync view and IDs with URL pathname
  useEffect(() => {
    if (!pathname) return;
    
    if (pathname.startsWith('/chat/')) {
      const conversationIdFromUrl = pathname.split('/chat/')[1];
      if (conversationIdFromUrl) {
        setCurrentConversationId(conversationIdFromUrl);
        setCurrentView('chat');
      }
    } else if (pathname === '/vendors') {
      setCurrentView('vendor');
    } else if (pathname.startsWith('/rfp/')) {
      const rfpIdFromUrl = pathname.split('/rfp/')[1]?.split('/')[0];
      if (pathname.includes('/comparison')) {
        setCurrentView('comparison');
      } else {
        setCurrentView('rfp');
      }
      if (rfpIdFromUrl) {
        setSelectedRFPId(rfpIdFromUrl);
      }
    } else if (pathname.startsWith('/mail/inbox')) {
      setCurrentView('mail-inbox');
      const emailIdFromUrl = pathname.split('/mail/inbox/')[1];
      setSelectedEmailId(emailIdFromUrl || null);
    } else if (pathname.startsWith('/mail/sent')) {
      setCurrentView('mail-sent');
      const emailIdFromUrl = pathname.split('/mail/sent/')[1];
      setSelectedEmailId(emailIdFromUrl || null);
    }
  }, [pathname]);

  const fetchVendors = async () => {
    try {
      const response = await axios.get(apiUrl('/api/vendors'));
      setVendors(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching vendors:', error);
    }
  };

  const fetchRFPs = async () => {
    try {
      const response = await axios.get(apiUrl('/api/rfps'));
      setRfps(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching RFPs:', error);
      setRfps([]);
    }
  };

  const fetchConversations = async () => {
    if (!sessionId || sessionId.startsWith('temp_')) return;
    
    try {
      const response = await axios.get(`${apiUrl('/api/conversations')}?sessionId=${sessionId}`);
      setConversations(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching conversations:', error);
      setConversations([]);
    }
  };

  useEffect(() => {
    if (sessionId && !sessionId.startsWith('temp_')) {
      fetchConversations();
    }
  }, [sessionId]);

  const handleRFPCreated = (rfp: any) => {
    setRfps([rfp, ...rfps]);
    router.push(`/rfp/${rfp.id}`);
  };

  const handleNewConversation = async () => {
    if (!sessionId || sessionId.startsWith('temp_')) return;
    
    try {
      const response = await axios.post(apiUrl('/api/conversations/new'), {
        sessionId,
      });
      const newConv = response.data;
      setConversations([newConv, ...conversations]);
      // Navigate to the new conversation URL
      router.push(`/chat/${newConv.id}`);
    } catch (error) {
      console.error('Error creating conversation:', error);
    }
  };

  const handleSelectConversation = (id: string) => {
    // Navigate to the conversation URL
    router.push(`/chat/${id}`);
  };


  // Refresh vendors periodically to keep count updated
  useEffect(() => {
    fetchVendors();
    // Refresh every 30 seconds to keep count updated
    const interval = setInterval(fetchVendors, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleViewChange = (view: string, rfpId?: string) => {
    if (view === 'vendor') {
      router.push('/vendors');
    } else if (view === 'rfp' && rfpId) {
      router.push(`/rfp/${rfpId}`);
    } else if (view === 'comparison' && rfpId) {
      router.push(`/rfp/${rfpId}/comparison`);
    } else if (view === 'mail-inbox') {
      router.push('/mail/inbox');
    } else if (view === 'mail-sent') {
      router.push('/mail/sent');
    } else if (view === 'chat' && currentConversationId) {
      router.push(`/chat/${currentConversationId}`);
    }
  };

  const handleRefresh = () => {
    fetchRFPs();
    fetchConversations();
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        currentView={currentView}
        onViewChange={handleViewChange}
        rfps={rfps}
        vendors={vendors}
        conversations={conversations}
        currentConversationId={currentConversationId}
        onNewConversation={handleNewConversation}
        onSelectConversation={handleSelectConversation}
        onRefresh={handleRefresh}
      />
      <main className="flex-1 flex flex-col overflow-hidden">
        {currentView === 'chat' && (
          <ChatInterface
            onRFPCreated={handleRFPCreated}
            vendors={vendors}
            rfps={rfps}
            onRefresh={handleRefresh}
            onViewChange={handleViewChange}
            conversationId={currentConversationId}
            onConversationUpdate={fetchConversations}
          />
        )}
        {currentView === 'vendor' && (
          <VendorView
            vendors={vendors}
            onRefresh={handleRefresh}
          />
        )}
        {currentView === 'mail-inbox' && (
          <MailView type="inbox" emailId={selectedEmailId} />
        )}
        {currentView === 'mail-sent' && (
          <MailView type="sent" emailId={selectedEmailId} />
        )}
        {currentView === 'rfp' && selectedRFPId && (
          <RFPView
            rfpId={selectedRFPId}
            vendors={vendors}
            onRefresh={handleRefresh}
            onViewChange={handleViewChange}
          />
        )}
        {currentView === 'comparison' && selectedRFPId && (
          <ComparisonView
            rfpId={selectedRFPId}
            onViewChange={handleViewChange}
          />
        )}
      </main>
    </div>
  );
}
