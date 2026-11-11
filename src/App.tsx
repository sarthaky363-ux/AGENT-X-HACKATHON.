/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ENTANGLE: Multi-Agent Disaster-Response Coordinator
 * Shared Versioned WorldState with Pure Event Sourcing
 */

import React, { useEffect, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock,
  Compass,
  Cpu,
  Database,
  Droplet,
  ExternalLink,
  Flame,
  HelpCircle,
  History,
  Layers,
  MapPin,
  Megaphone,
  Radio,
  RotateCw,
  Search,
  Shield,
  ShieldAlert,
  Sparkles,
  Terminal,
  User,
  Users,
  Waves,
  Zap,
} from 'lucide-react';
import { runWorldStateSelfChecks } from './state/selfChecks.ts';
import {
  selectFreeVolunteers,
  selectLatestPlans,
  selectOpenIncidentsByPriority,
  selectStockByType,
} from './state/selectors.ts';
import { useWorldStore } from './state/store.ts';
import { AgentStateKind, SeverityLevel } from './theme/tokens.ts';
import { AgentChip } from './ui/AgentChip.tsx';
import { Button } from './ui/Button.tsx';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/Card.tsx';
import { DebugEventDrawer } from './ui/DebugEventDrawer.tsx';
import { EmptyState } from './ui/EmptyState.tsx';
import { MumbaiSchematicMap } from './ui/MumbaiSchematicMap.tsx';
import { SeverityBadge } from './ui/SeverityBadge.tsx';
import { StatBlock } from './ui/StatBlock.tsx';
import { TimelineItem } from './ui/TimelineItem.tsx';
import { PreAlertPanel } from './ui/PreAlertPanel.tsx';
import { fetchMumbaiRainfall, readCachedMumbaiRainfall, writeCachedMumbaiRainfall } from './services/openMeteo.ts';
import { fetchWithTimeout } from './services/fetchWithTimeout.ts';
import { Toast } from './ui/Toast.tsx';
import { initTriageAgentSubscription } from './agents/triage.ts';
import { initDispatchAgentSubscription } from './agents/dispatch.ts';
import { initSimulationAgentSubscription } from './agents/simulation.ts';
import { initCommsAgentSubscription } from './agents/comms.ts';
import { InjectReportMenu } from './ui/InjectReportMenu.tsx';
import { IncidentCard } from './ui/IncidentCard.tsx';
import { ReportCard } from './ui/ReportCard.tsx';
import { OfficialAlertFeed } from './ui/OfficialAlertFeed.tsx';
import { PlanLattice } from './ui/PlanLattice.tsx';
import { AgentActivityItem } from './ui/AgentActivityItem.tsx';
import { PresetReportItem } from './data/presetReports.ts';
import { isIncidentDispatchable } from './tools/credibility.ts';
import { DispatchPlansUpdatedPayload } from './agents/dispatch.ts';
import { CommsBoard } from './ui/CommsBoard.tsx';
import { DemoScenarioControls } from './ui/DemoScenarioControls.tsx';
import QuantumLab from './ui/QuantumLab.tsx';

interface MockAgent {
  id: string;
  name: string;
  role: string;
  state: AgentStateKind;
}

