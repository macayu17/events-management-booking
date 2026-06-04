import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import adminRoutes from '../src/routes/admin.routes.js';
import teamRoutes from '../src/routes/team.routes.js';
import ticketRoutes from '../src/routes/ticket.routes.js';

const withServer = async (app, run) => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
};

const buildApp = () => {
  const app = express();
  const jsonParser = express.json();
  const certificatePreviewPathPattern = /^\/admin\/events\/[^/]+\/certificates\/test\/?$/;

  app.use((req, res, next) => {
    if (certificatePreviewPathPattern.test(req.path)) return next();
    return jsonParser(req, res, next);
  });
  app.use('/admin', adminRoutes);
  app.use('/team', teamRoutes);
  app.use('/tickets', ticketRoutes);
  return app;
};

const flattenRoutes = (router) => router.stack.flatMap((layer) => {
  if (layer.route) {
    return Object.keys(layer.route.methods).map((method) => `${method.toUpperCase()} ${layer.route.path}`);
  }

  if (layer.handle?.stack) {
    return flattenRoutes(layer.handle);
  }

  return [];
});

const flattenRouteDetails = (router) => router.stack.flatMap((layer) => {
  if (layer.route) {
    return Object.keys(layer.route.methods).map((method) => ({
      method: method.toUpperCase(),
      path: layer.route.path,
      stack: layer.route.stack.map((entry) => entry.name),
    }));
  }

  if (layer.handle?.stack) {
    return flattenRouteDetails(layer.handle);
  }

  return [];
});

test('admin certificate routes stay mounted behind shared admin auth middleware', () => {
  assert.equal(adminRoutes.stack[0]?.name, 'authenticate');
  assert.equal(adminRoutes.stack[1]?.name, 'requireOrganizer');
  assert.equal(adminRoutes.stack[2]?.name, 'router');

  assert.deepEqual(
    flattenRoutes(adminRoutes).filter((route) => route.includes('/certificates') || route === 'POST /upload'),
    [
      'POST /upload',
      'POST /events/:id/certificates/upload',
      'POST /events/:id/certificates/test',
      'PUT /events/:id/certificates/config',
      'GET /events/:id/certificates/config',
      'GET /events/:id/certificates/template',
      'POST /events/:id/certificates',
    ]
  );
});

test('upload routes verify event access before multer storage runs', () => {
  const details = flattenRouteDetails(adminRoutes);
  const legacyCertificateUpload = details.find((route) => route.method === 'POST' && route.path === '/upload');
  const certificateUpload = details.find((route) => route.method === 'POST' && route.path === '/events/:id/certificates/upload');
  const certificatePreview = details.find((route) => route.method === 'POST' && route.path === '/events/:id/certificates/test');
  const posterUpload = details.find((route) => route.method === 'POST' && route.path === '/events/:id/poster-upload');

  assert.deepEqual(legacyCertificateUpload?.stack, ['<anonymous>']);
  assert.deepEqual(certificateUpload?.stack, [
    'requireCertificateUploadAccess',
    'multerMiddleware',
    'handleCertificateTemplateUpload',
  ]);
  assert.deepEqual(certificatePreview?.stack, [
    'requireCertificatePreviewAccess',
    'jsonParser',
    '<anonymous>',
  ]);
  assert.deepEqual(posterUpload?.stack, [
    'requireEventMutationAccessMiddleware',
    'multerMiddleware',
    '<anonymous>',
  ]);
});

test('large certificate preview bodies still hit auth before the large route parser', async () => {
  await withServer(buildApp(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/admin/events/event-1/certificates/test`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ templateUrl: `data:application/pdf;base64,${'a'.repeat(3 * 1024 * 1024)}` }),
    });

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'No token provided' });
  });
});

test('protected admin/team/ticket routes reject missing tokens before handlers', async () => {
  await withServer(buildApp(), async (baseUrl) => {
    const cases = [
      { method: 'GET', path: '/admin/events' },
      { method: 'GET', path: '/admin/events/event-1/certificates/config' },
      { method: 'POST', path: '/admin/events/event-1/certificates/upload' },
      { method: 'POST', path: '/admin/events/event-1/certificates/test', body: { templateUrl: 'not-used-without-auth' } },
      { method: 'GET', path: '/team/events' },
      { method: 'POST', path: '/tickets/verify', body: { qrPayload: 'not-used-without-auth' } },
    ];

    for (const route of cases) {
      const response = await fetch(`${baseUrl}${route.path}`, {
        method: route.method,
        headers: route.body ? { 'content-type': 'application/json' } : undefined,
        body: route.body ? JSON.stringify(route.body) : undefined,
      });

      assert.equal(response.status, 401, `${route.method} ${route.path}`);
      assert.deepEqual(await response.json(), { error: 'No token provided' });
    }
  });
});
