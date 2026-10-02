import { defineConfig } from 'vite';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const serverModule = require('./server/server.js');

function studioOpsApiPlugin() {
  return {
    name: 'studioops-api',
    configureServer(server) {
      if (serverModule.initWorker) {
        serverModule.initWorker();
      }
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api')) {
          return next();
        }
        const url = new URL(req.url, `http://${req.headers.host || '0.0.0.0:3000'}`);
        try {
          await serverModule.api(req, res, url);
        } catch (error) {
          res.writeHead(error.status || 500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: error.status ? error.message : 'Server error.' }));
          if (!error.status) console.error(error);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [studioOpsApiPlugin()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: 'all',
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
  },
});