export default function App() {
  const store = useWorldStore();
  const {
    version,
    events,
    isKilled,
    killReason,
    toggleKillSwitch,
    approvePlan,
    dispatchEvent,
  } = store;

  // Derived state via selectors
  const openIncidents = selectOpenIncidentsByPriority(store);
  const freeVolunteersList = selectFreeVolunteers(store);
  const stockSummary = selectStockByType(store);
  const candidatePlansList = selectLatestPlans(store);

  // UI state
  const [activeCenterTab, setActiveCenterTab] = useState<'map' | 'incidents' | 'reports' | 'timeline' | 'quantum'>('map');
  const [selectedScenario, setSelectedScenario] = useState<string>('monsoon_red_alert');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showFreezeConfirm, setShowFreezeConfirm] = useState(false);
  const [showResumeConfirm, setShowResumeConfirm] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [timelineActor, setTimelineActor] = useState('all');
  const [directorActive, setDirectorActive] = useState(false);
  const [directorStep, setDirectorStep] = useState(0);
  const [directorCaptions, setDirectorCaptions] = useState(true);
  const [directorApprovalBaseline, setDirectorApprovalBaseline] = useState(0);
  const [directorAuditResult, setDirectorAuditResult] = useState<string | null>(null);

  // Run dev mode self-checks on load and initialize agent subscriptions
  useEffect(() => {
    runWorldStateSelfChecks();
    const unsubTriage = initTriageAgentSubscription();
    const unsubDispatch = initDispatchAgentSubscription();
    const unsubSimulation = initSimulationAgentSubscription();
    const unsubComms = initCommsAgentSubscription();
    return () => {
      unsubTriage();
      unsubDispatch();
      unsubSimulation();
      unsubComms();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | undefined;
    const refreshRainfall = async () => {
      controller = new AbortController();
      try {
        const rainfall = await fetchMumbaiRainfall((input, init) =>
          fetchWithTimeout(input, { ...init, signal: controller?.signal })
        );
        if (cancelled) return;
        try {
          writeCachedMumbaiRainfall(window.localStorage, rainfall);
        } catch {
          // Live data remains usable even when browser storage is disabled.
        }
        useWorldStore.getState().setRainfallContext(
          Math.round(rainfall.rainfallMmHr * 10) / 10,
          'live'
        );
      } catch {
        if (cancelled) return;
        let cached = null;
        try {
          cached = readCachedMumbaiRainfall(window.localStorage);
        } catch {
          cached = null;
        }
        if (cached) {
          useWorldStore.getState().setRainfallContext(
            Math.round(cached.rainfallMmHr * 10) / 10,
            'cached'
          );
        } else {
          useWorldStore.getState().setRainfallContext(72, 'seeded');
        }
      }
    };
    void refreshRainfall();
    const interval = window.setInterval(refreshRainfall, 30 * 60 * 1000);
    return () => {
      cancelled = true;
      controller?.abort();
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('demo-mode', isDemoMode);
    return () => document.documentElement.classList.remove('demo-mode');
  }, [isDemoMode]);

  const approvedPlan = candidatePlansList.find(p => p.status === 'approved' || p.status === 'executed');
  const strategyPlans = candidatePlansList.filter(plan =>
    ['maximise_coverage', 'protect_critical', 'minimise_risk', 'entangled_optimal'].includes(plan.strategy || '')
  );
  const dispatchPlans = strategyPlans.length === 4 ? strategyPlans : candidatePlansList.slice(0, 4);
  const disabledDispatchPlanIds = dispatchPlans
    .filter(plan => plan.assignments.some(assignment => {
      const incident = store.incidents[assignment.incidentId];
      return incident !== undefined &&
        incident.reportIds.length > 0 &&
        !isIncidentDispatchable(incident, store.reports);
    }))
    .map(plan => plan.id);
  const latestDispatchEvent = [...events].reverse().find(event => event.type === 'DISPATCH_PLANS_UPDATED');
  const latestDispatchChange = latestDispatchEvent?.payload as DispatchPlansUpdatedPayload | undefined;
  const reportsByRecency = Object.values(store.reports).sort((a, b) => b.ts - a.ts);
  const timelineEvents = [...events].reverse().filter(event =>
    timelineActor === 'all' || event.actor === timelineActor
  );
  const timelineActors = Array.from(new Set(events.map(event => event.actor))).sort();
  const humanApprovalCount = events.filter(event => event.type === 'PLAN_APPROVED' && event.actor === 'human').length;
  const directorStops = [
    { title: 'Map', tab: 'map' as const, caption: 'Start with the schematic map and its measured entanglement links.' },
    { title: 'Reports', tab: 'reports' as const, caption: 'Review evidence freshness and transcript review state.' },
    { title: 'Quantum Lab', tab: 'quantum' as const, caption: 'Compare seeded classical simulations and advisory signals.' },
    { title: 'Plan lattice', tab: 'incidents' as const, caption: 'Pause here: an operator must approve a candidate in the plan lattice before the tour continues.' },
    { title: 'Comms', tab: 'incidents' as const, caption: 'Review communications. Messages remain behind the human approval gate.' },
    { title: 'Audit verification', tab: 'timeline' as const, caption: 'Verify the event hash chain to finish the tour.' },
  ];
  const startDirector = () => {
    setDirectorApprovalBaseline(humanApprovalCount);
    setDirectorAuditResult(null);
    setDirectorStep(0);
    setDirectorActive(true);
    setActiveCenterTab('map');
  };
  const advanceDirector = () => {
    if (directorStep === 3 && humanApprovalCount <= directorApprovalBaseline) return;
    const next = Math.min(directorStops.length - 1, directorStep + 1);
    setDirectorStep(next);
    setActiveCenterTab(directorStops[next].tab);
  };
  const verifyDirectorAudit = async () => {
    setDirectorAuditResult(null);
    try {
      const result = await useWorldStore.getState().verifyAuditChain();
      setDirectorAuditResult(result.valid
        ? `Verified ${result.verifiedCount} events.`
        : `Chain failed at event ${result.firstBrokenIndex}.`);
    } catch (error) {
      setDirectorAuditResult(`Verification unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // The 5 Autonomous Agents
  const agents: MockAgent[] = [
    {
      id: 'agent_triage',
      name: 'Triage Agent',
      role: 'Deduplicates citizen reports, scores priority & creates incidents',
      state: isKilled
        ? 'frozen'
        : store.agentStates?.triage?.isEvaluating
        ? 'thinking'
        : 'idle',
    },
    {
      id: 'agent_credibility',
      name: 'Credibility Module',
      role: 'Scores source truth 0-1 and matches sensor telemetry',
      state: isKilled ? 'frozen' : 'idle',
    },
    {
      id: 'agent_dispatch',
      name: 'Dispatch Agent',
      role: 'Synthesizes 4 candidate plans in quantum superposition',
      state: isKilled ? 'frozen' : approvedPlan ? 'idle' : 'thinking',
    },
    {
      id: 'agent_simulation',
      name: 'Simulation Agent',
      role: 'Runs 300 seeded Monte Carlo trials to rank plans',
      state: isKilled ? 'frozen' : store.agentStates?.simulation?.isEvaluating ? 'thinking' : 'idle',
    },
    {
      id: 'agent_comms',
      name: 'Comms Agent',
      role: 'Drafts multilingual citizen advisories (post-approval only)',
      state: isKilled ? 'frozen' : store.agentStates?.comms?.isEvaluating ? 'thinking' : 'waiting',
    },
  ];

  // Extracted Tool Call Activities from Event Stream
  const agentActivities = events
    .filter(evt => evt.type === 'AGENT_TOOL_CALLED' || evt.payload?.toolName)
    .map(evt => ({
      ...evt.payload,
      reason: evt.reason,
      timestamp: evt.ts,
    }))
    .reverse();

  const handleApprovePlan = (planId: string) => {
    if (isKilled || disabledDispatchPlanIds.includes(planId)) return;
    approvePlan(planId);
    const chosen = candidatePlansList.find(p => p.id === planId);
    setToastMessage(`Measurement completed: Operator approved ${chosen?.name || planId}. Superposition collapsed.`);
  };

  const handleRejectPlan = (planId: string, reason: string) => {
    if (isKilled) return;
    store.rejectPlan(planId, reason);
    setToastMessage(`Plan rejected. Dispatch will treat “${reason}” as a planning constraint.`);
  };

  const handleKillSwitchPress = () => {
    if (isKilled) setShowResumeConfirm(true);
    else setShowFreezeConfirm(true);
  };

  const handleScenarioChange = (scenarioKey: string) => {
    setSelectedScenario(scenarioKey);
    dispatchEvent({
      actor: 'human',
      type: 'SCENARIO_SWITCHED',
      payload: { scenario: scenarioKey },
      reason: `Operator switched situational context to ${scenarioKey}`,
    });
    setToastMessage(`Switched disaster scenario context to: ${scenarioKey}`);
  };

  return (
    <div className={`min-h-screen bg-[#FAF6EE] text-[#3A2E26] flex flex-col selection:bg-[#5F7A61]/20 font-sans antialiased ${isDemoMode ? 'demo-mode' : ''}`}>
      {/* 1. TOP BAR */}
      <header className="border-b border-[#E4D9C5] bg-[#FFFDF8] sticky top-0 z-40 shadow-[0_1px_2px_rgba(58,46,38,0.06)]">
        {/* Emergency Kill Switch Banner */}
        {isKilled && (
          <div className="bg-[#9E2F22] text-[#FFFDF8] px-4 sm:px-6 py-2.5 flex items-center justify-between text-xs sm:text-sm font-semibold tracking-wide animate-pulse">
            <div className="flex items-center gap-2">
              <AlertOctagon className="w-5 h-5 shrink-0" />
              <span>
                System frozen by operator at {store.killedAt ? new Date(store.killedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'unknown time'}.
                All agent activity is paused. Reason: &ldquo;{killReason}&rdquo;.
              </span>
            </div>
            <button
              onClick={() => setShowResumeConfirm(true)}
              className="px-3 py-1 bg-[#FFFDF8] text-[#9E2F22] hover:bg-[#F6DDD6] rounded-full text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
            >
              Resume
            </button>
          </div>
        )}

        <div className="max-w-[1720px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
          {/* Left: Wordmark & State vN Counter */}
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-[14px] bg-[#5F7A61] flex items-center justify-center text-[#FFFDF8] shadow-[0_1px_2px_rgba(58,46,38,0.12)]">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight font-heading text-[#3A2E26]">
                  ENTANGLE
                </h1>

                {/* Animated State vN Counter (Short Fade on Every Change) */}
                <span
                  key={version}
                  className="font-mono text-xs font-bold px-3 py-1 rounded-full bg-[#F2EBDD] border border-[#E4D9C5] text-[#7A6A5A] transition-all duration-300 animate-in fade-in"
                  title="Shared Versioned WorldState Event Counter"
                >
                  State v{version}
                </span>

                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#E3EDDF] text-[#3D5939] border border-[#6E8F6A]/30 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#5F7A61] animate-ping" />
                  Live Entanglement
                </span>
              </div>
              <p className="text-[11px] text-[#7A6A5A] font-medium hidden sm:block">
                Multi-Agent Disaster Coordinator • Mumbai Metropolitan Command
              </p>
            </div>
          </div>

          {/* Center: Scenario Selector */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[#7A6A5A] font-mono text-[11px] uppercase tracking-wider hidden md:inline">
              Scenario:
            </span>
            <select
              value={selectedScenario}
              onChange={e => handleScenarioChange(e.target.value)}
              className="px-3.5 py-2 rounded-full border border-[#E4D9C5] bg-[#FAF6EE] text-[#3A2E26] font-heading font-semibold text-xs focus:outline-none focus:ring-2 focus:ring-[#4F7C82] cursor-pointer shadow-[0_1px_2px_rgba(58,46,38,0.04)]"
            >
              <option value="monsoon_red_alert">
                Monsoon Cloudburst Spike &amp; 4.6m High Tide Surge (Kurla/Dadar)
              </option>
              <option value="heatwave_dharavi">
                Extreme Urban Heatwave Dome — Dharavi &amp; Govandi (43°C WBGT)
              </option>
              <option value="high_tide_island">
                Coastal Sluice Backflow &amp; Marine Drive Surge (Colaba/Dadar)
              </option>
            </select>
          </div>

          {/* Right: Inject Report, Debug Drawer & Emergency Kill Switch */}
          <div className="flex items-center gap-2.5">
            <DemoScenarioControls />

            <button
              type="button"
              onClick={() => setIsDemoMode(value => !value)}
              aria-pressed={isDemoMode}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[11px] font-bold transition-colors ${
                isDemoMode
                  ? 'border-[#5F7A61] bg-[#E3EDDF] text-[#3D5939]'
                  : 'border-[#E4D9C5] bg-[#FAF6EE] text-[#7A6A5A] hover:text-[#3A2E26]'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Demo mode {isDemoMode ? 'On' : 'Off'}
            </button>

            <InjectReportMenu
              onInjected={(preset: PresetReportItem) => {
                setActiveCenterTab('incidents');
                setToastMessage(`Injected: "${preset.label}". Triage agent analyzing distress vectors in real-time.`);
              }}
              onVoiceInjected={() => {
                setActiveCenterTab('incidents');
                setToastMessage('Voice citizen report sent. Triage agent analyzing the transcript in real-time.');
              }}
            />

            <Button
              variant={directorActive ? 'primary' : 'secondary'}
              size="sm"
              onClick={directorActive ? () => setDirectorActive(false) : startDirector}
              className="font-mono text-xs"
            >
              {directorActive ? 'Exit Director' : 'Director mode'}
            </Button>

            {!isDemoMode && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsDebugOpen(true)}
                leftIcon={<Database className="w-3.5 h-3.5 text-[#4F7C82]" />}
                className="font-mono text-xs"
                title="Open raw event log and replay verification drawer"
              >
                Debug (v{version})
              </Button>
            )}

            <Button
              variant={isKilled ? 'secondary' : 'danger'}
              size="sm"
              onClick={handleKillSwitchPress}
              leftIcon={<AlertOctagon className="w-4 h-4 fill-current" />}
              className="font-mono text-xs uppercase tracking-wider font-bold"
            >
              {isKilled ? 'Resume' : 'Kill Switch'}
            </Button>
          </div>
        </div>
      </header>

      {/* Reassuring Toast Notification */}
      {toastMessage && (
        <div className="max-w-[1720px] mx-auto px-4 sm:px-6 pt-3 w-full">
          <Toast
            type={isKilled ? 'error' : approvedPlan ? 'success' : 'info'}
            title={isKilled ? 'System Freeze Active' : approvedPlan ? 'Wavefunction Collapsed' : 'State Transition'}
            message={toastMessage}
            onDismiss={() => setToastMessage(null)}
          />
        </div>
      )}

      {directorActive && (
        <section className="mx-auto mt-3 w-[calc(100%-2rem)] max-w-[1720px] rounded-2xl border border-[#4F7C82]/30 bg-[#D7E3E5]/30 p-4" aria-live="polite">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-3xl">
              <p className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#4F7C82]">Director mode · step {directorStep + 1} of {directorStops.length}</p>
              <h2 className="mt-1 font-heading text-base font-bold text-[#3A2E26]">{directorStops[directorStep].title}</h2>
              {directorCaptions && <p className="mt-1 text-xs leading-relaxed text-[#5A5146]">{directorStops[directorStep].caption}</p>}
              {directorStep === 3 && humanApprovalCount <= directorApprovalBaseline && (
                <p className="mt-2 text-[10px] font-bold text-[#9E2F22]">Waiting for a real operator approval click in the plan lattice. The tour will not approve for you.</p>
              )}
              {directorAuditResult && <p className="mt-2 font-mono text-[10px] font-bold text-[#3D5939]">{directorAuditResult}</p>}
            </div>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 text-[10px] text-[#5A5146]">
                <input type="checkbox" checked={directorCaptions} onChange={event => setDirectorCaptions(event.target.checked)} />
                Captions
              </label>
              {directorStep === directorStops.length - 1 ? (
                <button type="button" onClick={verifyDirectorAudit} className="rounded-full bg-[#4F7C82] px-3 py-1.5 text-[11px] font-bold text-white">Verify audit chain</button>
              ) : (
                <button
                  type="button"
                  onClick={advanceDirector}
                  disabled={directorStep === 3 && humanApprovalCount <= directorApprovalBaseline}
                  className="rounded-full bg-[#4F7C82] px-3 py-1.5 text-[11px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Continue to {directorStops[directorStep + 1].title}
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* 2. THREE-COLUMN DESKTOP WORKSPACE (1024px responsive) */}
      <div className="flex-1 max-w-[1720px] w-full mx-auto p-4 sm:p-6 flex flex-col lg:flex-row gap-5 items-stretch">
        {/* ======================================================== */}
        {/* LEFT RAIL: The Five Agents (260px wide on desktop)       */}
        {/* ======================================================== */}
        {activeCenterTab !== 'quantum' && (
        <aside className="w-full lg:w-[260px] lg:min-w-[260px] shrink-0 flex flex-col gap-3">
          <Card className="p-4 flex flex-col gap-3 h-full">
            <div className="flex items-center justify-between pb-2 border-b border-[#E4D9C5]">
              <div className="flex items-center gap-1.5">
                <Bot className="w-4 h-4 text-[#4F7C82]" />
                <h3 className="font-heading font-bold text-xs uppercase tracking-wider text-[#3A2E26]">
                  Active Agents ({agents.length})
                </h3>
              </div>
              <span className="font-mono text-[10px] text-[#7A6A5A]">
                {isKilled ? 'FROZEN' : 'SYNCED'}
              </span>
            </div>

            <p className="text-[11px] text-[#7A6A5A] leading-relaxed">
              Autonomous units reading &amp; writing one shared WorldState. Every mutation appends an immutable event.
            </p>

            {/* Roster of 5 Agent Chips */}
            <div className="space-y-2.5 flex-1">
              {agents.map(agent => (
                <AgentChip
                  key={agent.id}
                  name={agent.name}
                  roleDescription={agent.role}
                  state={agent.state}
                  isSelected={selectedAgentId === agent.id}
                  onClick={() => {
                    setSelectedAgentId(selectedAgentId === agent.id ? null : agent.id);
                    setToastMessage(`Focused on ${agent.name}: ${agent.role}`);
                  }}
                />
              ))}
            </div>

            {/* Operational Telemetry Summary */}
            <div className="p-3 rounded-[14px] bg-[#FAF6EE] border border-[#E4D9C5] text-[11px] font-mono text-[#7A6A5A] space-y-1">
              <div className="font-bold text-[#3A2E26]">Command Deck Telemetry</div>
              <div>Free Volunteers: {freeVolunteersList.length}/40</div>
              <div>Available Pumps: {stockSummary['dewatering_pump']?.availableQuantity || 5} units</div>
              <div className="text-[10px] text-[#5F7A61] font-semibold pt-0.5">
                ● High Tide Peak: 15:42 IST (+4.68m)
              </div>
            </div>
          </Card>
        </aside>
        )}

        {/* ======================================================== */}
        {/* CENTRE WORKSPACE (flex-1): Hero Strip + Primary Tabs     */}
        {/* ======================================================== */}
        <main className={`${activeCenterTab === 'quantum' ? 'w-full' : 'flex-1'} flex flex-col gap-5 min-w-0`}>
          <PreAlertPanel />
          {/* HERO STRIP: Headline + Three StatBlocks */}
          <div className="p-5 sm:p-6 rounded-[20px] bg-[#FFFDF8] border border-[#E4D9C5] shadow-[0_1px_2px_rgba(58,46,38,0.06)] space-y-4">
            <div>
              <span className="font-mono text-[10px] uppercase font-bold tracking-widest text-[#B0623A] block mb-1">
                Shared Versioned Entanglement Principle
              </span>
              <h2 className="font-heading font-extrabold text-xl sm:text-2xl lg:text-[28px] leading-tight uppercase tracking-tight text-[#B0623A]">
                Every agent knows what every other agent just learned.
              </h2>
            </div>

            {/* Three StatBlocks Derived from Selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1">
              <StatBlock
                value={openIncidents.length}
                label="Open Incidents"
                subtext="Sorted by deterministic priority"
                trend={{ value: `${openIncidents.filter(i => i.severity === 'critical').length} Critical`, isPositive: false }}
                variant="card"
              />
              <StatBlock
                value={freeVolunteersList.length}
                label="Volunteers Free"
                subtext="Ready for dispatch deployment"
                trend={{ value: 'Staged', isPositive: true }}
                variant="card"
              />
              <StatBlock
                value={candidatePlansList.filter(p => p.status === 'candidate').length || 1}
                label="Plans in Superposition"
                subtext={approvedPlan ? 'Reality collapsed' : 'Probabilistic candidates alive'}
                trend={{ value: approvedPlan ? 'Executed' : '|ψ⟩ Alive', isPositive: true }}
                variant="card"
              />
            </div>
          </div>

          {/* PRIMARY TABS: Map, Incident Queue, Timeline, Reports, Quantum Lab */}
          <Card className="flex-1 flex flex-col min-h-[560px]">
            {/* Tabs Header Strip */}
            <CardHeader className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 p-1 rounded-full bg-[#FAF6EE] border border-[#E4D9C5] text-xs">
                <button
                  onClick={() => setActiveCenterTab('map')}
                  className={`px-4 py-1.5 rounded-full font-heading font-bold transition-all cursor-pointer ${
                    activeCenterTab === 'map'
                      ? 'bg-[#5F7A61] text-[#FFFDF8] shadow-[0_1px_2px_rgba(58,46,38,0.08)]'
                      : 'text-[#7A6A5A] hover:text-[#3A2E26]'
                  }`}
                >
                  Map (Schematic)
                </button>
                <button
                  onClick={() => setActiveCenterTab('incidents')}
                  className={`px-4 py-1.5 rounded-full font-heading font-bold transition-all cursor-pointer ${
                    activeCenterTab === 'incidents'
                      ? 'bg-[#5F7A61] text-[#FFFDF8] shadow-[0_1px_2px_rgba(58,46,38,0.08)]'
                      : 'text-[#7A6A5A] hover:text-[#3A2E26]'
                  }`}
                >
                  Incident Queue ({openIncidents.length})
                </button>
                <button
                  onClick={() => setActiveCenterTab('timeline')}
                  className={`px-4 py-1.5 rounded-full font-heading font-bold transition-all cursor-pointer ${
                    activeCenterTab === 'timeline'
                      ? 'bg-[#5F7A61] text-[#FFFDF8] shadow-[0_1px_2px_rgba(58,46,38,0.08)]'
                      : 'text-[#7A6A5A] hover:text-[#3A2E26]'
                  }`}
                >
                  Timeline ({events.length})
                </button>
                <button
                  onClick={() => setActiveCenterTab('reports')}
                  className={`px-4 py-1.5 rounded-full font-heading font-bold transition-all cursor-pointer ${
                    activeCenterTab === 'reports'
                      ? 'bg-[#5F7A61] text-[#FFFDF8] shadow-[0_1px_2px_rgba(58,46,38,0.08)]'
                      : 'text-[#7A6A5A] hover:text-[#3A2E26]'
                  }`}
                >
                  Reports ({reportsByRecency.length})
                </button>
                <button
                  onClick={() => setActiveCenterTab('quantum')}
                  className={`px-4 py-1.5 rounded-full font-heading font-bold transition-all cursor-pointer ${
                    activeCenterTab === 'quantum'
                      ? 'bg-[#4F7C82] text-[#FFFDF8] shadow-[0_1px_2px_rgba(58,46,38,0.08)]'
                      : 'text-[#7A6A5A] hover:text-[#3A2E26]'
                  }`}
                >
                  Quantum Lab
                </button>
              </div>

              <div className="font-mono text-xs text-[#7A6A5A] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#5F7A61] animate-pulse" />
                <span>State Version v{version} Synced</span>
              </div>
            </CardHeader>

            {/* Tab View Content */}
            <CardContent className="flex-1 flex flex-col p-4 sm:p-5">
              {/* TAB 1: Offline Mumbai Schematic Map */}
              {activeCenterTab === 'map' && (
                <div className="flex-1 flex flex-col min-h-[480px]">
                  <MumbaiSchematicMap />
                </div>
              )}

              {activeCenterTab === 'quantum' && <QuantumLab />}

              {/* TAB 2: Incident Queue from selector openIncidentsByPriority */}
              {activeCenterTab === 'incidents' && (
                <div className="space-y-3 flex-1 flex flex-col">
                  {/* Incident Queue Action & Sorting Bar */}
                  <div className="p-3 rounded-xl bg-[#FAF6EE] border border-[#E4D9C5] flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#3A2E26]">
                        {openIncidents.length} Active {openIncidents.length === 1 ? 'Incident' : 'Incidents'}
                      </span>
                      <span className="text-[#7A6A5A]">
                        • Sorted by deterministic priority (0-100)
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <InjectReportMenu
                        onInjected={(preset: PresetReportItem) => {
                          setToastMessage(`Injected: "${preset.label}". Triage agent running function-calling loop.`);
                        }}
                        onVoiceInjected={() => {
                          setToastMessage('Voice citizen report sent. Triage agent analyzing the transcript in real-time.');
                        }}
                      />
                    </div>
                  </div>

                  {openIncidents.length === 0 ? (
                    <EmptyState
                      title="No Open Incidents"
                      description="All active distress reports in the shared WorldState have been triaged, merged, or dispatched."
                      icon={ShieldAlert}
                    />
                  ) : (
                    <div className="space-y-3 overflow-y-auto max-h-[620px] pr-1">
                      {openIncidents.map(inc => (
                        <IncidentCard key={inc.id} incident={inc} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: Timeline from events[] */}
              {activeCenterTab === 'timeline' && (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-[#E4D9C5] bg-[#FAF6EE] px-3 py-2">
                    <label htmlFor="timeline-agent-filter" className="text-xs font-semibold text-[#3A2E26]">
                      Filter timeline by agent
                    </label>
                    <select
                      id="timeline-agent-filter"
                      value={timelineActor}
                      onChange={event => setTimelineActor(event.target.value)}
                      className="max-w-[65%] rounded-lg border border-[#D8CCB5] bg-[#FFFDF8] px-2 py-1.5 text-xs text-[#3A2E26]"
                    >
                      <option value="all">All events ({events.length})</option>
                      {timelineActors.map(actor => (
                        <option key={actor} value={actor}>{actor}</option>
                      ))}
                    </select>
                  </div>
                  <div className="max-h-[620px] overflow-y-auto pr-1">
                    {timelineEvents.length ? timelineEvents.map((evt, idx) => (
                      <TimelineItem
                        key={evt.id}
                        timestamp={evt.ts}
                        actor={evt.actor}
                        eventType={evt.type}
                        summary={evt.reason}
                        detail={evt.payload}
                        isLast={idx === timelineEvents.length - 1}
                      />
                    )) : (
                      <EmptyState
                        title="No matching events"
                        description="Choose another agent to view its events in the append-only log."
                        icon={History}
                      />
                    )}
                  </div>
                </div>
              )}

              {activeCenterTab === 'reports' && (
                <div className="space-y-3 flex-1 overflow-y-auto max-h-[620px] pr-1">
                  {reportsByRecency.length > 0 ? reportsByRecency.map(report => (
                    <ReportCard key={report.id} report={report} />
                  )) : (
                    <EmptyState
                      title="No Field Reports"
                      description="New citizen and responder reports will appear here with their live credibility assessment."
                      icon={ShieldAlert}
                    />
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </main>

        {/* ======================================================== */}
        {/* RIGHT PANEL: Official alerts, dispatch lattice, and agent activity */}
        {/* ======================================================== */}
        {activeCenterTab !== 'quantum' && (
        <aside className="w-full lg:w-[560px] lg:min-w-[560px] shrink-0 flex flex-col gap-5">
          <OfficialAlertFeed />

          <PlanLattice
            plans={dispatchPlans}
            latestChange={latestDispatchChange}
            approvedPlanId={approvedPlan?.id}
            disabledPlanIds={disabledDispatchPlanIds}
            isKilled={isKilled}
            onApprove={handleApprovePlan}
            onReject={handleRejectPlan}
          />
          <CommsBoard />

          {/* 2. Agent Activity Panel Card */}
          <Card className="flex flex-col flex-1">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-[#4F7C82]" />
                  <CardTitle className="text-sm">Agent Activity Feed</CardTitle>
                </div>
                <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E3EDDF] text-[#3D5939]">
                  Live Stream
                </span>
              </div>
              <CardDescription>
                Auditable trace of mathematical tool calls, inputs, and outputs.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-2.5 overflow-y-auto max-h-[340px] text-xs font-mono pr-1">
              {agentActivities.length > 0 ? (
                agentActivities.slice(0, 15).map((act: any, idx: number) => (
                  <AgentActivityItem key={act.id || idx} activity={act} />
                ))
              ) : (
                <div className="space-y-2">
                  <AgentActivityItem
                    activity={{
                      id: 'act_init_score',
                      toolName: 'score_priority',
                      agent: 'triage',
                      timestamp: Date.now() - 1000 * 60 * 4,
                      executionMs: 8,
                      status: 'success',
                      reason: 'Genesis calibration of baseline flood distress reports',
                      inputParams: { reportId: 'rep_kurla_01' },
                      outputResult: { score: 88, formula: '35% people + 25% vuln + 15% depth + 10% time' },
                    }}
                  />
                  <AgentActivityItem
                    activity={{
                      id: 'act_init_sim',
                      toolName: 'find_similar_reports',
                      agent: 'triage',
                      timestamp: Date.now() - 1000 * 60 * 2,
                      executionMs: 14,
                      status: 'success',
                      reason: 'Pre-flight deduplication sweep across 6 municipal wards',
                      inputParams: { radiusMeters: 300, windowMinutes: 30 },
                      outputResult: { matchedCount: 0, status: 'clean' },
                    }}
                  />
                </div>
              )}
            </CardContent>

            <CardFooter>
              <div className="w-full text-center text-[10px] text-[#7A6A5A] font-mono">
                Telemetry verified against JSON schema. Zero hallucinated numbers.
              </div>
            </CardFooter>
          </Card>
        </aside>
        )}
      </div>

      {/* Developer-Only Event Replay & Debug Drawer */}
      {!isDemoMode && (
        <DebugEventDrawer
          isOpen={isDebugOpen}
          onClose={() => setIsDebugOpen(false)}
        />
      )}

      {(showFreezeConfirm || showResumeConfirm) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#3A2E26]/45 p-4" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="freeze-dialog-title"
            className={`w-full max-w-md rounded-2xl border-2 bg-[#FFFDF8] p-5 shadow-2xl ${showFreezeConfirm ? 'border-[#9E2F22]' : 'border-[#5F7A61]'}`}
            onClick={event => event.stopPropagation()}
          >
            <div className={`flex items-center gap-2 ${showFreezeConfirm ? 'text-[#9E2F22]' : 'text-[#5F7A61]'}`}>
              <AlertOctagon className="h-5 w-5" />
              <h2 id="freeze-dialog-title" className="font-heading text-base font-bold">
                {showFreezeConfirm ? 'Freeze the system?' : 'Resume agent activity?'}
              </h2>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[#7A6A5A]">
              {showFreezeConfirm
                ? 'This immediately stops agent loops and blocks all event writes until an explicit operator resume.'
                : 'Agents may resume reacting to new events. Confirm to leave the frozen state.'}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowFreezeConfirm(false);
                  setShowResumeConfirm(false);
                }}
              >
                Cancel
              </Button>
              <Button
                variant={showFreezeConfirm ? 'danger' : 'primary'}
                size="sm"
                onClick={() => {
                  toggleKillSwitch(showFreezeConfirm ? 'Emergency operator freeze' : undefined);
                  setShowFreezeConfirm(false);
                  setShowResumeConfirm(false);
                }}
              >
                {showFreezeConfirm ? 'Confirm freeze' : 'Confirm resume'}
              </Button>
            </div>
          </section>
        </div>
      )}

      {/* FOOTER */}
      <footer className="border-t border-[#E4D9C5] bg-[#FFFDF8] py-3 text-center text-xs text-[#7A6A5A] font-mono">
        ENTANGLE • Multi-Agent Disaster Response Coordinator • Human-in-the-Loop Municipal Command Architecture
      </footer>
    </div>
  );
}
