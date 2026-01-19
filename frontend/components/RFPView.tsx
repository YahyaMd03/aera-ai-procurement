'use client';

import { useState, useEffect } from 'react';
import { Send, DollarSign, Calendar, Package, TrendingUp, AlertCircle, CheckCircle, Check } from 'lucide-react';
import axios from 'axios';
import { apiUrl } from '../lib/api';

interface RFPViewProps {
  rfpId: string;
  vendors: any[];
  onRefresh: () => void;
  onViewChange: (view: string, rfpId?: string) => void;
}

export default function RFPView({ rfpId, vendors, onRefresh, onViewChange }: RFPViewProps) {
  const [rfp, setRFP] = useState<any>(null);
  const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [sentEmails, setSentEmails] = useState<any[]>([]);

  useEffect(() => {
    fetchRFP();
    fetchSentEmails();
  }, [rfpId]);

  const fetchRFP = async () => {
    try {
      const response = await axios.get(`${apiUrl('/api/rfps')}/${rfpId}`);
      setRFP(response.data);
    } catch (error) {
      console.error('Error fetching RFP:', error);
    }
  };

  const fetchSentEmails = async () => {
    try {
      const response = await axios.get(`${apiUrl('/api/sent-emails')}`);
      // Filter for this RFP
      const emailsForRfp = response.data.filter((email: any) => email.rfpId === rfpId);
      setSentEmails(emailsForRfp);
    } catch (error) {
      console.error('Error fetching sent emails:', error);
    }
  };


  const handleSendRFP = async () => {
    if (selectedVendors.length === 0) return;

    setIsSending(true);
    try {
      const response = await axios.post(apiUrl('/api/ai/send-rfp'), {
        rfpId,
        vendorIds: selectedVendors,
      });

      alert(`RFP sent to ${response.data.results.filter((r: any) => r.success).length} vendor(s)`);
      onRefresh();
      fetchRFP();
      fetchSentEmails(); // Refresh sent emails list
      setSelectedVendors([]);
    } catch (error: any) {
      alert(`Error: ${error.response?.data?.error || error.message}`);
    } finally {
      setIsSending(false);
    }
  };

  if (!rfp) {
    return <div className="p-6">Loading...</div>;
  }

  // Use description as fallback if title is placeholder
  const displayTitle = (rfp.title === 'Auto-generated title' || !rfp.title || rfp.title.trim() === '') 
    ? (rfp.description || 'Untitled RFP')
    : rfp.title;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-6 border-b border-gray-200 bg-white">
        <h1 className="text-2xl font-bold mb-2 text-gray-900">{displayTitle}</h1>
        <div className="flex items-center gap-4 text-sm text-gray-700">
          <span className={`px-2 py-1 rounded ${rfp.status === 'sent' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
            {rfp.status}
          </span>
          {rfp.budget && (
            <span className="flex items-center gap-1">
              <DollarSign size={16} />
              ${rfp.budget.toLocaleString()}
            </span>
          )}
          {rfp.deadline && (
            <span className="flex items-center gap-1">
              <Calendar size={16} />
              {new Date(rfp.deadline).toLocaleDateString()}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Package size={16} />
            {rfp.proposals?.length || 0} proposals
          </span>
        </div>
      </div>

      <div className="flex-1 p-6 space-y-6">
        <div>
          <h2 className="text-lg font-bold mb-2 text-gray-900">Description</h2>
          <p className="text-gray-800 font-medium">{rfp.description}</p>
        </div>

        <div>
          <h2 className="text-lg font-bold mb-2 text-gray-900">Requirements</h2>
          <div className="bg-gray-50 rounded-lg p-4">
            {rfp.requirements?.items && rfp.requirements.items.length > 0 && (
              <div className="mb-4">
                <h3 className="font-semibold mb-2 text-gray-900">Items:</h3>
                <ul className="list-disc list-inside space-y-1.5">
                  {rfp.requirements.items.map((item: any, idx: number) => (
                    <li key={idx} className="text-gray-800 font-medium">
                      {item.name}
                      {item.quantity && <span className="text-gray-700 font-normal"> (Qty: {item.quantity})</span>}
                      {item.specifications && <span className="text-gray-700 font-normal"> - {item.specifications}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {rfp.requirements?.deliveryDays && (
              <p className="mb-2 text-gray-800">
                <strong className="font-semibold text-gray-900">Delivery:</strong>{' '}
                <span className="font-medium">{rfp.requirements.deliveryDays} days</span>
              </p>
            )}
            {rfp.requirements?.paymentTerms && (
              <p className="mb-2 text-gray-800">
                <strong className="font-semibold text-gray-900">Payment Terms:</strong>{' '}
                <span className="font-medium">{rfp.requirements.paymentTerms}</span>
              </p>
            )}
            {rfp.requirements?.warranty && (
              <p className="mb-2 text-gray-800">
                <strong className="font-semibold text-gray-900">Warranty:</strong>{' '}
                <span className="font-medium">{rfp.requirements.warranty}</span>
              </p>
            )}
          </div>
        </div>

        {/* Show "Sent To Vendors" if RFP is sent, otherwise show "Send to Vendors" */}
        {rfp.status === 'sent' && sentEmails.length > 0 ? (
          <div>
            <h2 className="text-lg font-bold mb-4 text-gray-900">Sent To Vendors</h2>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="space-y-3">
                {sentEmails.map((sentEmail) => (
                  <div key={sentEmail.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900">{sentEmail.vendor?.name || 'Unknown Vendor'}</div>
                      <div className="text-sm text-gray-600">{sentEmail.vendor?.email || ''}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        Sent on {new Date(sentEmail.sentAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check size={20} className="text-green-600" />
                      <span className="text-sm text-green-600 font-medium">Sent</span>
                    </div>
                  </div>
                ))}
              </div>
              {rfp.proposals && rfp.proposals.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="text-sm text-gray-600">
                    <strong className="text-gray-900">Proposals received:</strong> {rfp.proposals.length} of {sentEmails.length} vendors
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div>
            <h2 className="text-lg font-bold mb-4 text-gray-900">Send to Vendors</h2>
            {sentEmails.length > 0 && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-sm text-blue-800">
                  <strong>Already sent to:</strong> {sentEmails.map((e: any) => e.vendor?.name).filter(Boolean).join(', ')}
                </div>
              </div>
            )}
            <div className="space-y-2 mb-4">
              {vendors
                .filter((vendor) => !sentEmails.some((email) => email.vendorId === vendor.id))
                .map((vendor) => (
                  <label key={vendor.id} htmlFor={`vendor-checkbox-${vendor.id}`} className="flex items-center gap-2 cursor-pointer">
                    <input
                      id={`vendor-checkbox-${vendor.id}`}
                      name={`vendor-${vendor.id}`}
                      type="checkbox"
                      checked={selectedVendors.includes(vendor.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedVendors([...selectedVendors, vendor.id]);
                        } else {
                          setSelectedVendors(selectedVendors.filter((id) => id !== vendor.id));
                        }
                      }}
                      className="rounded"
                    />
                    <span className="font-medium text-gray-900">{vendor.name}</span>
                    <span className="text-sm text-gray-500">({vendor.email})</span>
                  </label>
                ))}
              {vendors.filter((vendor) => !sentEmails.some((email) => email.vendorId === vendor.id)).length === 0 && (
                <div className="text-sm text-gray-500 py-2">All vendors have already been sent this RFP.</div>
              )}
            </div>
            <button
              onClick={handleSendRFP}
              disabled={selectedVendors.length === 0 || isSending || rfp.status === 'sent'}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={20} />
              {isSending ? 'Sending...' : sentEmails.length > 0 
                ? `Send to ${selectedVendors.length} additional vendor(s)` 
                : `Send RFP to ${selectedVendors.length} vendor(s)`}
            </button>
          </div>
        )}

        {rfp.proposals && rfp.proposals.length > 0 && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-900">Proposals Received</h2>
              <button
                onClick={() => onViewChange('comparison', rfpId)}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                Compare Proposals
              </button>
            </div>
            <div className="space-y-4">
              {rfp.proposals.map((proposal: any) => {
                // Debug logging
                console.log('Proposal data:', proposal);
                console.log('Proposal parsedData:', proposal.parsedData);
                
                const evaluation = proposal.parsedData?.evaluation;
                console.log('Evaluation found:', evaluation);
                
                const overallScore = evaluation?.overallScore;
                const getScoreColor = (score: number) => {
                  if (score >= 80) return 'text-green-600 bg-green-50 border-green-200';
                  if (score >= 60) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
                  return 'text-red-600 bg-red-50 border-red-200';
                };

                return (
                  <div key={proposal.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-bold text-lg text-gray-900">{proposal.vendor.name}</h3>
                        {overallScore !== undefined && (
                          <div className={`mt-1 inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold border ${getScoreColor(overallScore)}`}>
                            <TrendingUp size={12} />
                            Overall Score: {overallScore}/100
                          </div>
                        )}
                      </div>
                      {proposal.totalPrice && (
                        <span className="text-lg font-bold text-green-600">
                          ${proposal.totalPrice.toLocaleString()}
                        </span>
                      )}
                    </div>
                    
                    {/* Evaluation Metrics */}
                    {evaluation && (
                      <div className="mb-4 mt-3 p-3 bg-gray-50 rounded-lg">
                        <h4 className="text-sm font-bold mb-2 text-gray-900">Evaluation Metrics</h4>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="font-medium text-gray-800">Price Score:</span>{' '}
                            <span className={`font-semibold ${evaluation.criteria.price.score >= 80 ? 'text-green-600' : evaluation.criteria.price.score >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                              {evaluation.criteria.price.score}/100
                            </span>
                            <div className="text-gray-500 text-xs mt-0.5">{evaluation.criteria.price.reasoning}</div>
                          </div>
                          <div>
                            <span className="font-medium text-gray-800">Delivery Score:</span>{' '}
                            <span className={`font-semibold ${evaluation.criteria.delivery.score >= 80 ? 'text-green-600' : evaluation.criteria.delivery.score >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                              {evaluation.criteria.delivery.score}/100
                            </span>
                            <div className="text-gray-500 text-xs mt-0.5">{evaluation.criteria.delivery.reasoning}</div>
                          </div>
                          <div>
                            <span className="font-medium text-gray-800">Requirements Match:</span>{' '}
                            <span className={`font-semibold ${evaluation.criteria.requirements.score >= 80 ? 'text-green-600' : evaluation.criteria.requirements.score >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                              {evaluation.criteria.requirements.itemsMatched}/{evaluation.criteria.requirements.itemsTotal} ({evaluation.criteria.requirements.score}/100)
                            </span>
                          </div>
                          <div>
                            <span className="font-medium text-gray-800">Warranty Score:</span>{' '}
                            <span className={`font-semibold ${evaluation.criteria.warranty.score >= 80 ? 'text-green-600' : evaluation.criteria.warranty.score >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                              {evaluation.criteria.warranty.score}/100
                            </span>
                          </div>
                        </div>
                        
                        {evaluation.strengths.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-gray-200">
                            <div className="flex items-start gap-1 text-xs">
                              <CheckCircle size={14} className="text-green-600 mt-0.5 flex-shrink-0" />
                              <div>
                                <span className="font-semibold text-green-700">Strengths:</span>{' '}
                                <span className="text-gray-700">{evaluation.strengths.join(', ')}</span>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {evaluation.weaknesses.length > 0 && (
                          <div className="mt-1 text-xs">
                            <div className="flex items-start gap-1">
                              <AlertCircle size={14} className="text-yellow-600 mt-0.5 flex-shrink-0" />
                              <div>
                                <span className="font-semibold text-yellow-700">Weaknesses:</span>{' '}
                                <span className="text-gray-700">{evaluation.weaknesses.join(', ')}</span>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {evaluation.concerns.length > 0 && (
                          <div className="mt-1 text-xs">
                            <div className="flex items-start gap-1">
                              <AlertCircle size={14} className="text-red-600 mt-0.5 flex-shrink-0" />
                              <div>
                                <span className="font-semibold text-red-700">Concerns:</span>{' '}
                                <span className="text-gray-700">{evaluation.concerns.join(', ')}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {proposal.deliveryDays && (
                        <div className="text-gray-800"><span className="font-medium">Delivery:</span> {proposal.deliveryDays} days</div>
                      )}
                      {proposal.paymentTerms && (
                        <div className="text-gray-800"><span className="font-medium">Payment:</span> {proposal.paymentTerms}</div>
                      )}
                      {proposal.warranty && <div className="text-gray-800"><span className="font-medium">Warranty:</span> {proposal.warranty}</div>}
                      {proposal.completeness && (
                        <div className="text-gray-800"><span className="font-medium">Completeness:</span> {(proposal.completeness * 100).toFixed(0)}%</div>
                      )}
                    </div>
                    {proposal.notes && (
                      <p className="mt-2 text-sm text-gray-700">{proposal.notes}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
