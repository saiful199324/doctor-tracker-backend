import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { getOverview, RANGES, type StatsRange } from './stats.service';

const router = Router();

const isValidTimezone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const overviewQuery = z.object({
  range: z.enum(Object.keys(RANGES) as [StatsRange, ...StatsRange[]]).default('30d'),
  tz: z.string().max(64).refine(isValidTimezone, 'Invalid timezone').default('UTC'),
});

router.get(
  '/overview',
  validate({ query: overviewQuery }),
  asyncHandler(async (req, res) => {
    const { range, tz } = req.validated.query as z.infer<typeof overviewQuery>;
    res.json({ success: true, data: await getOverview(range, tz) });
  }),
);

export default router;
