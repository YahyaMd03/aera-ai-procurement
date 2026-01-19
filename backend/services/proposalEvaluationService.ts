/**
 * Service for evaluating and scoring proposals against RFP requirements
 */

interface RequirementItem {
  name: string;
  quantity?: number;
  specifications?: string;
}

interface RFPRequirements {
  items?: RequirementItem[];
  deliveryDays?: number | null;
  paymentTerms?: string | null;
  warranty?: string | null;
  otherRequirements?: string[];
}

interface ProposalData {
  totalPrice?: number | null;
  itemPrices?: Array<{
    item: string;
    price: number;
    quantity?: number;
  }>;
  deliveryDays?: number | null;
  paymentTerms?: string | null;
  warranty?: string | null;
  notes?: string | null;
  completeness?: number;
  rawEmail?: string | null;
  parsedData?: any;
}

interface EvaluationCriteria {
  price: {
    score: number; // 0-100
    matchesBudget: boolean;
    deviation: number; // percentage from budget
    reasoning: string;
  };
  delivery: {
    score: number; // 0-100
    meetsDeadline: boolean;
    daysDifference?: number;
    reasoning: string;
  };
  requirements: {
    score: number; // 0-100
    itemsMatched: number;
    itemsTotal: number;
    itemBreakdown: Array<{
      itemName: string;
      requiredQuantity?: number;
      proposedQuantity?: number;
      matchesQuantity: boolean;
      specificationsMatch: boolean;
      reasoning: string;
    }>;
    reasoning: string;
  };
  paymentTerms: {
    score: number; // 0-100
    matches: boolean;
    reasoning: string;
  };
  warranty: {
    score: number; // 0-100
    meetsRequirement: boolean;
    reasoning: string;
  };
  completeness: {
    score: number; // 0-100
    reasoning: string;
  };
  otherRequirements: {
    score: number; // 0-100
    matches: number;
    total: number;
    missing: string[];
    reasoning: string;
  };
}

export interface ProposalEvaluation {
  vendorId: string;
  vendorName: string;
  overallScore: number; // 0-100, weighted average
  criteria: EvaluationCriteria;
  strengths: string[];
  weaknesses: string[];
  concerns: string[];
}

/**
 * Calculate price score based on budget compliance
 */
function evaluatePrice(
  proposalPrice: number | null | undefined,
  budget: number | null | undefined
): EvaluationCriteria['price'] {
  if (!proposalPrice) {
    return {
      score: 0,
      matchesBudget: false,
      deviation: 0,
      reasoning: 'Price not specified in proposal',
    };
  }

  if (!budget) {
    // No budget specified, score based on completeness
    return {
      score: 80, // Neutral score when no budget constraint
      matchesBudget: true,
      deviation: 0,
      reasoning: 'No budget specified in RFP. Price provided.',
    };
  }

  const deviation = ((proposalPrice - budget) / budget) * 100;
  const absDeviation = Math.abs(deviation);

  let score: number;
  
  if (deviation < 0) {
    // UNDER BUDGET - Generally positive, but too low might indicate issues
    if (absDeviation <= 5) {
      score = 100; // Perfect: saves money, within 5%
    } else if (absDeviation <= 10) {
      score = 95; // Excellent: saves money, 5-10% under
    } else if (absDeviation <= 20) {
      score = 85; // Good: significant savings, 10-20% under
    } else if (absDeviation <= 30) {
      score = 75; // Acceptable: very low price, 20-30% under (might raise quality concerns)
    } else if (absDeviation <= 50) {
      score = 60; // Low: extremely low price, 30-50% under (potential red flag)
    } else {
      score = Math.max(30, 70 - absDeviation * 0.5); // Very low: >50% under (likely misunderstanding or quality issue)
    }
  } else {
    // OVER BUDGET - Generally negative, penalize more heavily
    if (absDeviation <= 5) {
      score = 95; // Acceptable: slightly over, within 5%
    } else if (absDeviation <= 10) {
      score = 85; // Moderate: 5-10% over budget
    } else if (absDeviation <= 20) {
      score = 70; // Significant: 10-20% over budget
    } else if (absDeviation <= 30) {
      score = 50; // High: 20-30% over budget
    } else if (absDeviation <= 50) {
      score = 30; // Very high: 30-50% over budget
    } else {
      score = Math.max(0, 40 - absDeviation * 0.3); // Unacceptable: >50% over budget
    }
  }

  return {
    score: Math.round(score),
    matchesBudget: deviation <= 10, // Consider within 10% as "matching"
    deviation: Math.round(deviation * 100) / 100,
    reasoning: deviation > 0
      ? `Price is ${Math.abs(deviation).toFixed(1)}% over budget`
      : `Price is ${Math.abs(deviation).toFixed(1)}% under budget`,
  };
}

