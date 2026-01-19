'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, AlertCircle, CheckCircle, Award, X, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import axios from 'axios';
import { apiUrl } from '../lib/api';

interface ComparisonViewProps {
  rfpId: string;
  onViewChange: (view: string, rfpId?: string) => void;
}

export default function ComparisonView({ rfpId, onViewChange }: ComparisonViewProps) {
  const [comparison, setComparison] = useState<any>(null);
  const [rfp, setRFP] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCached, setIsCached] = useState(false);
  const [expandedVendors, setExpandedVendors] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchComparison();
  }, [rfpId]);

  const fetchComparison = async (forceRefresh = false) => {
    try {
      if (forceRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      const url = forceRefresh 
        ? `${apiUrl('/api/ai/compare')}/${rfpId}?refresh=true`
        : `${apiUrl('/api/ai/compare')}/${rfpId}`;
      const response = await axios.get(url);
      setComparison(response.data.comparison);
      setRFP(response.data.rfp);
      setIsCached(response.data.cached || false);
      // Expand the top vendor by default
      if (response.data.comparison?.evaluations?.length > 0) {
        setExpandedVendors(new Set([response.data.comparison.evaluations[0].vendorId]));
      }
    } catch (error: any) {
      console.error('Error fetching comparison:', error);
      alert(`Error: ${error.response?.data?.error || error.message}`);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const toggleVendor = (vendorId: string) => {
    const newExpanded = new Set(expandedVendors);
    if (newExpanded.has(vendorId)) {
      newExpanded.delete(vendorId);
    } else {
      newExpanded.add(vendorId);
    }
    setExpandedVendors(newExpanded);
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return 'bg-green-600';
    if (score >= 60) return 'bg-yellow-600';
    return 'bg-red-600';
  };

    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-gray-700 font-medium">Loading comparison...</div>
        </div>
      );
    }

    if (!comparison || !rfp) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-gray-700 font-medium">No comparison data available</div>
        </div>
      );
    }

  const evaluations = comparison.evaluations || [];

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-6 border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h1 className="text-2xl font-bold mb-2 text-gray-900">Proposal Comparison & Evaluation</h1>
            <p className="text-gray-800 font-medium">{rfp.title}</p>
          </div>
          <div className="flex items-center gap-3">
            {isCached && (
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                Cached
              </span>
            )}
            <button
              onClick={() => fetchComparison(true)}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Refresh comparison (regenerate with LLM)"
            >
              <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 space-y-6">
        {/* Summary */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h2 className="font-bold mb-2 flex items-center gap-2 text-gray-900">
            <TrendingUp size={20} />
            Summary
          </h2>
          <p className="text-gray-800 font-medium whitespace-pre-wrap">{comparison.summary}</p>
        </div>

        {/* Recommendation */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h2 className="font-bold mb-2 flex items-center gap-2 text-gray-900">
            <CheckCircle size={20} />
            AI Recommendation
          </h2>
          <p className="text-lg font-bold text-green-800 mb-2">
            {comparison.recommendation === 'needs_more_info'
              ? 'More Information Needed'
              : `Recommended: ${comparison.recommendation}`}
          </p>
          <p className="text-gray-800 font-medium whitespace-pre-wrap mb-3">{comparison.reasoning}</p>
          {comparison.ranking && (
            <div className="mt-3 pt-3 border-t border-green-300">
              <h3 className="font-bold text-sm mb-2 text-gray-900">Vendor Ranking:</h3>
              <ol className="list-decimal list-inside space-y-1 text-sm">
                {comparison.ranking.map((item: any, idx: number) => (
                  <li key={idx} className="text-gray-800 font-medium">
                    <span className="font-semibold">{item.vendorName}</span>: <span className="font-normal">{item.justification}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {/* Concerns */}
        {comparison.concerns && comparison.concerns.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h2 className="font-bold mb-2 flex items-center gap-2 text-gray-900">
              <AlertCircle size={20} />
              Concerns
            </h2>
            <ul className="list-disc list-inside space-y-1 text-gray-800 font-medium">
              {comparison.concerns.map((concern: string, idx: number) => (
                <li key={idx}>{concern}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Negotiation Points */}
        {comparison.negotiationPoints && comparison.negotiationPoints.length > 0 && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <h2 className="font-bold mb-2 flex items-center gap-2 text-gray-900">
              <Award size={20} />
              Negotiation Points & Clarifications
            </h2>
            <ul className="list-disc list-inside space-y-1 text-gray-800 font-medium">
              {comparison.negotiationPoints.map((point: string, idx: number) => (
                <li key={idx}>{point}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Overall Scores */}
        {comparison.scores && (
          <div>
            <h2 className="text-lg font-bold mb-4 text-gray-900">Overall Scores</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(comparison.scores)
                .sort(([, a]: [string, any], [, b]: [string, any]) => b - a)
                .map(([vendorName, score]: [string, any]) => (
                  <div key={vendorName} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="font-bold text-gray-900">{vendorName}</h3>
                      <span className={`text-2xl font-bold ${getScoreColor(score)}`}>
                        {score}/100
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div
                        className={`${getScoreBgColor(score)} h-3 rounded-full transition-all duration-300`}
                        style={{ width: `${score}%` }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Detailed Evaluations */}
        {evaluations.length > 0 && (
          <div>
            <h2 className="text-lg font-bold mb-4 text-gray-900">Detailed Evaluation</h2>
            <div className="space-y-4">
              {evaluations.map((evaluation: any) => {
                const proposal = rfp.proposals.find((p: any) => p.vendor.id === evaluation.vendorId);
                const isExpanded = expandedVendors.has(evaluation.vendorId);
                const criteria = evaluation.criteria || {};

                return (
                  <div key={evaluation.vendorId} className="border border-gray-200 rounded-lg overflow-hidden">
                    {/* Header */}
                    <div
                      className="bg-gray-50 p-4 cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => toggleVendor(evaluation.vendorId)}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronUp size={20} className="text-gray-500" />
                          ) : (
                            <ChevronDown size={20} className="text-gray-500" />
                          )}
                          <div>
                            <h3 className="font-bold text-lg text-gray-900">{evaluation.vendorName}</h3>
                            <div className="text-sm text-gray-800 font-medium">
                              {proposal?.totalPrice && `Price: $${proposal.totalPrice.toLocaleString()}`}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className={`text-2xl font-bold ${getScoreColor(evaluation.overallScore)}`}>
                              {evaluation.overallScore}/100
                            </div>
                            <div className="text-xs text-gray-700 font-medium">Overall Score</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className="p-4 bg-white space-y-4">
                        {/* Strengths & Weaknesses */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {evaluation.strengths && evaluation.strengths.length > 0 && (
                            <div className="bg-green-50 border border-green-200 rounded p-3">
                              <h4 className="font-semibold text-green-800 mb-2 flex items-center gap-2">
                                <CheckCircle size={16} />
                                Strengths
                              </h4>
                              <ul className="list-disc list-inside space-y-1 text-sm text-green-700">
                                {evaluation.strengths.map((strength: string, idx: number) => (
                                  <li key={idx}>{strength}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {evaluation.weaknesses && evaluation.weaknesses.length > 0 && (
                            <div className="bg-red-50 border border-red-200 rounded p-3">
                              <h4 className="font-semibold text-red-800 mb-2 flex items-center gap-2">
                                <X size={16} />
                                Weaknesses
                              </h4>
                              <ul className="list-disc list-inside space-y-1 text-sm text-red-700">
                                {evaluation.weaknesses.map((weakness: string, idx: number) => (
                                  <li key={idx}>{weakness}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>

                        {/* Scoring Criteria */}
                        <div>
                          <h4 className="font-bold mb-3 text-gray-900">Evaluation Criteria</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {/* Price */}
                            <div className="border border-gray-200 rounded p-3">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-sm font-semibold text-gray-900">Price</span>
                                <span className={`text-sm font-bold ${getScoreColor(criteria.price?.score || 0)}`}>
                                  {criteria.price?.score || 0}/100
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                                <div
                                  className={`${getScoreBgColor(criteria.price?.score || 0)} h-2 rounded-full`}
                                  style={{ width: `${criteria.price?.score || 0}%` }}
                                />
                              </div>
                              <p className="text-xs text-gray-800 font-medium">{criteria.price?.reasoning}</p>
                            </div>

                            {/* Delivery */}
                            <div className="border border-gray-200 rounded p-3">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-sm font-semibold text-gray-900">Delivery</span>
                                <span className={`text-sm font-bold ${getScoreColor(criteria.delivery?.score || 0)}`}>
                                  {criteria.delivery?.score || 0}/100
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                                <div
                                  className={`${getScoreBgColor(criteria.delivery?.score || 0)} h-2 rounded-full`}
                                  style={{ width: `${criteria.delivery?.score || 0}%` }}
                                />
                              </div>
                              <p className="text-xs text-gray-800 font-medium">{criteria.delivery?.reasoning}</p>
                            </div>

                            {/* Requirements */}
                            <div className="border border-gray-200 rounded p-3">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-sm font-semibold text-gray-900">Requirements Match</span>
                                <span className={`text-sm font-bold ${getScoreColor(criteria.requirements?.score || 0)}`}>
                                  {criteria.requirements?.score || 0}/100
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                                <div
                                  className={`${getScoreBgColor(criteria.requirements?.score || 0)} h-2 rounded-full`}
                                  style={{ width: `${criteria.requirements?.score || 0}%` }}
                                />
                              </div>
                              <p className="text-xs text-gray-800 font-medium">
                                {criteria.requirements?.itemsMatched || 0}/{criteria.requirements?.itemsTotal || 0} items matched
                              </p>
                            </div>

                            {/* Payment Terms */}
                            <div className="border border-gray-200 rounded p-3">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-sm font-semibold text-gray-900">Payment Terms</span>
                                <span className={`text-sm font-bold ${getScoreColor(criteria.paymentTerms?.score || 0)}`}>
                                  {criteria.paymentTerms?.score || 0}/100
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                                <div
                                  className={`${getScoreBgColor(criteria.paymentTerms?.score || 0)} h-2 rounded-full`}
                                  style={{ width: `${criteria.paymentTerms?.score || 0}%` }}
                                />
                              </div>
                              <p className="text-xs text-gray-800 font-medium">{criteria.paymentTerms?.reasoning}</p>
                            </div>

                            {/* Warranty */}
                            <div className="border border-gray-200 rounded p-3">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-sm font-semibold text-gray-900">Warranty</span>
                                <span className={`text-sm font-bold ${getScoreColor(criteria.warranty?.score || 0)}`}>
                                  {criteria.warranty?.score || 0}/100
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                                <div
                                  className={`${getScoreBgColor(criteria.warranty?.score || 0)} h-2 rounded-full`}
                                  style={{ width: `${criteria.warranty?.score || 0}%` }}
                                />
                              </div>
                              <p className="text-xs text-gray-800 font-medium">{criteria.warranty?.reasoning}</p>
                            </div>

                            {/* Completeness */}
                            <div className="border border-gray-200 rounded p-3">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-sm font-semibold text-gray-900">Completeness</span>
                                <span className={`text-sm font-bold ${getScoreColor(criteria.completeness?.score || 0)}`}>
                                  {criteria.completeness?.score || 0}/100
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                                <div
                                  className={`${getScoreBgColor(criteria.completeness?.score || 0)} h-2 rounded-full`}
                                  style={{ width: `${criteria.completeness?.score || 0}%` }}
                                />
                              </div>
                              <p className="text-xs text-gray-800 font-medium">{criteria.completeness?.reasoning}</p>
                            </div>
                          </div>
                        </div>

                        {/* Requirement Item Breakdown */}
                        {criteria.requirements?.itemBreakdown && criteria.requirements.itemBreakdown.length > 0 && (
                          <div>
                            <h4 className="font-bold mb-3 text-gray-900">Requirement Item Matching</h4>
                            <div className="space-y-2">
                              {criteria.requirements.itemBreakdown.map((item: any, idx: number) => (
                                <div
                                  key={idx}
                                  className={`border rounded p-3 ${
                                    item.matchesQuantity && item.specificationsMatch
                                      ? 'border-green-200 bg-green-50'
                                      : 'border-yellow-200 bg-yellow-50'
                                  }`}
                                >
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <div className="font-semibold text-gray-900">{item.itemName}</div>
                                      {item.requiredQuantity && (
                                        <div className="text-sm text-gray-800 font-medium">
                                          Required: {item.requiredQuantity}
                                          {item.proposedQuantity !== undefined && (
                                            <> | Proposed: {item.proposedQuantity}</>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {item.matchesQuantity && item.specificationsMatch ? (
                                        <CheckCircle size={20} className="text-green-600" />
                                      ) : (
                                        <X size={20} className="text-yellow-600" />
                                      )}
                                    </div>
                                  </div>
                                  <p className="text-xs text-gray-800 font-medium mt-1">{item.reasoning}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Concerns */}
                        {evaluation.concerns && evaluation.concerns.length > 0 && (
                          <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                            <h4 className="font-semibold text-yellow-800 mb-2 flex items-center gap-2">
                              <AlertCircle size={16} />
                              Concerns
                            </h4>
                            <ul className="list-disc list-inside space-y-1 text-sm text-yellow-700">
                              {evaluation.concerns.map((concern: string, idx: number) => (
                                <li key={idx}>{concern}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Proposal Details */}
                        <div className="border-t border-gray-200 pt-4">
                          <h4 className="font-bold mb-3 text-gray-900">Proposal Details</h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            {proposal?.totalPrice && (
                              <div>
                                <div className="text-gray-700 font-semibold">Price</div>
                                <div className="font-bold text-gray-900">${proposal.totalPrice.toLocaleString()}</div>
                              </div>
                            )}
                            {proposal?.deliveryDays && (
                              <div>
                                <div className="text-gray-700 font-semibold">Delivery</div>
                                <div className="font-bold text-gray-900">{proposal.deliveryDays} days</div>
                              </div>
                            )}
                            {proposal?.paymentTerms && (
                              <div>
                                <div className="text-gray-700 font-semibold">Payment Terms</div>
                                <div className="font-bold text-gray-900">{proposal.paymentTerms}</div>
                              </div>
                            )}
                            {proposal?.warranty && (
                              <div>
                                <div className="text-gray-700 font-semibold">Warranty</div>
                                <div className="font-bold text-gray-900">{proposal.warranty}</div>
                              </div>
                            )}
                          </div>
                          {proposal?.notes && (
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <div className="text-sm text-gray-800 font-medium whitespace-pre-wrap">
                                {proposal.notes}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <button
          onClick={() => onViewChange('rfp', rfpId)}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
        >
          Back to RFP
        </button>
      </div>
    </div>
  );
}
