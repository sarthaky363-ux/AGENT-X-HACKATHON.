/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Full-stack Express Production Server for ENTANGLE
 * Serves static assets and provides server-side Gemini 3.8 Flash agent gateway.
 */

import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = Number(process.env.PORT || 3000);
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const requestCounts = new Map<string, { startedAt: number; count: number }>();

let quotaCooldownUntil = 0;
const rollingRequestTimestamps: number[] = [];
const FREE_TIER_MAX_RPM = 4; // Safely pace under the 5 requests-per-minute Free Tier ceiling

app.use(express.json({ limit: '50kb' }));

const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
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

app.post('/api/gemini/agent', async (req: Request, res: Response) => {
  const now = Date.now();

  // Check if free-tier quota cooldown is currently engaged
  if (now < quotaCooldownUntil) {
    return res.json({
      success: false,
      error: 'Gemini free-tier quota cooldown active. Using deterministic operational fallback.',
      isFallback: true,
    });
  }

  // Clean up sliding request window
  while (rollingRequestTimestamps.length > 0 && rollingRequestTimestamps[0] <= now - 60_000) {
    rollingRequestTimestamps.shift();
  }

  // If we are about to breach the 5 RPM limit, return immediate fallback without hammering upstream
  if (rollingRequestTimestamps.length >= FREE_TIER_MAX_RPM) {
    return res.json({
      success: false,
      error: 'Pacing Gemini calls within free-tier quota. Using deterministic operational fallback.',
      isFallback: true,
    });
  }

  for (const [ip, window] of requestCounts) {
    if (now - window.startedAt >= RATE_LIMIT_WINDOW_MS) requestCounts.delete(ip);
  }
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const rateWindow = requestCounts.get(ip);
  if (rateWindow && now - rateWindow.startedAt < RATE_LIMIT_WINDOW_MS && rateWindow.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retrySeconds = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - rateWindow.startedAt)) / 1000);
    res.setHeader('Retry-After', String(retrySeconds));
    return res.status(429).json({ success: false, error: 'Gemini request limit reached. Retry after the current minute.', isFallback: true });
  }
  if (!rateWindow || now - rateWindow.startedAt >= RATE_LIMIT_WINDOW_MS) {
    requestCounts.set(ip, { startedAt: now, count: 1 });
  } else {
    rateWindow.count += 1;
  }
  const { agent, prompt, contents, systemInstruction, tools, responseSchema, responseMimeType, temperature } = req.body;

  const contentPayload = contents || prompt;
  if (!contentPayload) {
    return res.status(400).json({ success: false, error: 'Prompt or contents is required' });
  }

  if (!ai) {
    return res.json({
      success: false,
      error: 'GEMINI_API_KEY not configured on server',
      isFallback: true,
    });
  }

  try {
    const config: any = {
      systemInstruction: systemInstruction || 'You are an operational disaster response agent for Mumbai. Output strictly valid JSON without markdown.',
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

    return res.json({
      success: true,
      text: response.text,
      functionCalls: response.functionCalls,
      candidates: response.candidates,
      agent,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    const isQuotaError = /429|quota|RESOURCE_EXHAUSTED/i.test(error);
    if (isQuotaError) {
      const retryMatch = error.match(/retry in ([0-9.]+)s/i);
      const retryMs = retryMatch ? Math.ceil(parseFloat(retryMatch[1]) * 1000) : 20_000;
      quotaCooldownUntil = Date.now() + Math.max(retryMs, 15_000);
      console.info(`[Gemini Server Gateway] Free-tier RPM quota reached; engaged automatic cooldown for ${Math.round((quotaCooldownUntil - Date.now()) / 1000)}s.`);
    } else {
      console.info(`Gemini Agent [${agent}] unavailable, using deterministic fallback:`, error);
    }
    return res.json({
      success: false,
      error,
      isFallback: true,
    });
  }
});

app.use((error: unknown, _req: Request, res: Response, next: express.NextFunction) => {
  const bodyError = error as { type?: string };
  if (bodyError?.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: 'Request body exceeds the 50 KB limit.', isFallback: true });
  }
  return next(error);
});

app.use(express.static(path.join(projectRoot, 'dist')));
app.get('*', (req: Request, res: Response) => {
  res.sendFile(path.join(projectRoot, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ENTANGLE Control Room Server listening on port ${PORT}`);
});