/**
 * Evaluate delivery timeline against RFP requirement
 */
function evaluateDelivery(
  proposalDeliveryDays: number | null | undefined,
  requiredDeliveryDays: number | null | undefined
): EvaluationCriteria['delivery'] {
  if (!proposalDeliveryDays) {
    return {
      score: 0,
      meetsDeadline: false,
      reasoning: 'Delivery timeline not specified',
    };
  }

  if (!requiredDeliveryDays) {
    return {
      score: 80,
      meetsDeadline: true,
      reasoning: 'No delivery requirement specified. Timeline provided.',
    };
  }

  const daysDifference = proposalDeliveryDays - requiredDeliveryDays;
  const meetsDeadline = daysDifference <= 0;

  let score: number;
  if (daysDifference <= 0) {
    // On time or earlier
    score = 100 - Math.abs(daysDifference) * 2; // Bonus for early delivery, max 100
    score = Math.max(90, Math.min(100, score));
  } else if (daysDifference <= 7) {
    score = 75; // Up to 1 week late
  } else if (daysDifference <= 14) {
    score = 60; // Up to 2 weeks late
  } else if (daysDifference <= 30) {
    score = 40; // Up to 1 month late
  } else {
    score = Math.max(0, 30 - daysDifference / 10); // Decrease further
  }

  return {
    score: Math.round(score),
    meetsDeadline,
    daysDifference,
    reasoning: meetsDeadline
      ? `Meets deadline${daysDifference < 0 ? ` (${Math.abs(daysDifference)} days early)` : ''}`
      : `Exceeds deadline by ${daysDifference} days`,
  };
}

/**
 * Match proposal items against RFP requirements
 */
function matchItems(
  rfpItems: RequirementItem[],
  proposalItemPrices: Array<{ item: string; price: number; quantity?: number }> | undefined,
  proposalNotes: string | null | undefined,
  rawEmail: string | null | undefined
): EvaluationCriteria['requirements'] {
  if (!rfpItems || rfpItems.length === 0) {
    return {
      score: 100,
      itemsMatched: 0,
      itemsTotal: 0,
      itemBreakdown: [],
      reasoning: 'No specific items required',
    };
  }

  const itemBreakdown: EvaluationCriteria['requirements']['itemBreakdown'] = [];
  let itemsMatched = 0;

  // Create a searchable text from proposal for fuzzy matching
  const proposalText = [
    ...(proposalItemPrices?.map(ip => `${ip.item} ${ip.quantity || ''}`).join(' ') || ''),
    proposalNotes || '',
    rawEmail || '',
  ].join(' ').toLowerCase();

  for (const rfpItem of rfpItems) {
    const itemNameLower = rfpItem.name.toLowerCase();
    let matchesQuantity = false;
    let specificationsMatch = false;
    let proposedQuantity: number | undefined;

    // Try to find matching item in proposal
    const matchingProposalItem = proposalItemPrices?.find(
      ip => ip.item.toLowerCase().includes(itemNameLower) ||
            itemNameLower.includes(ip.item.toLowerCase())
    );

    if (matchingProposalItem) {
      proposedQuantity = matchingProposalItem.quantity;
      matchesQuantity = rfpItem.quantity
        ? matchingProposalItem.quantity === rfpItem.quantity
        : true; // If no quantity specified in RFP, any quantity matches
    } else {
      // Fuzzy match: check if item name appears in proposal text
      const fuzzyMatch = proposalText.includes(itemNameLower);
      matchesQuantity = !rfpItem.quantity || fuzzyMatch; // If found in text, assume quantity matches if not specified
    }

    // Check specifications match (basic check - can be enhanced with AI)
    if (rfpItem.specifications) {
      const specKeywords = rfpItem.specifications.toLowerCase().split(/\s+/);
      const specMatch = specKeywords.some(keyword => 
        proposalText.includes(keyword) && keyword.length > 3 // Only check meaningful keywords
      );
      specificationsMatch = specMatch;
    } else {
      specificationsMatch = true; // No specs to match
    }

    const itemMatch = matchingProposalItem || proposalText.includes(itemNameLower);
    if (itemMatch && (matchesQuantity || !rfpItem.quantity) && (specificationsMatch || !rfpItem.specifications)) {
      itemsMatched++;
    }

    itemBreakdown.push({
      itemName: rfpItem.name,
      requiredQuantity: rfpItem.quantity,
      proposedQuantity,
      matchesQuantity,
      specificationsMatch,
      reasoning: !itemMatch
        ? 'Item not found in proposal'
        : !matchesQuantity && rfpItem.quantity
        ? `Quantity mismatch (required: ${rfpItem.quantity}, proposed: ${proposedQuantity || 'N/A'})`
        : !specificationsMatch && rfpItem.specifications
        ? 'Specifications may not match'
        : 'Item matches requirements',
    });
  }

  const matchPercentage = (itemsMatched / rfpItems.length) * 100;
  const score = Math.round(matchPercentage);

  return {
    score,
    itemsMatched,
    itemsTotal: rfpItems.length,
    itemBreakdown,
    reasoning: `${itemsMatched} of ${rfpItems.length} required items matched`,
  };
}

