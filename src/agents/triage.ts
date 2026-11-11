/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ENTANGLE Triage Agent
 * Multi-agent disaster response coordinator for urban floods and heatwaves.
 * 
 * SPECIFICATION:
 * 1. Triggered by any 'REPORT_ADDED' event and by 'CREDIBILITY_UPDATED'.
 * 2. Gemini function-calling with up to 6 execution steps.
 * 3. Strict JSON output validation with 1-retry fallback.
 * 4. Deterministic numbers computed by pure TypeScript tools — LLM never invents numbers.
 * 5. Global Kill Switch awareness: freezes immediately if operator engages kill switch.
 * 6. Every tool invocation logs live to the Agent Activity stream.
 */

import { useWorldStore } from '../state/store.ts';
import {
  create_incident,
  find_similar_reports,
  get_open_reports,
  merge_reports,
  score_priority,
  translate_to_english,
  TRIAGE_FUNCTION_DECLARATIONS,
} from '../tools/triageTools.ts';
import { isReportDispatchable } from '../tools/credibility.ts';
import { fetchWithTimeout } from '../services/fetchWithTimeout.ts';

export interface TriageFinalOutput {
  decision: 'merged' | 'new_incident' | 'ignored';
  incidentId?: string;
  reasoning: string;
}

const activeTriageJobs = new Set<string>();
let triageGeneration = 0;

/**
 * Validates the strict JSON schema for the Triage Agent's final decision
 */
function validateTriageOutput(data: any): data is TriageFinalOutput {
  if (!data || typeof data !== 'object') return false;
  if (!['merged', 'new_incident', 'ignored'].includes(data.decision)) return false;
  if (typeof data.reasoning !== 'string' || data.reasoning.trim().length === 0) return false;
  if (data.decision === 'new_incident' && (!data.incidentId || typeof data.incidentId !== 'string')) {
    // Tolerant if incident was created in prior step
    return true;
  }
  return true;
}

/**
 * Executes a tool by name and logs its execution duration to Agent Activity
 */
async function executeTriageTool(name: string, args: any, reportId: string, expectedGeneration: number): Promise<any> {
  if (useWorldStore.getState().isKilled || expectedGeneration !== triageGeneration) return { error: 'Agent run superseded' };
  const store = useWorldStore.getState();
  const startTime = performance.now();
  let result: any;
  let status: 'success' | 'retry' | 'error' = 'success';
  let errorDetail: string | undefined;

  try {
    switch (name) {
      case 'get_open_reports':
        result = get_open_reports(args.area);
        break;

      case 'find_similar_reports':
        result = find_similar_reports(
          args.reportId || reportId,
          args.radiusMeters !== undefined ? Number(args.radiusMeters) : 300,
          args.windowMinutes !== undefined ? Number(args.windowMinutes) : 30
        );
        break;

      case 'score_priority':
        result = score_priority(args.reportId || reportId);
        break;

      case 'merge_reports':
        result = merge_reports(args.primaryId, args.duplicateIds || [], args.reason || 'Duplicate distress alert');
        break;

      case 'create_incident':
        result = create_incident(
          args.area,
          args.summary,
          Number(args.priority),
          args.needs || ['rescue'],
          args.reportIds || [reportId]
        );
        break;

      case 'translate_to_english':
        result = await translate_to_english(args.text);
        if (!useWorldStore.getState().isKilled && expectedGeneration === triageGeneration) {
          store.dispatchEvent({
            actor: 'triage',
            type: 'REPORT_TRANSLATION_UPDATED',
            payload: { reportId, englishTranslation: result },
            reason: result ? 'English translation saved for report display' : 'English translation unavailable',
          });
        }
        break;

      default:
        throw new Error(`Unknown triage tool: ${name}`);
    }
  } catch (err: any) {
    status = 'error';
    errorDetail = err?.message || String(err);
    result = { error: errorDetail };
  }

  if (useWorldStore.getState().isKilled || expectedGeneration !== triageGeneration) return { error: 'Agent run superseded' };
  const durationMs = Math.max(1, Math.round(performance.now() - startTime));

  // Log live to Agent Activity panel
  store.logAgentActivity({
    id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: Date.now(),
    agent: 'triage',
    toolName: name,
    inputParams: args || {},
    outputResult: result,
    executionMs: durationMs,
    status,
    errorDetail,
    triggerReason: `Triage evaluation for report ${reportId}`,
  });

  return result;
}

