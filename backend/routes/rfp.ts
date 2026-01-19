import express, { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../src/db/index.js';
import { rfpsTable } from '../src/db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { validateRFP, validateUUID, handleValidationErrors, sanitizeString } from '../src/middleware/validation.js';

const router = express.Router();

// Get all RFPs with pagination
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100); // Default 50, max 100
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    
    const rfps = await db.query.rfpsTable.findMany({
      orderBy: [desc(rfpsTable.createdAt)],
      limit,
      offset,
      with: {
        proposals: {
          with: {
            vendor: true,
          },
        },
      },
    });
    res.json(rfps);
  } catch (error) {
    next(error);
  }
});

// Get single RFP
router.get('/:id', validateUUID, handleValidationErrors, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rfp = await db.query.rfpsTable.findFirst({
      where: eq(rfpsTable.id, req.params.id),
      with: {
        proposals: {
          with: {
            vendor: true,
          },
        },
      },
    });

    if (!rfp) {
      return res.status(404).json({ error: 'RFP not found' });
    }

    res.json(rfp);
  } catch (error) {
    next(error);
  }
});

// Create RFP
router.post('/', validateRFP, handleValidationErrors, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, description, budget, deadline, requirements, status } = req.body;

    const now = new Date();
    const [rfp] = await db.insert(rfpsTable).values({
      id: randomUUID(),
      title: sanitizeString(title) || '',
      description: sanitizeString(description) || '',
      budget: budget ? parseFloat(budget) : null,
      deadline: deadline ? new Date(deadline) : null,
      requirements: requirements || {},
      status: status || 'draft',
      createdAt: now,
      updatedAt: now,
    }).returning();

    res.status(201).json(rfp);
  } catch (error) {
    next(error);
  }
});

// Update RFP
router.put('/:id', validateUUID, validateRFP, handleValidationErrors, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, description, budget, deadline, requirements, status } = req.body;

    const updateData: any = {};
    if (title) updateData.title = sanitizeString(title);
    if (description) updateData.description = sanitizeString(description);
    if (budget !== undefined) updateData.budget = budget ? parseFloat(budget) : null;
    if (deadline !== undefined) updateData.deadline = deadline ? new Date(deadline) : null;
    if (requirements) updateData.requirements = requirements;
    if (status) updateData.status = status;
    updateData.updatedAt = new Date();

    // Invalidate comparison cache if requirements or budget changed
    if (requirements || budget !== undefined) {
      updateData.comparisonCache = null;
      updateData.comparisonCacheUpdatedAt = null;
    }

    const [rfp] = await db.update(rfpsTable)
      .set(updateData)
      .where(eq(rfpsTable.id, req.params.id))
      .returning();

    res.json(rfp);
  } catch (error) {
    next(error);
  }
});

// Delete RFP
router.delete('/:id', validateUUID, handleValidationErrors, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await db.delete(rfpsTable).where(eq(rfpsTable.id, req.params.id));

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