/**
 * Evaluate payment terms alignment
 */
function evaluatePaymentTerms(
  proposalTerms: string | null | undefined,
  requiredTerms: string | null | undefined
): EvaluationCriteria['paymentTerms'] {
  if (!proposalTerms) {
    return {
      score: 50,
      matches: false,
      reasoning: 'Payment terms not specified',
    };
  }

  if (!requiredTerms) {
    return {
      score: 80,
      matches: true,
      reasoning: 'No payment terms requirement. Terms provided.',
    };
  }

  // Simple keyword matching (can be enhanced with AI)
  const proposalLower = proposalTerms.toLowerCase();
  const requiredLower = requiredTerms.toLowerCase();

  // Check for common payment terms
  const keywords = ['net', 'days', '30', '60', '90', 'advance', 'upon delivery', 'installment'];
  const proposalKeywords = keywords.filter(k => proposalLower.includes(k));
  const requiredKeywords = keywords.filter(k => requiredLower.includes(k));

  const matches = requiredKeywords.length > 0 
    ? requiredKeywords.some(k => proposalKeywords.includes(k))
    : proposalLower.includes(requiredLower) || requiredLower.includes(proposalLower);

  return {
    score: matches ? 100 : 60,
    matches,
    reasoning: matches
      ? 'Payment terms align with requirements'
      : 'Payment terms may not align with requirements',
  };
}

/**
 * Evaluate warranty compliance
 */
function evaluateWarranty(
  proposalWarranty: string | null | undefined,
  requiredWarranty: string | null | undefined
): EvaluationCriteria['warranty'] {
  if (!proposalWarranty) {
    return {
      score: 50,
      meetsRequirement: false,
      reasoning: 'Warranty not specified',
    };
  }

  if (!requiredWarranty) {
    return {
      score: 80,
      meetsRequirement: true,
      reasoning: 'No warranty requirement. Warranty provided.',
    };
  }

  // Extract numbers (years/months) from warranty strings
  const proposalMatch = proposalWarranty.match(/(\d+)/);
  const requiredMatch = requiredWarranty.match(/(\d+)/);

  if (proposalMatch && requiredMatch) {
    const proposalValue = parseInt(proposalMatch[1]);
    const requiredValue = parseInt(requiredMatch[1]);
    const meetsRequirement = proposalValue >= requiredValue;

    return {
      score: meetsRequirement ? 100 : 50,
      meetsRequirement,
      reasoning: meetsRequirement
        ? `Warranty (${proposalWarranty}) meets or exceeds requirement (${requiredWarranty})`
        : `Warranty (${proposalWarranty}) may not meet requirement (${requiredWarranty})`,
    };
  }

  // Fallback to string matching
  const matches = proposalWarranty.toLowerCase().includes(requiredWarranty.toLowerCase()) ||
                  requiredWarranty.toLowerCase().includes(proposalWarranty.toLowerCase());

  return {
    score: matches ? 100 : 60,
    meetsRequirement: matches,
    reasoning: matches
      ? 'Warranty aligns with requirements'
      : 'Warranty may not align with requirements',
  };
}

