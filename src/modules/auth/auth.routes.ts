import { Router, type CookieOptions } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { env } from '../../config/env';
import { AUTH_COOKIE, authenticate, signToken } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { UserModel } from '../../models/User';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';
import { loginSchema } from './auth.schema';

const router = Router();

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.isProduction,
  sameSite: 'lax',
  path: '/',
};

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many login attempts, try again in 15 minutes' },
});

// A real hash so unknown emails take as long as wrong passwords (no user enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10);

router.post(
  '/login',
  loginLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const { email, password } = req.validated.body as { email: string; password: string };
    const user = await UserModel.findOne({ email }).select('+password');
    const valid = await bcrypt.compare(password, user?.password ?? DUMMY_HASH);
    if (!user || !valid) throw ApiError.unauthorized('Invalid email or password');

    const token = signToken(user.id, user.role);
    const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    res.cookie(AUTH_COOKIE, token, { ...cookieOptions, expires: new Date(decoded.exp * 1000) });
    res.json({
      success: true,
      data: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  }),
);

router.post('/logout', (_req, res) => {
  res.clearCookie(AUTH_COOKIE, cookieOptions);
  res.json({ success: true, message: 'Signed out' });
});

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await UserModel.findById(req.user!.id).lean();
    if (!user) throw ApiError.unauthorized();
    res.json({
      success: true,
      data: { id: String(user._id), name: user.name, email: user.email, role: user.role },
    });
  }),
);

export default router;