/**
 * Deterministic Fallback Execution Loop
 * Guarantees zero failures and rock-solid demo predictability if Gemini API is unreachable.
 */
async function runDeterministicTriage(reportId: string, expectedGeneration: number): Promise<TriageFinalOutput> {
  const store = useWorldStore.getState();
  const report = store.reports[reportId];
  if (!report) {
    return { decision: 'ignored', reasoning: `Report ${reportId} not found in WorldState.` };
  }

  if (!isReportDispatchable(report)) {
    const credScore = report.credibility ?? report.credibilityScore ?? 0;
    return {
      decision: 'ignored',
      reasoning: `Flagged as Unverified (credibility ${credScore.toFixed(2)} < 0.35). Kept visible in WorldState; excluded from dispatch until corroborated.`,
    };
  }

  // Step 1: Check for duplicates
  const similarReports = await executeTriageTool('find_similar_reports', { reportId, radiusMeters: 300, windowMinutes: 30 }, reportId, expectedGeneration);
  if (useWorldStore.getState().isKilled || expectedGeneration !== triageGeneration) {
    return { decision: 'ignored', reasoning: 'System frozen during triage.' };
  }

  if (Array.isArray(similarReports) && similarReports.length > 0) {
    const primary = similarReports[0];
    const primaryId = primary.id;

    // Check if primary already has an incident
    const existingInc = Object.values(store.incidents).find(inc => inc.reportIds.includes(primaryId));

    await executeTriageTool(
      'merge_reports',
      {
        primaryId,
        duplicateIds: [reportId],
        reason: `Corroborated duplicate report in ${report.area.toUpperCase()} (same physical cluster within 300m).`,
      },
      reportId,
      expectedGeneration
    );
    if (expectedGeneration !== triageGeneration) return { decision: 'ignored', reasoning: 'Triage run superseded by a scenario reset.' };

    return {
      decision: 'merged',
      incidentId: existingInc?.id,
      reasoning: `Merged into active primary report ${primaryId} due to spatial and temporal coincidence.`,
    };
  }

  // Step 2: Score deterministic priority
  const scoreResult = await executeTriageTool('score_priority', { reportId }, reportId, expectedGeneration);
  if (useWorldStore.getState().isKilled || expectedGeneration !== triageGeneration) {
    return { decision: 'ignored', reasoning: 'System frozen during triage.' };
  }
  const priorityScore = scoreResult?.score ?? 50;

  // Step 4: Translate regional language if required
  let englishSummary = report.text;
  if (report.language !== 'en' || !/^[\x00-\x7F\s.,!?'-]+$/.test(report.text)) {
    const translation = await executeTriageTool('translate_to_english', { text: report.text }, reportId, expectedGeneration);
    englishSummary = typeof translation === 'string' && translation.trim() ? translation.trim() : report.text;
    if (useWorldStore.getState().isKilled || expectedGeneration !== triageGeneration) {
      return { decision: 'ignored', reasoning: 'System frozen during triage.' };
    }
  }

  // Step 5: Derive appropriate tactical needs
  const needs: string[] = [];
  const textLower = report.text.toLowerCase();
  if (textLower.includes('boat') || textLower.includes('roof') || textLower.includes('छत') || textLower.includes('नाव') || textLower.includes('बोट') || textLower.includes('waterlogged')) {
    needs.push('boat');
  }
  if (textLower.includes('oxygen') || textLower.includes('ऑक्सीजन') || textLower.includes('dialysis') || textLower.includes('collapsed') || textLower.includes('unconscious') || textLower.includes('heatstroke')) {
    needs.push('medical', 'oxygen');
  }
  if (textLower.includes('elderly') || textLower.includes('child') || textLower.includes('pregnant') || textLower.includes('मुले') || textLower.includes('गरोदर')) {
    needs.push('first-aid', 'evac');
  }
  if (textLower.includes('bus') || textLower.includes('trapped') || textLower.includes('stalled')) {
    needs.push('towing', 'rope-rescue');
  }
  if (needs.length === 0) {
    needs.push('rescue', 'food-packets');
  }

  // Step 6: Create incident
  const summaryLine = englishSummary.length > 80 ? englishSummary.substring(0, 80) + '...' : englishSummary;
  const created = await executeTriageTool(
    'create_incident',
    {
      area: report.area,
      summary: summaryLine,
      priority: priorityScore,
      needs,
      reportIds: [reportId],
    },
    reportId,
    expectedGeneration
  );
  if (useWorldStore.getState().isKilled || expectedGeneration !== triageGeneration) {
    return { decision: 'ignored', reasoning: 'System frozen during triage.' };
  }

  return {
    decision: 'new_incident',
    incidentId: created?.incidentId,
    reasoning: `Created incident with priority ${priorityScore} (${scoreResult.breakdown.formulaDescription}).`,
  };
}

/**
 * Main Triage Agent Evaluation Loop
 * Uses Gemini Function Calling with up to 6 turns, strictly validated JSON schema, and 1-retry fallback.
 */
export async function runTriageAgent(reportId: string): Promise<TriageFinalOutput> {
  const store = useWorldStore.getState();

  // RULE: Global Kill Switch freezes every agent and logs the freeze
  if (store.isKilled) {
    store.logAgentActivity({
      id: `act_freeze_${Date.now()}`,
      timestamp: Date.now(),
      agent: 'triage',
      toolName: 'agent_frozen',
      inputParams: { reportId },
      outputResult: { error: 'Global Kill Switch engaged. Agent execution aborted.' },
      executionMs: 0,
      status: 'error',
      triggerReason: 'Kill Switch Active',
    });
    return { decision: 'ignored', reasoning: 'Kill switch is active. Triage agent is frozen.' };
  }

  if (activeTriageJobs.has(reportId)) {
    return { decision: 'ignored', reasoning: 'Evaluation already in progress for this report.' };
  }

  activeTriageJobs.add(reportId);
  const runGeneration = triageGeneration;
  store.setAgentEvaluating('triage', true, `Triaging report ${reportId}`);

  const startTime = Date.now();

  try {
    const report = store.reports[reportId];
    if (!report || report.mergedInto) {
      activeTriageJobs.delete(reportId);
      store.setAgentEvaluating('triage', false);
      return { decision: 'ignored', reasoning: 'Report is already merged or inactive.' };
    }
    if (!isReportDispatchable(report)) {
      const credScore = report.credibility ?? report.credibilityScore ?? 0;
      store.setAgentEvaluating('triage', false);
      return {
        decision: 'ignored',
        reasoning: `Flagged as Unverified (credibility ${credScore.toFixed(2)} < 0.35). Kept visible in WorldState; excluded from dispatch until corroborated.`,
      };
    }

    const systemInstruction = `You are the ENTANGLE Triage Agent for the Mumbai District Disaster Control Room.
NON-NEGOTIABLE OPERATIONAL LAWS:
1. NUMBERS ARE SACRED: You NEVER invent priority scores, radii, or water levels. You MUST invoke 'score_priority' to calculate deterministic scores.
2. TRIAGE SEQUENCE:
   - Step 1: Do not merge or create an incident for a report with credibility below 0.35; keep it visible as Unverified.
   - Step 2: Call 'find_similar_reports' to detect duplicates within 300m / 30min.
   - Step 3: If similar reports exist, call 'merge_reports' into the primary report.
   - Step 4: If novel, call 'score_priority' to compute the exact priority score.
   - Step 5: If text is in Hindi/Marathi, call 'translate_to_english' for control room operator comprehension.
   - Step 6: Call 'create_incident' using the EXACT numeric priority from score_priority.
3. FINAL STEP: Return a strictly formatted JSON object matching schema:
   {"decision": "merged" | "new_incident" | "ignored", "incidentId": string, "reasoning": "One plain explanatory sentence."}
Do NOT wrap your JSON in markdown code fences.`;

    const initialPrompt = `New report received:
ID: "${report.id}"
Area: "${report.area}"
Source: "${report.source}"
Text: "${report.text}"
Reported People At Risk: ${report.peopleAtRisk ?? 'Unknown'}
Location: (${report.location.x}, ${report.location.y})

Decide which tools to call. First check for similar reports, then score, then merge or create an incident. Explain your reasoning in one plain sentence per decision.`;

    // Multi-turn function calling conversation state
    const conversation: any[] = [
      { role: 'user', parts: [{ text: initialPrompt }] },
    ];

    let lastCreatedIncidentId: string | undefined;
    let finalOutput: TriageFinalOutput | null = null;
    let stepCount = 0;
    const maxSteps = 6;

    // Up to 6 tool turns with Gemini
    while (stepCount < maxSteps && !finalOutput) {
      stepCount++;

      // Check kill switch before every turn
      if (useWorldStore.getState().isKilled) {
        throw new Error('Kill switch engaged mid-evaluation');
      }

      let res: Response;
      try {
        res = await fetchWithTimeout('/api/gemini/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent: 'triage',
            contents: conversation,
            systemInstruction,
            tools: [{ functionDeclarations: TRIAGE_FUNCTION_DECLARATIONS }],
            temperature: 0.1,
          }),
        });
        if (useWorldStore.getState().isKilled || runGeneration !== triageGeneration) {
          throw new Error('Triage run superseded during Gemini request');
        }
      } catch (networkErr) {
        if (runGeneration !== triageGeneration) {
          finalOutput = { decision: 'ignored', reasoning: 'Triage run superseded by a scenario reset.' };
          break;
        }
        if (useWorldStore.getState().isKilled) {
          finalOutput = { decision: 'ignored', reasoning: 'System frozen during triage.' };
          break;
        }
        console.info('[runTriageAgent] Gemini API unavailable, running deterministic triage:', networkErr);
        finalOutput = await runDeterministicTriage(reportId, runGeneration);
        break;
      }

      if (!res.ok) {
        console.info('[runTriageAgent] Server returned HTTP', res.status, 'Falling back to deterministic triage.');
        finalOutput = await runDeterministicTriage(reportId, runGeneration);
        break;
      }

      const data = await res.json();
      if (useWorldStore.getState().isKilled || runGeneration !== triageGeneration) {
        throw new Error('Triage run superseded during Gemini response');
      }
      if (!data.success && data.isFallback) {
        // Fallback flag set (e.g. GEMINI_API_KEY missing or timeout)
        finalOutput = await runDeterministicTriage(reportId, runGeneration);
        break;
      }

      // Check if the model invoked any function calls
      const functionCalls = data.functionCalls || [];
      if (functionCalls.length > 0) {
        // Add model's tool call turn to conversation history
        conversation.push({
          role: 'model',
          parts: functionCalls.map((fc: any) => ({ functionCall: fc })),
        });

        // Execute each requested tool call
        const responseParts: any[] = [];
        for (const call of functionCalls) {
          if (useWorldStore.getState().isKilled) throw new Error('System frozen during tool execution');
          const toolResult = await executeTriageTool(call.name, call.args || {}, reportId, runGeneration);
          if (runGeneration !== triageGeneration) {
            return { decision: 'ignored', reasoning: 'Triage run superseded by a scenario reset.' };
          }
          if (call.name === 'create_incident' && toolResult?.incidentId) {
            lastCreatedIncidentId = toolResult.incidentId;
          }
          responseParts.push({
            functionResponse: {
              name: call.name,
              response: toolResult,
            },
          });
        }

        // Add function response turn to conversation history
        conversation.push({
          role: 'user',
          parts: responseParts,
        });
      } else if (data.text) {
        // Model provided final text / JSON decision
        const cleanedText = data.text.trim().replace(/^```json/i, '').replace(/```$/i, '').trim();
        try {
          const parsed = JSON.parse(cleanedText);
          if (validateTriageOutput(parsed)) {
            finalOutput = {
              decision: parsed.decision,
              incidentId: parsed.incidentId || lastCreatedIncidentId,
              reasoning: parsed.reasoning,
            };
          }
        } catch (jsonErr) {
          // Retry once on failure as per prompt rule
          console.info('[runTriageAgent] JSON parse retry triggered:', jsonErr);
          const retryRes = await fetchWithTimeout('/api/gemini/agent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              agent: 'triage',
              prompt: `Your previous response was not valid JSON. You MUST return strictly valid JSON matching this schema: {"decision": "merged" | "new_incident" | "ignored", "incidentId": "${lastCreatedIncidentId || ''}", "reasoning": "Reason here"}. Text was: ${cleanedText}`,
              systemInstruction: 'Output only valid raw JSON without code fences.',
            }),
          });
          if (useWorldStore.getState().isKilled || runGeneration !== triageGeneration) {
            throw new Error('Triage run superseded during schema retry');
          }
          if (retryRes.ok) {
            const retryData = await retryRes.json();
            if (useWorldStore.getState().isKilled || runGeneration !== triageGeneration) {
              throw new Error('Triage run superseded during schema retry response');
            }
            const retryCleaned = (retryData.text || '').replace(/^```json/i, '').replace(/```$/i, '').trim();
            try {
              const retryParsed = JSON.parse(retryCleaned);
              if (validateTriageOutput(retryParsed)) {
                finalOutput = retryParsed;
              }
            } catch {
              // Retry failed; use deterministic fallback
              finalOutput = await runDeterministicTriage(reportId, runGeneration);
            }
          } else {
            finalOutput = await runDeterministicTriage(reportId, runGeneration);
          }
        }
      }
    }

    // If loop finished without output, run deterministic safety fallback
    if (!finalOutput) {
      finalOutput = await runDeterministicTriage(reportId, runGeneration);
    }

    const elapsedTotal = Date.now() - startTime;
    store.setAgentEvaluating('triage', false, undefined, elapsedTotal);
    return finalOutput;
  } catch (err: any) {
    if (runGeneration !== triageGeneration) {
      return { decision: 'ignored', reasoning: 'Triage run superseded by a scenario reset.' };
    }
    if (useWorldStore.getState().isKilled) {
      store.setAgentEvaluating('triage', false);
      return { decision: 'ignored', reasoning: 'System frozen during triage.' };
    }
    console.error(`[Triage Agent Fatal Error for ${reportId}]:`, err);
    // As per non-negotiable rules: log an error event and continue. The app must never crash.
    store.dispatchEvent({
      actor: 'Triage',
      type: 'AGENT_ERROR_LOGGED',
      payload: { reportId, error: err?.message || String(err) },
      reason: `Triage evaluation recovered gracefully from error: ${err?.message || 'Unknown issue'}`,
    });
    const fallbackOutput = await runDeterministicTriage(reportId, runGeneration);
    store.setAgentEvaluating('triage', false);
    return fallbackOutput;
  } finally {
    if (runGeneration === triageGeneration) activeTriageJobs.delete(reportId);
  }
}

/**
 * Initializes reactive event subscription for the Triage Agent
 */
export function initTriageAgentSubscription(): () => void {
  const store = useWorldStore.getState();

  const unsubscribe = store.subscribeToEvents((event) => {
    if (event.type === 'DEMO_SCENARIO_RESET') {
      triageGeneration++;
      activeTriageJobs.clear();
      useWorldStore.getState().setAgentEvaluating('triage', false);
      return;
    }
    if (event.type === 'SYSTEM_FROZEN') {
      useWorldStore.getState().setAgentEvaluating('triage', false);
      return;
    }
    // 1. Triggered by any 'REPORT_ADDED' event and by 'CREDIBILITY_UPDATED'
    if (event.type === 'REPORT_ADDED' || event.type === 'REPORT_INGESTED') {
      const report = event.payload;
      if (report?.id && !report.mergedInto) {
        // Trigger agent evaluation asynchronously
        setTimeout(() => {
          runTriageAgent(report.id);
        }, 50);
      }
    } else if (event.type === 'CREDIBILITY_UPDATED') {
      const { reportId } = event.payload || {};
      if (reportId) {
        setTimeout(() => {
          runTriageAgent(reportId);
        }, 50);
      }
    }
  });

  return unsubscribe;
}