/**
 * Evaluate proposal completeness
 */
function evaluateCompleteness(
  completeness: number | null | undefined
): EvaluationCriteria['completeness'] {
  if (completeness === null || completeness === undefined) {
    return {
      score: 50,
      reasoning: 'Completeness score not available',
    };
  }

  const score = Math.round(completeness * 100);

  return {
    score,
    reasoning: score >= 80
      ? 'Proposal is comprehensive and complete'
      : score >= 60
      ? 'Proposal is reasonably complete but may lack some details'
      : 'Proposal is incomplete and may require clarification',
  };
}

/**
 * Evaluate other requirements
 */
function evaluateOtherRequirements(
  proposalNotes: string | null | undefined,
  rawEmail: string | null | undefined,
  otherRequirements: string[] | undefined
): EvaluationCriteria['otherRequirements'] {
  if (!otherRequirements || otherRequirements.length === 0) {
    return {
      score: 100,
      matches: 0,
      total: 0,
      missing: [],
      reasoning: 'No other requirements specified',
    };
  }

  const proposalText = [
    proposalNotes || '',
    rawEmail || '',
  ].join(' ').toLowerCase();

  let matches = 0;
  const missing: string[] = [];

  for (const requirement of otherRequirements) {
    // Simple keyword matching
    const keywords = requirement.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const match = keywords.some(keyword => proposalText.includes(keyword));

    if (match) {
      matches++;
    } else {
      missing.push(requirement);
    }
  }

  const matchPercentage = (matches / otherRequirements.length) * 100;
  const score = Math.round(matchPercentage);

  return {
    score,
    matches,
    total: otherRequirements.length,
    missing,
    reasoning: `${matches} of ${otherRequirements.length} other requirements addressed`,
  };
}

/**
 * Calculate overall weighted score
 */
function calculateOverallScore(criteria: EvaluationCriteria): number {
  const weights = {
    price: 0.25,
    delivery: 0.20,
    requirements: 0.30,
    paymentTerms: 0.05,
    warranty: 0.10,
    completeness: 0.05,
    otherRequirements: 0.05,
  };

  const weightedSum =
    criteria.price.score * weights.price +
    criteria.delivery.score * weights.delivery +
    criteria.requirements.score * weights.requirements +
    criteria.paymentTerms.score * weights.paymentTerms +
    criteria.warranty.score * weights.warranty +
    criteria.completeness.score * weights.completeness +
    criteria.otherRequirements.score * weights.otherRequirements;

  return Math.round(weightedSum);
}

/**
 * Generate strengths and weaknesses from evaluation
 */
function generateFeedback(evaluation: ProposalEvaluation): {
  strengths: string[];
  weaknesses: string[];
  concerns: string[];
} {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const concerns: string[] = [];

  // Price feedback
  if (evaluation.criteria.price.score >= 90) {
    strengths.push('Excellent price competitiveness');
  } else if (evaluation.criteria.price.score < 60) {
    weaknesses.push(`Price significantly ${evaluation.criteria.price.deviation > 0 ? 'over' : 'under'} budget`);
    if (Math.abs(evaluation.criteria.price.deviation) > 30) {
      concerns.push('Price deviation may be a concern');
    }
  }

  // Delivery feedback
  if (evaluation.criteria.delivery.score >= 90) {
    strengths.push('Delivery timeline meets or exceeds requirements');
  } else if (evaluation.criteria.delivery.score < 60) {
    weaknesses.push('Delivery timeline may not meet requirements');
    if (evaluation.criteria.delivery.daysDifference && evaluation.criteria.delivery.daysDifference > 14) {
      concerns.push('Significant delivery delay');
    }
  }

  // Requirements feedback
  if (evaluation.criteria.requirements.score >= 90) {
    strengths.push('All required items are addressed');
  } else if (evaluation.criteria.requirements.score < 70) {
    const missingItems = evaluation.criteria.requirements.itemsTotal - evaluation.criteria.requirements.itemsMatched;
    weaknesses.push(`${missingItems} required item(s) not properly addressed`);
    concerns.push('Missing required items may disqualify this proposal');
  }

  // Payment terms feedback
  if (evaluation.criteria.paymentTerms.score === 100) {
    strengths.push('Payment terms align with requirements');
  } else if (!evaluation.criteria.paymentTerms.matches) {
    weaknesses.push('Payment terms may not align with requirements');
  }

  // Warranty feedback
  if (evaluation.criteria.warranty.score === 100) {
    strengths.push('Warranty meets or exceeds requirements');
  } else if (!evaluation.criteria.warranty.meetsRequirement) {
    weaknesses.push('Warranty may not meet requirements');
  }

  // Completeness feedback
  if (evaluation.criteria.completeness.score >= 80) {
    strengths.push('Comprehensive and detailed proposal');
  } else if (evaluation.criteria.completeness.score < 60) {
    weaknesses.push('Proposal may lack important details');
    concerns.push('Incomplete proposal may require clarification');
  }

  // Other requirements feedback
  if (evaluation.criteria.otherRequirements.missing.length > 0) {
    weaknesses.push(`${evaluation.criteria.otherRequirements.missing.length} other requirement(s) not addressed`);
  }

  return { strengths, weaknesses, concerns };
}

