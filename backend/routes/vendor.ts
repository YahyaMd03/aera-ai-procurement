import express, { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../src/db/index.js';
import { vendorsTable, proposalsTable, rfpsTable } from '../src/db/schema.js';
import { eq, asc } from 'drizzle-orm';
import { validateVendor, validateUUID, handleValidationErrors, sanitizeString } from '../src/middleware/validation.js';

const router = express.Router();

// Get all vendors with pagination
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100); // Default 50, max 100
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    
    const vendors = await db.query.vendorsTable.findMany({
      orderBy: [asc(vendorsTable.name)],
      limit,
      offset,
      with: {
        proposals: {
          with: {
            rfp: true,
          },
        },
      },
    });
    res.json(vendors);
  } catch (error) {
    next(error);
  }
});

// Get single vendor
router.get('/:id', validateUUID, handleValidationErrors, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const vendor = await db.query.vendorsTable.findFirst({
      where: eq(vendorsTable.id, req.params.id),
      with: {
        proposals: {
          with: {
            rfp: true,
          },
        },
      },
    });

    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    res.json(vendor);
  } catch (error) {
    next(error);
  }
});

// Create vendor
router.post('/', validateVendor, handleValidationErrors, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, contactName, phone, address, notes } = req.body;

    const now = new Date();
    const [vendor] = await db.insert(vendorsTable).values({
      id: randomUUID(),
      name: sanitizeString(name) || '',
      email: email.trim().toLowerCase(),
      contactName: sanitizeString(contactName),
      phone: sanitizeString(phone),
      address: sanitizeString(address),
      notes: sanitizeString(notes),
      createdAt: now,
      updatedAt: now,
    }).returning();

    res.status(201).json(vendor);
  } catch (error) {
    next(error);
  }
});

// Update vendor
router.put('/:id', validateUUID, validateVendor, handleValidationErrors, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, contactName, phone, address, notes } = req.body;

    const updateData: any = {};
    if (name) updateData.name = sanitizeString(name);
    if (email) updateData.email = email.trim().toLowerCase();
    if (contactName !== undefined) updateData.contactName = sanitizeString(contactName);
    if (phone !== undefined) updateData.phone = sanitizeString(phone);
    if (address !== undefined) updateData.address = sanitizeString(address);
    if (notes !== undefined) updateData.notes = sanitizeString(notes);
    updateData.updatedAt = new Date();

    const [vendor] = await db.update(vendorsTable)
      .set(updateData)
      .where(eq(vendorsTable.id, req.params.id))
      .returning();

    res.json(vendor);
  } catch (error) {
    next(error);
  }
});

// Delete vendor
router.delete('/:id', validateUUID, handleValidationErrors, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await db.delete(vendorsTable).where(eq(vendorsTable.id, req.params.id));

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
