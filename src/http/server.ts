/**
 * HTTP API.
 *
 * Every request is authenticated, scoped and audited. Big integers are serialised
 * as strings so no currency amount is ever lossy in JSON.
 */

import express, { type NextFunction, type Request, type Response } from 'express';
import { loadConfig } from '../config.ts';
import { createPool, type DbPool } from '../db/pool.ts';
import { DomainError, forbidden, unauthenticated, validation } from '../domain/errors.ts';
import { authenticate, login, registerUser, revokeSession, type SessionUser } from '../domain/identity.ts';
import { newGuestToken } from '../domain/crypto.ts';
import {
  createProduct,
  getProduct,
  searchProducts,
} from '../domain/catalog.ts';
import {
  createOffer,
  listProductOffers,
  listVendorOffers,
  updateOffer,
} from '../domain/offers.ts';
import { adjustStock, listStockLedger } from '../domain/inventory.ts';
import { addItem, getOrCreateOpenCart, removeItem, updateItemQuantity, viewCart } from '../domain/cart.ts';
import { getBuyerOrder, placeOrder, quoteCart } from '../domain/checkout.ts';
import { SandboxPaymentProvider } from '../domain/payments.ts';
import {
  approveVendorApplication,
  getVendorProfile,
  listMyApplications,
  listPendingApplications,
  rejectVendorApplication,
  submitVendorApplication,
} from '../domain/vendors.ts';
import { getVendorLedger, listVendorOrders } from '../domain/vendor-ops.ts';
import { getPlatformStatus, renderStatusPage } from '../domain/status.ts';

export interface ServerDependencies {
  readonly pool: DbPool;
  readonly paymentProvider: SandboxPaymentProvider;
}

interface AuthedRequest extends Request {
  user?: SessionUser;
  guestToken?: string;
}

function serialise(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(serialise);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, serialise(item)]),
    );
  }
  return value;
}

