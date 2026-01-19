'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Inbox, Send, Calendar, DollarSign, Package, User } from 'lucide-react';
import axios from 'axios';
import { getSessionId } from '@/lib/session';
import { apiUrl } from '@/lib/api';

interface MailViewProps {
  type: 'inbox' | 'sent';
  emailId?: string | null;
}

export default function MailView({ type, emailId }: MailViewProps) {
  const router = useRouter();
  const [emails, setEmails] = useState<any[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchEmails();
  }, [type]);

  useEffect(() => {
    if (emailId && emails.length > 0) {
      const email = emails.find((e: any) => e.id === emailId);
      if (email) {
        setSelectedEmail(email);
      } else {
        // Try to fetch the specific email if not in list
        fetchEmailById(emailId);
      }
    } else if (!emailId) {
      setSelectedEmail(null);
    }
  }, [emailId, emails]);

  const fetchEmails = async () => {
    try {
      setIsLoading(true);
      
      if (type === 'inbox') {
        // For inbox: proposals received (have rawEmail) - these are global
        const response = await axios.get(apiUrl('/api/proposals'));
        const allProposals = Array.isArray(response.data) ? response.data : [];
        const inboxEmails = allProposals.filter((p: any) => p.rawEmail).map((proposal: any) => ({
          id: proposal.id,
          type: 'proposal',
          subject: `Proposal from ${proposal.vendor?.name || 'Unknown Vendor'}`,
          from: proposal.vendor?.email || proposal.vendor?.name || 'Unknown',
          to: 'You',
          date: proposal.createdAt,
          proposal: proposal,
          preview: proposal.notes || `Total: $${proposal.totalPrice?.toLocaleString() || 'N/A'}`,
        }));
        setEmails(inboxEmails);
      } else {
        // For sent: get all sent emails
        const response = await axios.get(apiUrl('/api/sent-emails'));
        const sentEmails = Array.isArray(response.data) ? response.data : [];
        const formattedEmails = sentEmails.map((email: any) => ({
          id: email.id,
          type: 'sent',
          subject: email.subject || `RFP: ${email.rfp?.title || 'Untitled'}`,
          from: 'You',
          to: email.vendor?.email || email.vendor?.name || 'Unknown',
          date: email.sentAt,
          body: email.body,
          rfp: email.rfp,
          vendor: email.vendor,
          preview: email.body ? email.body.substring(0, 100) + '...' : email.rfp?.description?.substring(0, 100) + '...',
        }));
        setEmails(formattedEmails);
      }
    } catch (error) {
      console.error('Error fetching emails:', error);
      setEmails([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchEmailById = async (id: string) => {
    try {
      if (type === 'sent') {
        const response = await axios.get(`${apiUrl('/api/sent-emails')}/${id}`);
        const email = response.data;
        setSelectedEmail({
          id: email.id,
          type: 'sent',
          subject: email.subject || `RFP: ${email.rfp?.title || 'Untitled'}`,
          from: 'You',
          to: email.vendor?.email || email.vendor?.name || 'Unknown',
          date: email.sentAt,
          body: email.body,
          rfp: email.rfp,
          vendor: email.vendor,
        });
      }
    } catch (error) {
      console.error('Error fetching email:', error);
    }
  };

  const handleEmailClick = (email: any) => {
    setSelectedEmail(email);
    router.push(`/mail/${type}/${email.id}`);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      return 'Today';
    } else if (diffDays === 2) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays - 1} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-gray-50">
      {/* Email List Panel */}
      <div className="w-1/3 border-r border-gray-200 bg-white flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            {type === 'inbox' ? (
              <Inbox className="w-5 h-5 text-gray-600" />
            ) : (
              <Send className="w-5 h-5 text-gray-600" />
            )}
            <h2 className="text-lg font-semibold text-gray-900">
              {type === 'inbox' ? 'Inbox' : 'Sent'}
            </h2>
            <span className="text-sm text-gray-500">({emails.length})</span>
          </div>
        </div>

        {/* Email List */}
        <div className="flex-1 overflow-y-auto">
          {emails.length === 0 ? (
            <div className="text-center py-12 text-gray-500 px-4">
              <Mail className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p className="text-sm font-medium">
                {type === 'inbox' ? 'No emails in inbox' : 'No sent emails'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {emails.map((email: any) => (
                <div
                  key={email.id}
                  onClick={() => handleEmailClick(email)}
                  className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                    selectedEmail?.id === email.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-gray-900 truncate">
                          {type === 'inbox' ? email.from : email.to}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-gray-900 truncate mb-1">
                        {email.subject}
                      </p>
                      <p className="text-xs text-gray-500 line-clamp-2">
                        {email.preview}
                      </p>
                    </div>
                    <span className="text-xs text-gray-400 ml-2 whitespace-nowrap">
                      {formatDate(email.date)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Email Detail Panel */}
      <div className="flex-1 flex flex-col bg-white">
        {selectedEmail ? (
          <>
            {/* Email Header */}
            <div className="p-6 border-b border-gray-200">
              <h1 className="text-2xl font-semibold text-gray-900 mb-4">
                {selectedEmail.subject}
              </h1>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-gray-600 font-medium">From:</span>
                  <span className="text-gray-900">{selectedEmail.from}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-600 font-medium">To:</span>
                  <span className="text-gray-900">{selectedEmail.to}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-600 font-medium">Date:</span>
                  <span className="text-gray-900">
                    {new Date(selectedEmail.date).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Email Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {selectedEmail.type === 'sent' && selectedEmail.body ? (
                <div className="whitespace-pre-wrap text-gray-800 leading-relaxed">
                  {selectedEmail.body}
                </div>
              ) : selectedEmail.type === 'proposal' && selectedEmail.proposal ? (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Proposal Details</h3>
                    <p className="text-sm text-gray-600">
                      From: {selectedEmail.proposal.vendor?.name || 'Unknown Vendor'}
                    </p>
                    {(() => {
                      const rfp = selectedEmail.proposal.rfp;
                      if (!rfp) {
                        return <p className="text-sm text-gray-600">For: Unknown RFP</p>;
                      }
                      // Use description if title is a placeholder, otherwise use title
                      const displayTitle = 
                        rfp.title === 'Auto-generated title' || 
                        rfp.title?.trim() === '' ||
                        !rfp.title
                          ? (rfp.description || 'Untitled RFP')
                          : rfp.title;
                      // Truncate if too long
                      const truncatedTitle = displayTitle.length > 60 
                        ? displayTitle.substring(0, 60) + '...'
                        : displayTitle;
                      return (
                        <p className="text-sm text-gray-600">
                          For: {truncatedTitle}
                        </p>
                      );
                    })()}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {selectedEmail.proposal.totalPrice && (
                      <div className="flex items-center gap-2 text-gray-700">
                        <DollarSign size={18} className="text-gray-400" />
                        <div>
                          <div className="font-medium">Total Price</div>
                          <div className="text-lg">${selectedEmail.proposal.totalPrice.toLocaleString()}</div>
                        </div>
                      </div>
                    )}
                    {selectedEmail.proposal.deliveryDays && (
                      <div className="flex items-center gap-2 text-gray-700">
                        <Calendar size={18} className="text-gray-400" />
                        <div>
                          <div className="font-medium">Delivery</div>
                          <div>{selectedEmail.proposal.deliveryDays} days</div>
                        </div>
                      </div>
                    )}
                    {selectedEmail.proposal.paymentTerms && (
                      <div className="text-gray-700">
                        <div className="font-medium mb-1">Payment Terms</div>
                        <div>{selectedEmail.proposal.paymentTerms}</div>
                      </div>
                    )}
                    {selectedEmail.proposal.warranty && (
                      <div className="text-gray-700">
                        <div className="font-medium mb-1">Warranty</div>
                        <div>{selectedEmail.proposal.warranty}</div>
                      </div>
                    )}
                  </div>

                  {selectedEmail.proposal.notes && (
                    <div className="pt-4 border-t border-gray-200">
                      <h4 className="font-medium text-gray-900 mb-2">Notes</h4>
                      <p className="text-gray-700 whitespace-pre-wrap">{selectedEmail.proposal.notes}</p>
                    </div>
                  )}

                  {selectedEmail.proposal.rawEmail && (
                    <div className="pt-4 border-t border-gray-200">
                      <h4 className="font-medium text-gray-900 mb-2">Original Email</h4>
                      <div className="bg-gray-50 p-4 rounded-lg text-sm text-gray-700 whitespace-pre-wrap font-mono">
                        {selectedEmail.proposal.rawEmail}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-gray-500">No content available</div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <Mail className="w-16 h-16 mx-auto mb-4 text-gray-400" />
              <p className="text-lg font-medium">Select an email to view</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
