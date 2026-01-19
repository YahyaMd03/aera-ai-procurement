'use client';

import { useEffect, useState, useRef } from 'react';
import { usePathname } from 'next/navigation';
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

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [rfps, setRfps] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const dataLoadedRef = useRef(false);

  // Load data only once on mount
  useEffect(() => {
    if (dataLoadedRef.current) return;
    
    async function loadData() {
      try {
        setLoading(true);
        const [rfpsData, vendorsData] = await Promise.all([
          getRFPs(),
          getVendors(),
        ]);
        setRfps(rfpsData);
        setVendors(vendorsData);
        dataLoadedRef.current = true;
      } catch (err) {
        console.error('Error loading data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  // Extract conversation ID from URL
  useEffect(() => {
    if (pathname?.startsWith('/chat/')) {
      const id = pathname.split('/chat/')[1];
      setConversationId(id || null);
    } else {
      setConversationId(null);
    }
  }, [pathname]);

  if (loading && !dataLoadedRef.current) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <Shell
      initialRFPs={rfps}
      initialVendors={vendors}
      initialConversationId={conversationId}
    />
  );
}
