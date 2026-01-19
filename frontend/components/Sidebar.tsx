'use client';

import { MessageSquare, Users, Mail, Inbox, Send, Bot, Sparkles, Plus, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string, rfpId?: string) => void;
  rfps: any[];
  vendors: any[];
  conversations: any[];
  currentConversationId?: string | null;
  onNewConversation: () => void;
  onSelectConversation: (id: string) => void;
  onRefresh: () => void;
}

// Status colors for dark background
const statusColors: Record<string, string> = {
  drafting_rfp: 'bg-purple-900/30 text-purple-300 border-purple-700/50',
  collecting_requirements: 'bg-blue-900/30 text-blue-300 border-blue-700/50',
  ready_to_send: 'bg-cyan-900/30 text-cyan-300 border-cyan-700/50',
  sent: 'bg-green-900/30 text-green-300 border-green-700/50',
  closed: 'bg-gray-700/30 text-gray-400 border-gray-600/50',
};

const statusLabels: Record<string, string> = {
  drafting_rfp: 'Drafting',
  collecting_requirements: 'Collecting',
  ready_to_send: 'Ready',
  sent: 'Sent',
  closed: 'Closed',
};

export default function Sidebar({ 
  currentView, 
  onViewChange, 
  rfps,
  vendors,
  conversations,
  currentConversationId,
  onNewConversation,
  onSelectConversation,
}: SidebarProps) {
  const router = useRouter();
  const [showMails, setShowMails] = useState(false);
  const [showRFPs, setShowRFPs] = useState(false);

  const getConversationDisplayName = (conv: any) => {
    if (conv.title) return conv.title;
    const firstUserMessage = conv.messages?.find((m: any) => m.role === 'user');
    if (firstUserMessage) {
      return firstUserMessage.content.substring(0, 40) + (firstUserMessage.content.length > 40 ? '...' : '');
    }
    return 'New Conversation';
  };

  const getStatusBadge = (status: string) => {
    const statusColor = statusColors[status] || statusColors.drafting_rfp;
    const statusLabel = statusLabels[status] || status;
    
    return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${statusColor}`}>
        {statusLabel}
      </span>
    );
  };

  return (
    <div className="w-64 bg-gray-900 text-white flex flex-col h-full">
      {/* Logo/Header */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 via-blue-500 to-cyan-500 flex items-center justify-center shadow-lg">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-gray-900 flex items-center justify-center">
              <Sparkles className="w-2.5 h-2.5 text-white" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-bold">Aera AI</h1>
            <p className="text-sm text-gray-400">Procurement Assistant</p>
          </div>
        </div>
      </div>

      {/* New Chat Button */}
      <div className="p-3 border-b border-gray-800">
        <button
          onClick={onNewConversation}
          className="w-full flex items-center gap-3 px-3 py-2.5 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors text-left"
        >
          <Plus size={18} />
          <span className="font-medium">New chat</span>
        </button>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto p-2">
        {/* Your Chats */}
        <div className="mt-2">
          <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Your chats
          </div>
          <div className="space-y-1">
            {conversations.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">No conversations yet</div>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`flex items-start gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                    currentConversationId === conv.id && currentView === 'chat'
                      ? 'bg-gray-800'
                      : 'hover:bg-gray-800'
                  }`}
                  onClick={() => {
                    router.push(`/chat/${conv.id}`);
                  }}
                >
                  <MessageSquare size={16} className="text-gray-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <span className="text-sm truncate">{getConversationDisplayName(conv)}</span>
                    {conv.status && (
                      <div className="flex items-center">
                        {getStatusBadge(conv.status)}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* RFPs */}
        <div className="mt-4">
          <button
            onClick={() => setShowRFPs(!showRFPs)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
              currentView === 'rfp' || currentView === 'comparison' ? 'bg-gray-800' : 'hover:bg-gray-800'
            }`}
          >
            <MessageSquare size={18} />
            <span className="flex-1 text-left">RFPs</span>
            <span className="text-xs text-gray-400">({rfps.length})</span>
            {showRFPs ? (
              <ChevronUp size={16} className="text-gray-400" />
            ) : (
              <ChevronDown size={16} className="text-gray-400" />
            )}
          </button>
          
          {showRFPs && (
            <div className="ml-4 mt-1 space-y-1 max-h-64 overflow-y-auto">
              {rfps.length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-500">No RFPs yet</div>
              ) : (
                rfps.map((rfp) => (
                  <div
                    key={rfp.id}
                    className={`flex items-start gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                      currentView === 'rfp' || currentView === 'comparison' ? 'hover:bg-gray-800' : 'hover:bg-gray-800'
                    }`}
                    onClick={() => {
                      onViewChange('rfp', rfp.id);
                    }}
                  >
                    <MessageSquare size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <span className="text-sm truncate font-medium">
                        {(rfp.title === 'Auto-generated title' || !rfp.title || rfp.title.trim() === '') 
                          ? (rfp.description || 'Untitled RFP')
                          : rfp.title}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${
                          rfp.status === 'sent' ? 'bg-green-900/30 text-green-300 border-green-700/50' :
                          rfp.status === 'draft' ? 'bg-gray-700/30 text-gray-400 border-gray-600/50' :
                          'bg-purple-900/30 text-purple-300 border-purple-700/50'
                        }`}>
                          {rfp.status}
                        </span>
                        {rfp.proposals && rfp.proposals.length > 0 && (
                          <span className="text-xs text-gray-400">
                            {rfp.proposals.length} proposal{rfp.proposals.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Vendor */}
        <div className="mt-2">
          <button
            onClick={() => router.push('/vendors')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
              currentView === 'vendor' ? 'bg-gray-800' : 'hover:bg-gray-800'
            }`}
          >
            <Users size={18} />
            <span>Vendor</span>
            <span className="ml-auto text-xs text-gray-400">({vendors.length})</span>
          </button>
        </div>

        {/* Mails */}
        <div className="mt-2">
          <button
            onClick={() => setShowMails(!showMails)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
              currentView === 'mail-inbox' || currentView === 'mail-sent' ? 'bg-gray-800' : 'hover:bg-gray-800'
            }`}
          >
            <Mail size={18} />
            <span className="flex-1 text-left">Mails</span>
            {showMails ? (
              <ChevronUp size={16} className="text-gray-400" />
            ) : (
              <ChevronDown size={16} className="text-gray-400" />
            )}
          </button>
          
          {showMails && (
            <div className="ml-4 mt-1 space-y-1">
              <button
                onClick={() => router.push('/mail/inbox')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  currentView === 'mail-inbox' ? 'bg-gray-800' : 'hover:bg-gray-800'
                }`}
              >
                <Inbox size={16} />
                <span>Inbox</span>
              </button>
              <button
                onClick={() => router.push('/mail/sent')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  currentView === 'mail-sent' ? 'bg-gray-800' : 'hover:bg-gray-800'
                }`}
              >
                <Send size={16} />
                <span>Sent</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