export function createApp(deps: ServerDependencies): express.Express {
  const app = express();
  app.use(express.json({ limit: '256kb' }));
  app.disable('x-powered-by');

  const bearer = async (req: AuthedRequest, _res: Response, next: NextFunction) => {
    try {
      const header = req.header('authorization') ?? '';
      const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
      if (token === '') throw unauthenticated();
      req.user = await authenticate(deps.pool, token);
      req.guestToken = req.header('x-guest-token') ?? undefined;
      next();
    } catch (error) {
      next(error);
    }
  };

  const requireAdmin = (req: AuthedRequest, _res: Response, next: NextFunction) => {
    if (req.user?.platformAdmin !== true) {
      next(forbidden('platform administrator role required'));
      return;
    }
    next();
  };

  const sellerOrg = (req: AuthedRequest): { userId: string; organizationId: string } => {
    const user = req.user;
    if (user === undefined) throw unauthenticated();
    const requested = req.header('x-organization-id');
    const sellerRoles = user.roles.filter(
      (role) => role.organizationKind === 'VENDOR' && (role.role === 'SELLER_OWNER' || role.role === 'SELLER_STAFF'),
    );
    const match = requested === undefined
      ? sellerRoles[0]
      : sellerRoles.find((role) => role.organizationId === requested);
    if (match === undefined) throw forbidden('an active seller membership is required');
    return { userId: user.userId, organizationId: match.organizationId };
  };

  const handle = (fn: (req: AuthedRequest, res: Response) => Promise<unknown>) =>
    async (req: AuthedRequest, res: Response, next: NextFunction) => {
      try {
        const result = await fn(req, res);
        if (!res.headersSent) res.json(serialise(result));
      } catch (error) {
        next(error);
      }
    };

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', service: 'borvat-marketplace', time: new Date().toISOString() });
  });

  app.get(
    '/api/status',
    handle(async () => getPlatformStatus(deps.pool)),
  );

  // A human opening the base URL should see what the marketplace actually holds.
  app.get(
    '/',
    async (_req, res, next) => {
      try {
        const status = await getPlatformStatus(deps.pool);
        res.type('html').send(renderStatusPage(status));
      } catch (error) {
        next(error);
      }
    },
  );

  // ------------------------------------------------------------------ identity

  app.post(
    '/api/auth/register',
    handle(async (req) => {
      const body = req.body ?? {};
      const user = await registerUser(deps.pool, {
        email: String(body.email ?? ''),
        password: String(body.password ?? ''),
        displayName: String(body.displayName ?? ''),
        country: String(body.country ?? 'NL'),
        correlationId: req.header('x-correlation-id') ?? null,
      });
      return { user };
    }),
  );

  app.post(
    '/api/auth/login',
    handle(async (req) => {
      const body = req.body ?? {};
      const result = await login(deps.pool, {
        email: String(body.email ?? ''),
        password: String(body.password ?? ''),
        ttlSeconds: loadConfig().sessionTtlSeconds,
        correlationId: req.header('x-correlation-id') ?? null,
      });
      return result;
    }),
  );

  app.post(
    '/api/auth/logout',
    bearer,
    handle(async (req) => {
      const header = req.header('authorization') ?? '';
      await revokeSession(deps.pool, header.slice(7).trim());
      return { revoked: true };
    }),
  );

  app.get(
    '/api/me',
    bearer,
    handle(async (req) => ({ user: req.user })),
  );

  // ------------------------------------------------------------------ vendors

  app.post(
    '/api/vendor/applications',
    bearer,
    handle(async (req) => {
      const user = req.user;
      if (user === undefined) throw unauthenticated();
      const body = req.body ?? {};
      return submitVendorApplication(deps.pool, {
        userId: user.userId,
        legalName: String(body.legalName ?? ''),
        country: String(body.country ?? user.country),
        companyRegistration: body.companyRegistration ?? null,
        vatNumber: body.vatNumber ?? null,
        correlationId: req.header('x-correlation-id') ?? null,
      });
    }),
  );

  app.get(
    '/api/vendor/applications',
    bearer,
    handle(async (req) => {
      const user = req.user;
      if (user === undefined) throw unauthenticated();
      return { applications: await listMyApplications(deps.pool, user.userId) };
    }),
  );

  app.get(
    '/api/admin/vendor/applications',
    bearer,
    requireAdmin,
    handle(async () => ({ applications: await listPendingApplications(deps.pool) })),
  );

  app.post(
    '/api/admin/vendor/applications/:id/approve',
    bearer,
    requireAdmin,
    handle(async (req) => {
      const user = req.user;
      if (user === undefined) throw unauthenticated();
      const body = req.body ?? {};
      const commissionBps = Number(body.commissionBps ?? loadConfig().defaultCommissionBps);
      return approveVendorApplication(deps.pool, {
        adminUserId: user.userId,
        applicationId: String(req.params.id),
        commissionBps,
        payoutCurrency: body.payoutCurrency,
        correlationId: req.header('x-correlation-id') ?? null,
      });
    }),
  );

  app.post(
    '/api/admin/vendor/applications/:id/reject',
    bearer,
    requireAdmin,
    handle(async (req) => {
      const user = req.user;
      if (user === undefined) throw unauthenticated();
      const body = req.body ?? {};
      await rejectVendorApplication(deps.pool, {
        adminUserId: user.userId,
        applicationId: String(req.params.id),
        note: String(body.note ?? ''),
        correlationId: req.header('x-correlation-id') ?? null,
      });
      return { rejected: true };
    }),
  );

  app.get(
    '/api/vendor/profile',
    bearer,
    handle(async (req) => {
      const scope = sellerOrg(req);
      return getVendorProfile(deps.pool, scope);
    }),
  );

  // ------------------------------------------------------------------ catalogue

  app.post(
    '/api/admin/products',
    bearer,
    requireAdmin,
    handle(async (req) => {
      const user = req.user;
      if (user === undefined) throw unauthenticated();
      const body = req.body ?? {};
      return createProduct(deps.pool, {
        actorUserId: user.userId,
        masterSku: String(body.masterSku ?? ''),
        title: String(body.title ?? ''),
        brand: body.brand ?? null,
        categoryPath: body.categoryPath ?? 'uncategorised',
        gtin: body.gtin ?? null,
        description: body.description ?? null,
        status: body.status ?? 'ACTIVE',
        correlationId: req.header('x-correlation-id') ?? null,
      });
    }),
  );

  app.get(
    '/api/catalog/search',
    handle(async (req) => {
      const market = String(req.query.market ?? loadConfig().platformCountry).toUpperCase();
      const results = await searchProducts(deps.pool, {
        query: req.query.q === undefined ? null : String(req.query.q),
        categoryPath: req.query.category === undefined ? null : String(req.query.category),
        market,
        limit: req.query.limit === undefined ? 20 : Number(req.query.limit),
        offset: req.query.offset === undefined ? 0 : Number(req.query.offset),
      });
      return { market, results };
    }),
  );

  app.get(
    '/api/catalog/products/:id',
    handle(async (req) => getProduct(deps.pool, String(req.params.id))),
  );

  app.get(
    '/api/catalog/products/:id/offers',
    handle(async (req) => {
      const market = String(req.query.market ?? loadConfig().platformCountry).toUpperCase();
      const quantity = req.query.quantity === undefined ? 1 : Number(req.query.quantity);
      return {
        market,
        offers: await listProductOffers(deps.pool, {
          productId: String(req.params.id),
          market,
          quantity,
        }),
      };
    }),
  );

  // ------------------------------------------------------------------ seller operations

  app.get(
    '/api/vendor/offers',
    bearer,
    handle(async (req) => {
      const scope = sellerOrg(req);
      return { offers: await listVendorOffers(deps.pool, { ...scope, limit: 100 }) };
    }),
  );

  app.post(
    '/api/vendor/offers',
    bearer,
    handle(async (req) => {
      const scope = sellerOrg(req);
      const body = req.body ?? {};
      return createOffer(deps.pool, {
        actorUserId: scope.userId,
        organizationId: scope.organizationId,
        productId: String(body.productId ?? ''),
        offerRef: String(body.offerRef ?? ''),
        priceMinor: String(body.priceMinor ?? '0'),
        currency: String(body.currency ?? loadConfig().platformCurrency),
        shippingMinor: String(body.shippingMinor ?? '0'),
        freeShippingThresholdMinor:
          body.freeShippingThresholdMinor === undefined || body.freeShippingThresholdMinor === null
            ? null
            : String(body.freeShippingThresholdMinor),
        stockAvailable: Number(body.stockAvailable ?? 0),
        handlingDays: body.handlingDays === undefined ? 1 : Number(body.handlingDays),
        maxPerOrder: body.maxPerOrder === undefined ? 10 : Number(body.maxPerOrder),
        shipsTo: body.shipsTo,
        status: body.status ?? 'ACTIVE',
        correlationId: req.header('x-correlation-id') ?? null,
      });
    }),
  );

  app.patch(
    '/api/vendor/offers/:id',
    bearer,
    handle(async (req) => {
      const scope = sellerOrg(req);
      const body = req.body ?? {};
      return updateOffer(deps.pool, {
        actorUserId: scope.userId,
        organizationId: scope.organizationId,
        offerId: String(req.params.id),
        patch: {
          ...(body.priceMinor === undefined ? {} : { priceMinor: String(body.priceMinor) }),
          ...(body.shippingMinor === undefined ? {} : { shippingMinor: String(body.shippingMinor) }),
          ...(body.freeShippingThresholdMinor === undefined
            ? {}
            : {
                freeShippingThresholdMinor:
                  body.freeShippingThresholdMinor === null ? null : String(body.freeShippingThresholdMinor),
              }),
          ...(body.handlingDays === undefined ? {} : { handlingDays: Number(body.handlingDays) }),
          ...(body.maxPerOrder === undefined ? {} : { maxPerOrder: Number(body.maxPerOrder) }),
          ...(body.shipsTo === undefined ? {} : { shipsTo: body.shipsTo }),
          ...(body.status === undefined ? {} : { status: body.status }),
        },
        correlationId: req.header('x-correlation-id') ?? null,
      });
    }),
  );

  app.post(
    '/api/vendor/offers/:id/stock',
    bearer,
    handle(async (req) => {
      const scope = sellerOrg(req);
      const body = req.body ?? {};
      const delta = Number(body.delta);
      if (!Number.isInteger(delta) || delta === 0) throw validation('delta must be a non-zero integer');
      return adjustStock(deps.pool, {
        actorUserId: scope.userId,
        organizationId: scope.organizationId,
        offerId: String(req.params.id),
        delta,
        reason: body.reason ?? 'RESTOCK',
        reference: body.reference ?? null,
      });
    }),
  );

  app.get(
    '/api/vendor/stock-ledger',
    bearer,
    handle(async (req) => {
      const scope = sellerOrg(req);
      return {
        entries: await listStockLedger(deps.pool, {
          ...scope,
          offerId: req.query.offerId === undefined ? null : String(req.query.offerId),
          limit: 100,
        }),
      };
    }),
  );

  app.get(
    '/api/vendor/orders',
    bearer,
    handle(async (req) => {
      const scope = sellerOrg(req);
      return { orders: await listVendorOrders(deps.pool, { ...scope, limit: 100 }) };
    }),
  );

  app.get(
    '/api/vendor/ledger',
    bearer,
    handle(async (req) => {
      const scope = sellerOrg(req);
      return getVendorLedger(deps.pool, { ...scope, limit: 100 });
    }),
  );

  // ------------------------------------------------------------------ buyer cart and checkout

  const ownerOf = (req: AuthedRequest): { userId: string | null; guestToken: string | null } => {
    if (req.user !== undefined) return { userId: req.user.userId, guestToken: null };
    const guest = req.header('x-guest-token');
    if (guest === undefined || guest.length < 10) throw unauthenticated('authentication or a guest token is required');
    return { userId: null, guestToken: guest };
  };

  app.post(
    '/api/guest-session',
    handle(async () => ({ guestToken: newGuestToken() })),
  );

  app.post(
    '/api/cart',
    bearer,
    handle(async (req) => {
      const owner = ownerOf(req);
      const body = req.body ?? {};
      const cart = await getOrCreateOpenCart(deps.pool, {
        owner,
        market: String(body.market ?? loadConfig().platformCountry),
        currency: String(body.currency ?? loadConfig().platformCurrency),
      });
      return viewCart(deps.pool, { owner, cartId: cart.cartId });
    }),
  );

  app.get(
    '/api/cart/:id',
    bearer,
    handle(async (req) => {
      const owner = ownerOf(req);
      return viewCart(deps.pool, { owner, cartId: String(req.params.id) });
    }),
  );

  app.post(
    '/api/cart/:id/items',
    bearer,
    handle(async (req) => {
      const owner = ownerOf(req);
      const body = req.body ?? {};
      return addItem(deps.pool, {
        owner,
        cartId: String(req.params.id),
        offerId: String(body.offerId ?? ''),
        quantity: Number(body.quantity ?? 1),
      });
    }),
  );

  app.patch(
    '/api/cart/:id/items/:itemId',
    bearer,
    handle(async (req) => {
      const owner = ownerOf(req);
      const body = req.body ?? {};
      return updateItemQuantity(deps.pool, {
        owner,
        cartId: String(req.params.id),
        itemId: String(req.params.itemId),
        quantity: Number(body.quantity ?? 1),
      });
    }),
  );

  app.delete(
    '/api/cart/:id/items/:itemId',
    bearer,
    handle(async (req) => {
      const owner = ownerOf(req);
      return removeItem(deps.pool, {
        owner,
        cartId: String(req.params.id),
        itemId: String(req.params.itemId),
      });
    }),
  );

  app.post(
    '/api/cart/:id/quote',
    bearer,
    handle(async (req) => {
      const owner = ownerOf(req);
      return quoteCart(deps.pool, { owner, cartId: String(req.params.id) });
    }),
  );

  app.post(
    '/api/checkout',
    bearer,
    handle(async (req) => {
      const user = req.user;
      if (user === undefined) throw unauthenticated();
      const body = req.body ?? {};
      const key = req.header('idempotency-key') ?? String(body.idempotencyKey ?? '');
      return placeOrder(deps.pool, {
        userId: user.userId,
        cartId: String(body.cartId ?? ''),
        idempotencyKey: key,
        provider: deps.paymentProvider,
        expectedTotalMinor: body.expectedTotalMinor === undefined ? undefined : String(body.expectedTotalMinor),
        correlationId: req.header('x-correlation-id') ?? null,
      });
    }),
  );

  app.get(
    '/api/orders/:id',
    bearer,
    handle(async (req) => {
      const user = req.user;
      if (user === undefined) throw unauthenticated();
      return getBuyerOrder(deps.pool, { userId: user.userId, orderId: String(req.params.id) });
    }),
  );

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof DomainError) {
      res.status(error.status).json({ error: { code: error.code, message: error.message, details: serialise(error.details) } });
      return;
    }
    const message = error instanceof Error ? error.message : 'unexpected error';
    console.error('[api] unhandled error', message);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'internal error' } });
  });

  return app;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config.appDatabaseUrl);
  const app = createApp({ pool, paymentProvider: new SandboxPaymentProvider() });
  const server = app.listen(config.port, config.host, () => {
    console.log(`borvat-marketplace api listening on http://${config.host}:${config.port}`);
  });
  const shutdown = async () => {
    server.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

const invokedDirectly = process.argv[1] !== undefined && process.argv[1].endsWith('server.ts');
if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
