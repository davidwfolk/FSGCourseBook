import { defineConfig, loadEnv } from 'vite';
import path from 'path';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  process.env = { ...process.env, ...env };

  return {
    server: {
      port: 5173,
      proxy: {
        '/api/render-green': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true
        }
      }
    },
    plugins: [
      tailwindcss(),
      {
        name: 'api-serverless-middleware',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (!req.url?.startsWith('/api/')) {
              return next();
            }

            const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost:5173'}`);
            const pathname = parsedUrl.pathname.replace(/\/+$/, '');

            let routeFile = '';
            if (pathname === '/api/courses') {
              routeFile = path.resolve(process.cwd(), 'api/courses.ts');
            } else if (pathname === '/api/holes') {
              routeFile = path.resolve(process.cwd(), 'api/holes.ts');
            } else if (pathname === '/api/r2-presign') {
              routeFile = path.resolve(process.cwd(), 'api/r2-presign.ts');
            } else if (pathname === '/api/search') {
              routeFile = path.resolve(process.cwd(), 'api/search.ts');
            } else if (pathname === '/api/overpass') {
              routeFile = path.resolve(process.cwd(), 'api/overpass.ts');
            } else if (pathname === '/api/elevation') {
              routeFile = path.resolve(process.cwd(), 'api/elevation.ts');
            } else {
              return next();
            }

            try {
              let body: any = null;
              if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
                const chunks: Buffer[] = [];
                for await (const chunk of req) {
                  chunks.push(chunk);
                }
                const rawBody = Buffer.concat(chunks).toString();
                if (rawBody) {
                  try {
                    body = JSON.parse(rawBody);
                  } catch {
                    body = rawBody;
                  }
                }
              }

              const module = await server.ssrLoadModule(routeFile);
              const handler = module.default;

              if (typeof handler !== 'function') {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: 'Handler not found in route file' }));
                return;
              }

              (res as any).status = function (statusCode: number) {
                res.statusCode = statusCode;
                return res;
              };
              (res as any).json = function (data: any) {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(data));
                return res;
              };
              (req as any).body = body;
              (req as any).query = Object.fromEntries(parsedUrl.searchParams.entries());

              await handler(req, res);
            } catch (err: any) {
              console.error('API Error in', pathname, err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
            }
          });
        }
      }
    ]
  };
});
