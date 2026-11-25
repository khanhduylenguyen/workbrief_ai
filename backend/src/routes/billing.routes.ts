import { Router } from 'express';
import * as billing from '../controllers/billing.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Called by VNPay / the customer's browser — verified by the HMAC signature, not a JWT.
router.get('/vnpay/return', billing.vnpayReturn);
router.get('/vnpay/ipn', billing.vnpayIpn);

router.get('/', authenticate, billing.overview);
router.post('/checkout', authenticate, billing.checkout);

export default router;
