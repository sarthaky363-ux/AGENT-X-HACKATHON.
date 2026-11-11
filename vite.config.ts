import { GoogleGenAI } from '@google/genai';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, Plugin } from 'vite';

dotenv.config();
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

function geminiAgentApiPlugin(): Plugin {
  const apiKey = process.env.GEMINI_API_KEY;
  let ai: GoogleGenAI | null = null;
  const requestWindows = new Map<string, { startedAt: number; count: number }>();
  let quotaCooldownUntil = 0;
  const rollingRequestTimestamps: number[] = [];
  const FREE_TIER_MAX_RPM = 4; // Safely pace under the 5 requests-per-minute Free Tier ceiling

  if (apiKey) {
    ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        timeout: 15000,
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  return {
    name: 'gemini-agent-api',
    configureServer(server) {
      server.middlewares.use('/api/gemini/agent', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method Not Allowed' }));
          return;
        }

        const now = Date.now();
        // Check if free-tier quota cooldown is currently engaged
        if (now < quotaCooldownUntil) {
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              success: false,
              error: 'Gemini free-tier quota cooldown active. Using deterministic operational fallback.',
              isFallback: true,
            })
          );
          return;
        }

        // Clean up sliding request window
        while (rollingRequestTimestamps.length > 0 && rollingRequestTimestamps[0] <= now - 60_000) {
          rollingRequestTimestamps.shift();
        }

        // If we are about to breach the 5 RPM limit, return immediate fallback without hammering upstream
        if (rollingRequestTimestamps.length >= FREE_TIER_MAX_RPM) {
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              success: false,
              error: 'Pacing Gemini calls within free-tier quota. Using deterministic operational fallback.',
              isFallback: true,
            })
          );
          return;
        }

        for (const [ip, window] of requestWindows) {
          if (now - window.startedAt >= 60_000) requestWindows.delete(ip);
        }
        const ip = req.socket.remoteAddress || 'unknown';
        const window = requestWindows.get(ip);
        if (window && now - window.startedAt < 60_000 && window.count >= 20) {
          res.statusCode = 429;
          res.setHeader('Retry-After', String(Math.ceil((60_000 - (now - window.startedAt)) / 1000)));
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: 'Gemini request limit reached. Retry after the current minute.', isFallback: true }));
          return;
        }
        if (!window || now - window.startedAt >= 60_000) requestWindows.set(ip, { startedAt: now, count: 1 });
        else window.count += 1;

        let body = '';
        let bodyTooLarge = false;

        req.on('data', chunk => {
          if (bodyTooLarge) return;
          body += chunk;
          if (Buffer.byteLength(body, 'utf8') > 50 * 1024) {
            bodyTooLarge = true;
            body = '';
          }
        });

        req.on('end', async () => {
          if (bodyTooLarge) {
            res.statusCode = 413;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: 'Request body exceeds the 50 KB limit.', isFallback: true }));
            return;
          }
          try {
            const parsed = JSON.parse(body || '{}');
            const { agent, prompt, contents, systemInstruction, tools, responseSchema, responseMimeType, temperature } = parsed;

            const contentPayload = contents || prompt;
            if (!contentPayload) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: 'Prompt or contents is required' }));
              return;
            }

            if (!ai) {
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  success: false,
                  error: 'GEMINI_API_KEY not configured on server',
                  isFallback: true,
                })
              );
              return;
            }

            const config: any = {
              systemInstruction:
                systemInstruction ||
                'You are an operational disaster response agent for Mumbai. Output strictly valid JSON without markdown.',
              temperature: temperature ?? 0.2,
            };

            if (tools) {
              config.tools = tools;
            }

            if (responseMimeType) {
              config.responseMimeType = responseMimeType;
            } else if (responseSchema) {
              config.responseMimeType = 'application/json';
              config.responseSchema = responseSchema;
            }

            rollingRequestTimestamps.push(Date.now());
            const response = await ai.models.generateContent({
              model: 'gemini-3.8-flash',
              contents: contentPayload,
              config: { ...config, httpOptions: { timeout: 15000 } },
            });

            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                success: true,
                text: response.text,
                functionCalls: response.functionCalls,
                candidates: response.candidates,
                agent,
              })
            );
          } catch (err: unknown) {
            const error = err instanceof Error ? err.message : String(err);
            const isQuotaError = /429|quota|RESOURCE_EXHAUSTED/i.test(error);
            if (isQuotaError) {
              const retryMatch = error.match(/retry in ([0-9.]+)s/i);
              const retryMs = retryMatch ? Math.ceil(parseFloat(retryMatch[1]) * 1000) : 20_000;
              quotaCooldownUntil = Date.now() + Math.max(retryMs, 15_000);
              console.info(`[Vite Gemini Plugin] Free-tier RPM quota reached; engaged automatic cooldown for ${Math.round((quotaCooldownUntil - Date.now()) / 1000)}s.`);
            } else {
              console.info('[Vite Gemini Plugin] Gemini unavailable, using deterministic fallback:', error);
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                success: false,
                error,
                isFallback: true,
              })
            );
          }
        });
      });
    },
  };
}

export default defineConfig(() => {
  return {
    base: process.env.GITHUB_ACTIONS === 'true' ? '/entangle-app/' : '/',
    plugins: [react(), tailwindcss(), geminiAgentApiPlugin()],
    resolve: {
      alias: { '@': projectRoot },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      chunkSizeWarningLimit: 1200,
    },
  };
});
