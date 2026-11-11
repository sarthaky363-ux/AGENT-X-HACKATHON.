/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Control Room Header & Global Kill Switch
 */

import React, { useState } from 'react';
import {
  AlertOctagon,
  Bot,
  CloudRain,
  Database,
  Download,
  History,
  Play,
  RotateCcw,
  Sparkles,
  Waves,
  Zap,
} from 'lucide-react';
import { useWorldStore } from '../state/store.ts';

interface HeaderProps {
  onOpenLedger: () => void;
  onOpenInjectModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenLedger, onOpenInjectModal }) => {
  const {
    version,
    isKilled,
    killReason,
    killedAt,
    context,
    rainfallSource,
    agentStates,
    toggleKillSwitch,
    resetToInitialDemo,
  } = useWorldStore();

  const [showKillConfirm, setShowKillConfirm] = useState(false);
  const [showResumeConfirm, setShowResumeConfirm] = useState(false);
  const [killInputReason, setKillInputReason] = useState('Emergency Manual Pause by Duty Officer');

  const handleToggleKill = () => {
    if (!isKilled) {
      setShowKillConfirm(true);
    } else {
      setShowResumeConfirm(true);
    }
  };

  const confirmEngageKill = () => {
    toggleKillSwitch(killInputReason || 'Operator Manual Freeze');
    setShowKillConfirm(false);
  };

  const agentList: { role: string; label: string }[] = [
    { role: 'triage', label: 'Triage' },
    { role: 'credibility', label: 'Credibility' },
    { role: 'dispatch', label: 'Dispatch' },
    { role: 'simulation', label: 'Simulation' },
    { role: 'comms', label: 'Comms' },
  ];

  return (
    <header className="border-b border-[#E4D9C5] bg-[#FFFDF8] sticky top-0 z-40 shadow-xs">
      {/* Kill Switch Banner when Active */}
      {isKilled && (
        <div className="bg-[#9E2F22] text-[#FFFDF8] px-4 py-2.5 flex items-center justify-between text-sm font-semibold tracking-wide animate-pulse">
          <div className="flex items-center gap-2 max-w-4xl">
            <AlertOctagon className="w-5 h-5 shrink-0" />
            <span>
              System frozen by operator at {killedAt ? new Date(killedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'unknown time'}.
              All agent activity is paused. Reason: &ldquo;{killReason}&rdquo;.
            </span>
          </div>
          <button
            onClick={() => setShowResumeConfirm(true)}
            className="px-4 py-1 bg-white text-[#9E2F22] hover:bg-[#F6DDD6] rounded-full text-xs font-bold uppercase tracking-wider transition-colors"
          >
            Resume
          </button>
        </div>
      )}

      {/* Main Header Bar */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
        {/* Brand & WorldState Version */}
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-[#5F7A61] flex items-center justify-center text-white shadow-xs">
            <Zap className="w-5 h-5 fill-current" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight text-[#3A2E26] font-heading">
                ENTANGLE
              </h1>
              <span className="font-mono text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#F2EBDD] border border-[#E4D9C5] text-[#7A6A5A]">
                State: v{version}
              </span>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#E3EDDF] text-[#3D5939] border border-[#6E8F6A]/30">
                Live Entanglement
              </span>
            </div>
            <p className="text-xs text-[#7A6A5A]">
              District Disaster Control Room — Mumbai Metropolitan Ops
            </p>
          </div>
        </div>

        {/* Environmental Context Pill */}
        <div className="hidden lg:flex items-center gap-4 px-3.5 py-1.5 rounded-full bg-[#F2EBDD] border border-[#E4D9C5] text-xs text-[#3A2E26]">
          <div className="flex items-center gap-1.5 font-medium">
            <CloudRain className="w-3.5 h-3.5 text-[#4F7C82]" />
            <span>Rain: {context.rainfallMmHr} mm/hr</span>
          </div>
          <span
            title="Open-Meteo public weather data or seeded fallback; never an official alert."
            className={`rounded-full px-2 py-0.5 text-[9px] font-mono font-bold uppercase ${
              rainfallSource === 'live'
                ? 'bg-[#D7E3E5] text-[#315D63]'
                : rainfallSource === 'cached'
                ? 'bg-[#F8E6CC] text-[#8A571C]'
                : 'bg-[#E4D9C5] text-[#7A6A5A]'
            }`}
          >
            {rainfallSource === 'live' ? 'Live weather' : rainfallSource === 'cached' ? 'Cached weather' : 'Seeded fallback'}
          </span>
          <span className="text-[#E4D9C5]">|</span>
          <div className="flex items-center gap-1.5 font-medium">
            <Waves className="w-3.5 h-3.5 text-[#B0623A]" />
            <span>High Tide: {context.highTideTime}</span>
          </div>
          <span className="text-[#E4D9C5]">|</span>
          <span className="font-bold text-[#B8412F] uppercase text-[11px] tracking-wide">
            {context.activeMonsoonWarning}
          </span>
        </div>

        {/* Agent Activity Status Strip */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-[#FAF6EE] border border-[#E4D9C5]">
          <span className="text-[11px] uppercase font-mono font-bold text-[#7A6A5A] mr-1 hidden sm:inline">
            Agents:
          </span>
          <div className="flex items-center gap-1.5">
            {agentList.map(({ role, label }) => {
              const state = agentStates[role];
              const isEval = state?.isEvaluating;
              return (
                <div
                  key={role}
                  className={`flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium transition-all ${
                    isKilled
                      ? 'bg-[#E8E6E0] text-[#66645F] border border-[#D2D0CA]'
                      : isEval
                      ? 'bg-[#4F7C82] text-white animate-pulse shadow-xs'
                      : 'bg-[#FFFDF8] border border-[#E4D9C5] text-[#3A2E26]'
                  }`}
                  title={`${label} Agent: ${isEval ? `Evaluating (${state?.currentTask || 'thinking'})...` : `Idle (last ran: ${state?.lastLatencyMs || 0}ms)`}`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isKilled ? 'bg-[#8A8A86]' : isEval ? 'bg-white' : 'bg-[#5F7A61]'
                    }`}
                  />
                  <span>{label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Controls & Kill Switch */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={onOpenInjectModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#FFFDF8] hover:bg-[#F2EBDD] text-[#3A2E26] border border-[#E4D9C5] transition-colors shadow-xs"
            title="Simulate incoming citizen report or IoT sensor trigger to test entanglement"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#B0623A]" />
            <span>Inject SOS</span>
          </button>

          <a
            href="/entangle-app-corrected.zip"
            download="entangle-app-corrected.zip"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#5F7A61] hover:bg-[#4D664F] text-white transition-colors shadow-xs"
            title="Download full corrected application source as ZIP archive"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Download ZIP</span>
          </a>

          <button
            onClick={onOpenLedger}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#FFFDF8] hover:bg-[#F2EBDD] text-[#3A2E26] border border-[#E4D9C5] transition-colors shadow-xs"
            title="View tamper-evident versioned audit event log"
          >
            <History className="w-3.5 h-3.5 text-[#7A6A5A]" />
            <span className="hidden sm:inline">Event Log</span>
          </button>

          <button
            onClick={resetToInitialDemo}
            className="p-1.5 rounded-full text-[#7A6A5A] hover:bg-[#F2EBDD] border border-transparent hover:border-[#E4D9C5] transition-colors"
            title="Reset scenario to fresh state"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Global Kill Switch Button */}
          <button
            onClick={handleToggleKill}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all shadow-xs ${
              isKilled
                ? 'bg-[#9E2F22] text-white hover:bg-[#84261B]'
                : 'bg-[#FFFDF8] hover:bg-[#F6DDD6] text-[#9E2F22] border-2 border-[#9E2F22]'
            }`}
          >
            <AlertOctagon className="w-4 h-4 fill-current" />
            <span>{isKilled ? 'Resume' : 'Kill Switch'}</span>
          </button>
        </div>
      </div>

      {/* Kill Confirmation Modal */}
      {showKillConfirm && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFDF8] border-2 border-[#9E2F22] rounded-[20px] p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 text-[#9E2F22] mb-3">
              <AlertOctagon className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-bold font-heading">Engage Global Kill Switch?</h3>
            </div>
            <p className="text-xs text-[#7A6A5A] leading-relaxed mb-4">
              This will freeze all 5 autonomous agent loops immediately, halt in-flight evaluations,
              and prevent automatic superposition plan generation. All operations will transition to strictly manual human command.
            </p>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-[#3A2E26] mb-1">
                Reason for Emergency Freeze:
              </label>
              <input
                type="text"
                value={killInputReason}
                onChange={e => setKillInputReason(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-xl border border-[#E4D9C5] bg-[#FAF6EE] text-[#3A2E26] focus:outline-none focus:border-[#9E2F22]"
                placeholder="Specify override reason..."
              />
            </div>
            <div className="flex items-center justify-end gap-2.5">
              <button
                onClick={() => setShowKillConfirm(false)}
                className="px-4 py-2 rounded-full text-xs font-semibold text-[#7A6A5A] hover:bg-[#F2EBDD]"
              >
                Cancel
              </button>
              <button
                onClick={confirmEngageKill}
                className="px-4 py-2 rounded-full text-xs font-bold text-white bg-[#9E2F22] hover:bg-[#84261B] uppercase tracking-wider"
              >
                Engage Freeze
              </button>
            </div>
          </div>
        </div>
      )}
      {showResumeConfirm && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFDF8] border-2 border-[#5F7A61] rounded-[20px] p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 text-[#5F7A61] mb-3">
              <Play className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-bold font-heading">Resume agent activity?</h3>
            </div>
            <p className="text-xs text-[#7A6A5A] leading-relaxed mb-4">
              Agents can respond to new events after you confirm. The frozen event log remains unchanged.
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <button onClick={() => setShowResumeConfirm(false)} className="px-4 py-2 rounded-full text-xs font-semibold text-[#7A6A5A] hover:bg-[#F2EBDD]">
                Cancel
              </button>
              <button
                onClick={() => {
                  toggleKillSwitch();
                  setShowResumeConfirm(false);
                }}
                className="px-4 py-2 rounded-full text-xs font-bold text-white bg-[#5F7A61] hover:bg-[#4D664F] uppercase tracking-wider"
              >
                Confirm resume
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
