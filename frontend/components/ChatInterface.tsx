'use client';

import { useState, useRef, useEffect } from 'react';
import { ArrowUp, Loader2, Bot, Sparkles, User, AlertCircle, Send, X, Check } from 'lucide-react';
import axios from 'axios';
import { getSessionId } from '../lib/session';
import { apiUrl } from '../lib/api';

interface ChatInterfaceProps {
  onRFPCreated: (rfp: any) => void;
  vendors: any[];
  rfps: any[];
  onRefresh: () => void;
  onViewChange: (view: string, rfpId?: string) => void;
  conversationId?: string | null;
  onConversationUpdate?: () => void;
}

interface Message {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt?: string;
  showSendButton?: boolean;
}

interface Conversation {
  id: string;
  title?: string | null;
  status: string;
  agentState: any;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

const statusColors: Record<string, string> = {
  drafting_rfp: 'bg-purple-100 text-purple-700 border-purple-300',
  collecting_requirements: 'bg-blue-100 text-blue-700 border-blue-300',
  ready_to_send: 'bg-cyan-100 text-cyan-700 border-cyan-300',
  sent: 'bg-green-100 text-green-700 border-green-300',
  closed: 'bg-gray-100 text-gray-700 border-gray-300',
};

const statusLabels: Record<string, string> = {
  drafting_rfp: 'Drafting',
  collecting_requirements: 'Collecting',
  ready_to_send: 'Ready',
  sent: 'Sent',
  closed: 'Closed',
};

export default function ChatInterface({
  onRFPCreated,
  vendors,
  rfps,
  onRefresh,
  onViewChange,
  conversationId,
  onConversationUpdate,
}: ChatInterfaceProps) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingConversation, setIsLoadingConversation] = useState(true);
  const [sessionId, setSessionId] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
  const [isSendingRFP, setIsSendingRFP] = useState(false);
  const [messagesWithSendButton, setMessagesWithSendButton] = useState<Set<string>>(new Set());
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);

  // Engaging loading messages that rotate
  const loadingMessages = [
    'Thinking...',
    'Analyzing your request...',
    'Gathering information...',
    'Processing...',
    'Almost there...',
    'Preparing response...',
  ];

  // Rotate loading messages while thinking
  useEffect(() => {
    if (isLoading) {
      const interval = setInterval(() => {
        setLoadingMessageIndex((prev) => (prev + 1) % loadingMessages.length);
      }, 2000); // Change message every 2 seconds
      return () => clearInterval(interval);
    } else {
      setLoadingMessageIndex(0);
    }
  }, [isLoading]);

  // Initialize session ID on client side only
  useEffect(() => {
    setSessionId(getSessionId());
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  // Load conversation when conversationId changes
  useEffect(() => {
    if (conversationId) {
      loadConversation(conversationId);
    } else if (sessionId && !sessionId.startsWith('temp_')) {
      loadOrCreateActiveConversation();
    }
  }, [conversationId, sessionId]);

  const loadConversation = async (id: string) => {
    if (!sessionId || sessionId.startsWith('temp_')) return;
    
    try {
      setIsLoadingConversation(true);
      const response = await axios.get(`${apiUrl('/api/conversations')}/${id}?sessionId=${sessionId}`);
      const conv = response.data;
      setConversation(conv);
      setMessages(conv.messages || []);
    } catch (error) {
      console.error('Error loading conversation:', error);
    } finally {
      setIsLoadingConversation(false);
    }
  };

  const loadOrCreateActiveConversation = async () => {
    try {
      setIsLoadingConversation(true);
      const response = await axios.post(apiUrl('/api/conversations'), {
        sessionId,
      });
      const activeConv = response.data;
      setConversation(activeConv);
      setMessages(activeConv.messages || []);
      if (onConversationUpdate) {
        onConversationUpdate();
      }
    } catch (error) {
      console.error('Error loading conversation:', error);
    } finally {
      setIsLoadingConversation(false);
    }
  };


  const handleSend = async () => {
    if (!input.trim() || isLoading || !conversation) return;

    const userMessage = input.trim();
    setInput('');
    
    // Optimistically add user message
    const tempUserMessage: Message = {
      role: 'user',
      content: userMessage,
    };
    setMessages((prev) => [...prev, tempUserMessage]);
    setIsLoading(true);

    try {
      // Send message to conversation endpoint
      const response = await axios.post(
        `${apiUrl('/api/conversations')}/${conversation.id}/message`,
        { message: userMessage, sessionId }
      );

      const { conversation: updatedConv, message: aiResponse, stateUpdate, showSendButton } = response.data;
      
      // Update conversation state
      setConversation(updatedConv);
      
      // Get messages from updated conversation
      const updatedMessages = updatedConv.messages || [];
      
      // If showSendButton is true, mark the last assistant message to show the button
      if (showSendButton && updatedMessages.length > 0) {
        const lastMessage = updatedMessages[updatedMessages.length - 1];
        if (lastMessage.role === 'assistant' && lastMessage.id) {
          setMessagesWithSendButton(prev => new Set(prev).add(lastMessage.id!));
        }
      }
      
      // Add assistant response - use messages from updated conversation
      setMessages(updatedMessages);
      
      // Notify parent to refresh conversations list
      if (onConversationUpdate) {
        onConversationUpdate();
      }

      // Check if RFP was created in agent state
      if (stateUpdate?.rfpId && stateUpdate.rfpId !== conversation.agentState?.rfpId) {
        // Find the RFP and trigger callback
        const rfp = rfps.find(r => r.id === stateUpdate.rfpId);
        if (rfp) {
          onRFPCreated(rfp);
        }
        onRefresh();
      }

      // Refresh conversation to get updated state
      if (onConversationUpdate) {
        onConversationUpdate();
      }
    } catch (error: any) {
      // Try to reload conversation to get any system messages added by backend
      try {
        const convResponse = await axios.get(
          `${apiUrl('/api/conversations')}/${conversation.id}`
        );
        if (convResponse.data?.messages) {
          setMessages(convResponse.data.messages);
          setConversation(convResponse.data);
          return;
        }
      } catch (reloadError) {
        // If reload fails, handle locally
      }
      
      // Remove temp message on error
      setMessages((prev) => prev.filter(m => m.id !== tempUserMessage.id));
      
      // Add system message for error
      const errorMessage = error.response?.data?.error || error.message || 'An unexpected error occurred';
      
      setMessages((prev) => [
        ...prev,
        {
          role: 'system',
          content: `An error occurred: ${errorMessage}`,
        },
        {
          role: 'assistant',
          content: 'I apologize, but I encountered an issue processing your request. Please try rephrasing your message or try again in a moment.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Check if RFP is ready to send - only show button when explicitly requested
  const isRFPReady = () => {
    // Don't show the always-visible button anymore - only show in messages with showSendButton flag
    return false;
  };

  const getRFPId = async () => {
    // First check if rfpId is in agent state
    if (conversation?.agentState?.rfpId) {
      return conversation.agentState.rfpId;
    }
    
    // If no rfpId but we have rfpDraft with title, try to find matching RFP
    const rfpDraft = conversation?.agentState?.rfpDraft;
    if (rfpDraft?.title) {
      try {
        // Search for RFP by title
        const response = await axios.get(apiUrl('/api/rfps'));
        const matchingRFP = response.data.find((r: any) => 
          r.title === rfpDraft.title || r.title.toLowerCase() === rfpDraft.title.toLowerCase()
        );
        if (matchingRFP) {
          return matchingRFP.id;
        }
      } catch (error) {
        console.error('Error searching for RFP:', error);
      }
    }
    
    return null;
  };

  const handleOpenVendorModal = () => {
    // Pre-select vendors if they were already selected in agent state
    const preSelected = conversation?.agentState?.rfpDraft?.vendorsSelected || [];
    setSelectedVendors(preSelected);
    setShowVendorModal(true);
  };

  const handleSendRFP = async () => {
    if (selectedVendors.length === 0) return;
    
    let rfpId = conversation?.agentState?.rfpId;
    
    // If no rfpId, try to find or create RFP
    if (!rfpId) {
      const rfpDraft = conversation?.agentState?.rfpDraft;
      if (rfpDraft?.title) {
        try {
          // First try to find existing RFP
          const response = await axios.get(apiUrl('/api/rfps'));
          const matchingRFP = response.data.find((r: any) => 
            r.title === rfpDraft.title || r.title.toLowerCase() === rfpDraft.title.toLowerCase()
          );
          
          if (matchingRFP) {
            rfpId = matchingRFP.id;
          } else {
            // Create RFP from draft
            const createResponse = await axios.post(apiUrl('/api/rfps'), {
              title: rfpDraft.title,
              description: rfpDraft.description || rfpDraft.title,
              budget: rfpDraft.budget || null,
              deadline: rfpDraft.deadline ? new Date(rfpDraft.deadline).toISOString() : null,
              requirements: rfpDraft.requirements || { items: [] },
              status: 'draft',
            });
            rfpId = createResponse.data.id;
            
            // Update agent state with rfpId
            if (conversation?.id) {
              await axios.post(
                `${apiUrl('/api/conversations')}/${conversation.id}/message`,
                { 
                  message: `RFP "${rfpDraft.title}" has been created.`, 
                  sessionId 
                }
              );
              // Reload conversation to get updated state
              await loadConversation(conversation.id);
            }
          }
        } catch (error) {
          console.error('Error finding/creating RFP:', error);
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: 'I encountered an error while preparing the RFP. Please try again.',
            },
          ]);
          return;
        }
      }
    }
    
    if (!rfpId) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'I need more information to create the RFP. Please provide the RFP details.',
        },
      ]);
      return;
    }

    setIsSendingRFP(true);
    try {
      const response = await axios.post(apiUrl('/api/ai/send-rfp'), {
        rfpId,
        vendorIds: selectedVendors,
        conversationId: conversation?.id,
      });

      const successCount = response.data.results.filter((r: any) => r.success).length;
      const failedCount = response.data.results.length - successCount;

      // Add success message to chat
      const successMessage = `RFP sent successfully to ${successCount} vendor(s)${failedCount > 0 ? `. ${failedCount} vendor(s) failed to receive the email.` : ''}`;
      
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: successMessage,
        },
      ]);

      // Refresh conversation and RFPs
      if (onConversationUpdate) {
        onConversationUpdate();
      }
      onRefresh();

      // Reload conversation to get updated state
      if (conversation?.id) {
        await loadConversation(conversation.id);
      }

      setShowVendorModal(false);
      setSelectedVendors([]);
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.message || 'Failed to send RFP';
      
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `I encountered an error while sending the RFP: ${errorMessage}. Please try again.`,
        },
      ]);
    } finally {
      setIsSendingRFP(false);
    }
  };

  if (isLoadingConversation) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-purple-600" size={32} />
      </div>
    );
  }

  return (
    <div className="flex h-full bg-gradient-to-br from-gray-50 via-white to-gray-50">
      {/* Main Chat Area - Full Width */}
      <div className="flex-1 flex flex-col">
        {/* Chat Header */}
        <div className="border-b border-gray-200 bg-white/80 backdrop-blur-sm px-6 py-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 via-blue-500 to-cyan-500 flex items-center justify-center shadow-lg">
                <Bot className="w-6 h-6 text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white flex items-center justify-center">
                <Sparkles className="w-2.5 h-2.5 text-white" />
              </div>
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-gray-900">
                {conversation?.title || 'Aera AI'}
              </h2>
              <p className="text-xs text-gray-500">
                {conversation?.status ? (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${statusColors[conversation.status] || statusColors.drafting_rfp}`}>
                    {statusLabels[conversation.status] || conversation.status}
                  </span>
                ) : (
                  'AI Procurement Assistant'
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 ? (
            <div className="text-center text-gray-500 mt-8">
              <Bot className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p>Start a conversation to begin</p>
            </div>
          ) : (
            messages.map((message, idx) => (
              <div
                key={message.id || idx}
                className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.role === 'assistant' && (
                  <div className="flex-shrink-0">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 via-blue-500 to-cyan-500 flex items-center justify-center shadow-md">
                      <Bot className="w-5 h-5 text-white" />
                    </div>
                  </div>
                )}
                {message.role === 'system' && (
                  <div className="flex-shrink-0">
                    <div className="w-9 h-9 rounded-full bg-amber-100 border-2 border-amber-300 flex items-center justify-center shadow-md">
                      <AlertCircle className="w-5 h-5 text-amber-600" />
                    </div>
                  </div>
                )}
                <div className="flex flex-col max-w-3xl">
                  {message.role === 'assistant' && (
                    <span className="text-xs font-medium text-gray-600 mb-1 px-1">Aera AI</span>
                  )}
                  {message.role === 'system' && (
                    <span className="text-xs font-medium text-amber-600 mb-1 px-1">System Notice</span>
                  )}
                  <div
                    className={`rounded-2xl px-5 py-3 shadow-sm ${
                      message.role === 'user'
                        ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white ml-auto'
                        : message.role === 'system'
                        ? 'bg-amber-50 text-amber-800 border-2 border-amber-200'
                        : 'bg-white border border-gray-200 text-gray-800 shadow-md'
                    }`}
                  >
                    <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
                    {message.role === 'assistant' && message.id && messagesWithSendButton.has(message.id) && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <button
                          onClick={handleOpenVendorModal}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-br from-purple-600 via-blue-600 to-cyan-600 text-white rounded-lg hover:from-purple-700 hover:via-blue-700 hover:to-cyan-700 shadow-md hover:shadow-lg transition-all"
                        >
                          <Send size={18} />
                          <span className="font-semibold">Send RFP to Vendors</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {message.role === 'user' && (
                  <div className="flex-shrink-0">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center shadow-md">
                      <User className="w-5 h-5 text-white" />
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex gap-3 justify-start animate-fade-in">
              <div className="flex-shrink-0">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 via-blue-500 to-cyan-500 flex items-center justify-center shadow-md animate-pulse">
                  <Bot className="w-5 h-5 text-white animate-pulse" />
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-gray-600 mb-1 px-1">Aera AI</span>
                <div className="bg-white border border-gray-200 rounded-2xl px-5 py-4 shadow-md">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1.5 items-center">
                      <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1s' }}></span>
                      <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms', animationDuration: '1s' }}></span>
                      <span className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '300ms', animationDuration: '1s' }}></span>
                    </div>
                    <div className="relative min-w-[140px]">
                      <span 
                        key={loadingMessageIndex}
                        className="text-sm text-gray-600 font-medium inline-block animate-fade-in-out"
                      >
                        {loadingMessages[loadingMessageIndex]}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="border-t border-gray-200 bg-white/80 backdrop-blur-sm p-4 shadow-lg">
          <div className="flex gap-3 w-full items-end">
            <textarea
              ref={textareaRef}
              id="chat-input"
              name="message"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask Aera AI anything about procurement..."
              className="flex-1 px-5 py-3 border-2 border-purple-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white shadow-sm transition-all text-gray-900 placeholder:text-gray-400 resize-none overflow-y-auto min-h-[52px] max-h-[200px]"
              disabled={isLoading || !conversation}
              rows={1}
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim() || !conversation}
              className="px-6 py-3 bg-gradient-to-br from-purple-500 via-blue-500 to-cyan-500 text-white rounded-xl hover:from-purple-600 hover:via-blue-600 hover:to-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg hover:shadow-xl transition-all transform hover:scale-105 disabled:transform-none flex-shrink-0"
            >
              <ArrowUp size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Vendor Selection Modal */}
      {showVendorModal && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity"
            onClick={() => !isSendingRFP && setShowVendorModal(false)}
          />
          
          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div 
              className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Select Vendors</h2>
                  <p className="text-sm text-gray-500 mt-1">Choose vendors to send the RFP to</p>
                </div>
                <button
                  onClick={() => !isSendingRFP && setShowVendorModal(false)}
                  disabled={isSendingRFP}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                >
                  <X size={24} className="text-gray-600" />
                </button>
              </div>
              
              {/* Modal Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {vendors.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <p>No vendors available. Please add vendors first.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {vendors.map((vendor) => (
                      <label
                        key={vendor.id}
                        htmlFor={`vendor-${vendor.id}`}
                        className={`flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                          selectedVendors.includes(vendor.id)
                            ? 'border-purple-500 bg-purple-50'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex-shrink-0">
                          {selectedVendors.includes(vendor.id) ? (
                            <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center">
                              <Check size={16} className="text-white" />
                            </div>
                          ) : (
                            <div className="w-6 h-6 rounded-full border-2 border-gray-300" />
                          )}
                        </div>
                        <input
                          id={`vendor-${vendor.id}`}
                          type="checkbox"
                          checked={selectedVendors.includes(vendor.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedVendors([...selectedVendors, vendor.id]);
                            } else {
                              setSelectedVendors(selectedVendors.filter((id) => id !== vendor.id));
                            }
                          }}
                          className="hidden"
                          disabled={isSendingRFP}
                        />
                        <div className="flex-1">
                          <div className="font-semibold text-gray-900">{vendor.name}</div>
                          <div className="text-sm text-gray-500">{vendor.email}</div>
                          {vendor.contactName && (
                            <div className="text-xs text-gray-400 mt-1">Contact: {vendor.contactName}</div>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Modal Footer */}
              <div className="p-6 border-t border-gray-200 flex justify-between items-center">
                <div className="text-sm text-gray-600">
                  {selectedVendors.length > 0 ? (
                    <span className="font-medium text-purple-600">
                      {selectedVendors.length} vendor{selectedVendors.length !== 1 ? 's' : ''} selected
                    </span>
                  ) : (
                    'Select at least one vendor'
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowVendorModal(false)}
                    disabled={isSendingRFP}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSendRFP}
                    disabled={selectedVendors.length === 0 || isSendingRFP}
                    className="px-6 py-2 bg-gradient-to-br from-purple-600 via-blue-600 to-cyan-600 text-white rounded-lg hover:from-purple-700 hover:via-blue-700 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isSendingRFP ? (
                      <>
                        <Loader2 className="animate-spin" size={18} />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send size={18} />
                        Send RFP
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
