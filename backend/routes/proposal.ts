import express, { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../src/db/index.js';
import { proposalsTable, rfpsTable } from '../src/db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { evaluateProposal } from '../services/proposalEvaluationService.js';

const router = express.Router();

// Get all proposals with pagination
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rfpId } = req.query;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100); // Default 50, max 100
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    
    const proposals = await db.query.proposalsTable.findMany({
      where: rfpId ? eq(proposalsTable.rfpId, rfpId as string) : undefined,
      limit,
      offset,
      with: {
        rfp: true,
        vendor: true,
      },
      orderBy: [desc(proposalsTable.createdAt)],
    });
    
    res.json(proposals);
  } catch (error) {
    next(error);
  }
});

// Get single proposal
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const proposal = await db.query.proposalsTable.findFirst({
      where: eq(proposalsTable.id, req.params.id),
      with: {
        rfp: true,
        vendor: true,
      },
    });

    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    res.json(proposal);
  } catch (error) {
    next(error);
  }
});

// Create proposal (usually done automatically via email, but can be manual)
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rfpId, vendorId, parsedData, totalPrice, deliveryDays, paymentTerms, warranty, notes, completeness } = req.body;

    if (!rfpId || !vendorId) {
      return res.status(400).json({ error: 'RFP ID and Vendor ID are required' });
    }

    const now = new Date();
    const [proposal] = await db.insert(proposalsTable).values({
      id: randomUUID(),
      rfpId,
      vendorId,
      parsedData: parsedData || {},
      totalPrice: totalPrice ? parseFloat(totalPrice) : null,
      deliveryDays: deliveryDays ? parseInt(deliveryDays) : null,
      paymentTerms,
      warranty,
      notes,
      completeness: completeness ? parseFloat(completeness) : null,
      createdAt: now,
      updatedAt: now,
    }).returning();

    const proposalWithRelations = await db.query.proposalsTable.findFirst({
      where: eq(proposalsTable.id, proposal.id),
      with: {
        rfp: true,
        vendor: true,
      },
    });

    res.status(201).json(proposalWithRelations);
  } catch (error) {
    next(error);
  }
});

// Update proposal
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { parsedData, totalPrice, deliveryDays, paymentTerms, warranty, notes, completeness } = req.body;

    const updateData: any = {};
    if (parsedData) updateData.parsedData = parsedData;
    if (totalPrice !== undefined) updateData.totalPrice = totalPrice ? parseFloat(totalPrice) : null;
    if (deliveryDays !== undefined) updateData.deliveryDays = deliveryDays ? parseInt(deliveryDays) : null;
    if (paymentTerms !== undefined) updateData.paymentTerms = paymentTerms;
    if (warranty !== undefined) updateData.warranty = warranty;
    if (notes !== undefined) updateData.notes = notes;
    if (completeness !== undefined) updateData.completeness = completeness ? parseFloat(completeness) : null;
    updateData.updatedAt = new Date();

    const [proposal] = await db.update(proposalsTable)
      .set(updateData)
      .where(eq(proposalsTable.id, req.params.id))
      .returning();

    const proposalWithRelations = await db.query.proposalsTable.findFirst({
      where: eq(proposalsTable.id, proposal.id),
      with: {
        rfp: true,
        vendor: true,
      },
    });

    res.json(proposalWithRelations);
  } catch (error) {
    next(error);
  }
});