/**
 * Evaluate a single proposal against RFP requirements
 */
export function evaluateProposal(
  proposal: {
    id: string;
    vendor: { id: string; name: string };
    totalPrice?: number | null;
    deliveryDays?: number | null;
    paymentTerms?: string | null;
    warranty?: string | null;
    notes?: string | null;
    completeness?: number | null;
    rawEmail?: string | null;
    parsedData?: any;
  },
  rfp: {
    budget?: number | null;
    requirements: RFPRequirements;
  }
): ProposalEvaluation {
  // Handle data stored in both top-level fields and parsedData
  const parsedData = proposal.parsedData || {};
  const proposalData: ProposalData = {
    totalPrice: proposal.totalPrice ?? parsedData.totalPrice,
    itemPrices: parsedData.itemPrices,
    deliveryDays: proposal.deliveryDays ?? parsedData.deliveryDays,
    paymentTerms: proposal.paymentTerms ?? parsedData.paymentTerms,
    warranty: proposal.warranty ?? parsedData.warranty,
    notes: proposal.notes ?? parsedData.notes,
    completeness: proposal.completeness ?? parsedData.completeness,
    rawEmail: proposal.rawEmail,
    parsedData: parsedData,
  };

  const criteria: EvaluationCriteria = {
    price: evaluatePrice(proposalData.totalPrice, rfp.budget),
    delivery: evaluateDelivery(proposalData.deliveryDays, rfp.requirements.deliveryDays || undefined),
    requirements: matchItems(
      rfp.requirements.items || [],
      proposalData.itemPrices,
      proposalData.notes,
      proposalData.rawEmail
    ),
    paymentTerms: evaluatePaymentTerms(proposalData.paymentTerms, rfp.requirements.paymentTerms || undefined),
    warranty: evaluateWarranty(proposalData.warranty, rfp.requirements.warranty || undefined),
    completeness: evaluateCompleteness(proposalData.completeness),
    otherRequirements: evaluateOtherRequirements(
      proposalData.notes,
      proposalData.rawEmail,
      rfp.requirements.otherRequirements
    ),
  };

  const overallScore = calculateOverallScore(criteria);

  const evaluation: ProposalEvaluation = {
    vendorId: proposal.vendor.id,
    vendorName: proposal.vendor.name,
    overallScore,
    criteria,
    strengths: [],
    weaknesses: [],
    concerns: [],
  };

  const feedback = generateFeedback(evaluation);
  evaluation.strengths = feedback.strengths;
  evaluation.weaknesses = feedback.weaknesses;
  evaluation.concerns = feedback.concerns;

  return evaluation;
}

/**
 * Evaluate multiple proposals and return sorted by score
 */
export function evaluateProposals(
  proposals: Array<{
    id: string;
    vendor: { id: string; name: string };
    totalPrice?: number | null;
    deliveryDays?: number | null;
    paymentTerms?: string | null;
    warranty?: string | null;
    notes?: string | null;
    completeness?: number | null;
    rawEmail?: string | null;
    parsedData?: any;
  }>,
  rfp: {
    budget?: number | null;
    requirements: RFPRequirements;
  }
): ProposalEvaluation[] {
  const evaluations = proposals.map(proposal => evaluateProposal(proposal, rfp));
  
  // Sort by overall score (descending)
  return evaluations.sort((a, b) => b.overallScore - a.overallScore);
}
