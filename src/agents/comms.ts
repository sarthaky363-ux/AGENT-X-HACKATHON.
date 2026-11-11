/**
 * Drafts validated multilingual updates only after an operator approves a plan.
 */

import { EventSubscriber, useWorldStore } from '../state/store.ts';
import { CommsDraft, LanguageCode } from '../state/types.ts';
import { isValidCommsText } from '../tools/commsValidation.ts';
import { fetchWithTimeout } from '../services/fetchWithTimeout.ts';

export { isValidCommsText } from '../tools/commsValidation.ts';

type LanguageDrafts = Record<LanguageCode, string>;

const LANGUAGES: LanguageCode[] = ['en', 'hi', 'mr'];
function fallbackDrafts(areaName: string): LanguageDrafts {
  return {
    en: `Update for ${areaName}: Support teams are coordinating local assistance. Please use [SAFE ROUTE] or move to [SHELTER]. For assistance, call 1916.`,
    hi: 'इस क्षेत्र के लिए सूचना: सहायता दल स्थानीय मदद का समन्वय कर रहे हैं। कृपया [सुरक्षित मार्ग] का उपयोग करें या [आश्रय] जाएँ। सहायता के लिए 1916 पर कॉल करें।',
    mr: 'या क्षेत्रासाठी सूचना: मदत पथके स्थानिक सहाय्याचे समन्वय करत आहेत. कृपया [सुरक्षित मार्ग] वापरा किंवा [निवारा] येथे जा. मदतीसाठी 1916 वर कॉल करा.',
  };
}

function parseGeminiDrafts(text: unknown): Partial<LanguageDrafts> {
  if (typeof text !== 'string') return {};
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    return {
      en: typeof parsed.en === 'string' ? parsed.en.trim() : undefined,
      hi: typeof parsed.hi === 'string' ? parsed.hi.trim() : undefined,
      mr: typeof parsed.mr === 'string' ? parsed.mr.trim() : undefined,
    };
  } catch {
    return {};
  }
}

async function draftForArea(areaName: string, canContinue: () => boolean): Promise<LanguageDrafts> {
  const fallback = fallbackDrafts(areaName);
  try {
    if (!canContinue()) return fallback;
    const response = await fetchWithTimeout('/api/gemini/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: 'comms',
        prompt: `Draft one calm public update in English, Hindi, and Marathi for ${areaName}. Each must say local support is coordinating, include a safe route or shelter placeholder, include helpline 1916, contain no panic words, and be under 280 characters. Return only JSON with keys en, hi, mr. Hindi and Marathi must use Devanagari script; English must use Latin script.`,
        systemInstruction: 'Write calm, concise public-service updates. Do not use panic language, invent facts, or omit a language. Use [SAFE ROUTE] or [SHELTER] placeholders in English and translated placeholders in Devanagari. Include helpline 1916. Output JSON only.',
        temperature: 0.2,
      }),
    });
    if (!canContinue()) return fallback;
    if (!response.ok) return fallback;
    const data = await response.json();
    if (!canContinue()) return fallback;
    const proposed = parseGeminiDrafts(data.text);
    return Object.fromEntries(LANGUAGES.map(language => [
      language,
      proposed[language] && isValidCommsText(language, proposed[language])
        ? proposed[language]
        : fallback[language],
    ])) as LanguageDrafts;
  } catch (error) {
    console.info('[Comms Agent] Gemini draft unavailable; using validated templates.', error);
    return fallback;
  }
}

let generation = 0;
let unsubscribe: (() => void) | undefined;

async function createDrafts(planId: string): Promise<void> {
  const startState = useWorldStore.getState();
  if (startState.isKilled || startState.plans[planId]?.status !== 'approved') return;
  const runId = ++generation;
  const canContinue = () => {
    const state = useWorldStore.getState();
    return runId === generation && !state.isKilled && state.plans[planId]?.status === 'approved';
  };
  const plan = startState.plans[planId];
  const affected = new Map<string, { incidentId: string; areaName: string; disasterType: CommsDraft['disasterType'] }>();
  plan.assignments.forEach(assignment => {
    const incident = startState.incidents[assignment.incidentId];
    if (!incident || affected.has(incident.area)) return;
    affected.set(incident.area, {
      incidentId: incident.id,
      areaName: startState.areas[incident.area]?.name || incident.area.replaceAll('_', ' '),
      disasterType: incident.type === 'heatwave' ? 'heatwave' : 'flood',
    });
  });
  if (affected.size === 0) return;

  useWorldStore.getState().setAgentEvaluating('comms', true, 'Preparing multilingual area updates');
  try {
    const drafts: CommsDraft[] = [];
    for (const [wardId, area] of affected) {
      if (!canContinue()) return;
      const translations = await draftForArea(area.areaName, canContinue);
      if (!canContinue()) return;
      LANGUAGES.forEach(language => {
        drafts.push({
          id: `comms_${planId}_${wardId}_${language}`,
          incidentId: area.incidentId,
          wardId,
          areaName: area.areaName,
          disasterType: area.disasterType,
          language,
          text: translations[language],
          approvedByHuman: false,
          broadcastChannels: ['sms', 'whatsapp'],
        });
      });
    }
    if (!canContinue()) return;
    useWorldStore.getState().dispatchEvent({
      actor: 'agent:comms',
      type: 'COMMS_DRAFTS_CREATED',
      payload: { planId, drafts },
      reason: `Prepared ${drafts.length} validated multilingual message drafts after plan approval.`,
    });
  } catch (error) {
    if (canContinue()) {
      console.error('[Comms Agent] Draft generation failed.', error);
      useWorldStore.getState().dispatchEvent({
        actor: 'agent:comms',
        type: 'AGENT_ERROR_LOGGED',
        payload: { agent: 'comms', error: error instanceof Error ? error.message : String(error) },
        reason: 'Comms could not prepare validated message drafts.',
      });
    }
  } finally {
    useWorldStore.getState().setAgentEvaluating('comms', false);
  }
}

export function initCommsAgentSubscription(): () => void {
  unsubscribe?.();
  const store = useWorldStore.getState();
  unsubscribe = store.subscribeToEvents((event: Parameters<EventSubscriber>[0]) => {
    if (event.type === 'DEMO_SCENARIO_RESET') {
      generation++;
      useWorldStore.getState().setAgentEvaluating('comms', false);
      return;
    }
    if (event.type === 'SYSTEM_FROZEN') {
      generation++;
      useWorldStore.getState().setAgentEvaluating('comms', false);
      return;
    }
    if (event.type === 'PLAN_APPROVED' && event.actor === 'human' && event.payload?.planId) {
      void createDrafts(event.payload.planId);
    }
  });
  return () => {
    unsubscribe?.();
    unsubscribe = undefined;
    generation++;
  };
}