// Delete proposal
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await db.delete(proposalsTable).where(eq(proposalsTable.id, req.params.id));

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Re-evaluate a proposal (add evaluation data to existing proposals)
router.post('/:id/evaluate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const proposal = await db.query.proposalsTable.findFirst({
      where: eq(proposalsTable.id, req.params.id),
      with: {
        rfp: true,
        vendor: true,
      },
    });

    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    // Evaluate proposal against RFP requirements
    const proposalForEvaluation = {
      id: proposal.id,
      vendor: { id: proposal.vendor.id, name: proposal.vendor.name },
      totalPrice: proposal.totalPrice,
      deliveryDays: proposal.deliveryDays,
      paymentTerms: proposal.paymentTerms,
      warranty: proposal.warranty,
      notes: proposal.notes,
      completeness: proposal.completeness,
      rawEmail: proposal.rawEmail,
      parsedData: proposal.parsedData,
    };

    const evaluation = evaluateProposal(proposalForEvaluation, {
      budget: proposal.rfp.budget,
      requirements: proposal.rfp.requirements as any,
    });

    // Store evaluation in parsedData
    const parsedDataWithEvaluation = {
      ...(proposal.parsedData || {}),
      evaluation: {
        overallScore: evaluation.overallScore,
        criteria: evaluation.criteria,
        strengths: evaluation.strengths,
        weaknesses: evaluation.weaknesses,
        concerns: evaluation.concerns,
      },
    };

    // Update proposal with evaluation
    await db.update(proposalsTable)
      .set({
        parsedData: parsedDataWithEvaluation as any,
        updatedAt: new Date(),
      })
      .where(eq(proposalsTable.id, proposal.id));

    // Fetch updated proposal
    const updatedProposal = await db.query.proposalsTable.findFirst({
      where: eq(proposalsTable.id, req.params.id),
      with: {
        rfp: true,
        vendor: true,
      },
    });

    res.json({
      success: true,
      proposal: updatedProposal,
      evaluation,
      message: `Proposal evaluated successfully. Overall Score: ${evaluation.overallScore}/100`,
    });
  } catch (error) {
    console.error('Error evaluating proposal:', error);
    next(error);
  }
});

// Re-evaluate all proposals for an RFP
router.post('/rfp/:rfpId/evaluate-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rfp = await db.query.rfpsTable.findFirst({
      where: eq(rfpsTable.id, req.params.rfpId),
    });

    if (!rfp) {
      return res.status(404).json({ error: 'RFP not found' });
    }

    const proposals = await db.query.proposalsTable.findMany({
      where: eq(proposalsTable.rfpId, req.params.rfpId),
      with: {
        vendor: true,
      },
    });

    const results = [];

    for (const proposal of proposals) {
      try {
        const proposalForEvaluation = {
          id: proposal.id,
          vendor: { id: proposal.vendor.id, name: proposal.vendor.name },
          totalPrice: proposal.totalPrice,
          deliveryDays: proposal.deliveryDays,
          paymentTerms: proposal.paymentTerms,
          warranty: proposal.warranty,
          notes: proposal.notes,
          completeness: proposal.completeness,
          rawEmail: proposal.rawEmail,
          parsedData: proposal.parsedData,
        };

        const evaluation = evaluateProposal(proposalForEvaluation, {
          budget: rfp.budget,
          requirements: rfp.requirements as any,
        });

        const parsedDataWithEvaluation = {
          ...(proposal.parsedData || {}),
          evaluation: {
            overallScore: evaluation.overallScore,
            criteria: evaluation.criteria,
            strengths: evaluation.strengths,
            weaknesses: evaluation.weaknesses,
            concerns: evaluation.concerns,
          },
        };

        await db.update(proposalsTable)
          .set({
            parsedData: parsedDataWithEvaluation as any,
            updatedAt: new Date(),
          })
          .where(eq(proposalsTable.id, proposal.id));

        results.push({
          proposalId: proposal.id,
          vendorName: proposal.vendor.name,
          score: evaluation.overallScore,
          success: true,
        });
      } catch (error) {
        results.push({
          proposalId: proposal.id,
          vendorName: proposal.vendor.name,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    res.json({
      success: true,
      evaluated: results.filter(r => r.success).length,
      total: results.length,
      results,
    });
  } catch (error) {
    console.error('Error evaluating proposals:', error);
    next(error);
  }
});

export default router;
