/**
 * components/tracker/CarbonLogForm.jsx
 *
 * Multi-step modal form for submitting a daily carbon log.
 *
 * Steps:
 *   1. Transport — add up to 3 travel legs (mode + distance slider)
 *   2. Diet      — single dropdown selection
 *   3. Energy    — two sliders (electricity + gas)
 *   4. Review    — summary card before final submission
 *
 * Props:
 *   onClose    : () => void — called when the modal is dismissed
 *   onSuccess  : (result) => void — called after a successful API submission
 *   baseline   : number — user's daily baseline for preview comparison
 */

import React, { useState, useCallback, useEffect } from 'react';
import { carbonApi } from '../../services/api.js';

// ─── Coefficient preview (mirrors carbonEngine.js) ────────────────────────────
const TRANSPORT_FACTORS = {
  car_petrol:   0.192, car_diesel:   0.171, car_electric: 0.053,
  motorbike:    0.114, bus:          0.089, train:        0.041,
  tram_metro:   0.029, cycling:      0.000, walking:      0.000,
  flight_short: 0.255, flight_long:  0.195, none:         0.000,
};
const DIET_FACTORS = {
  meat_heavy: 7.19, meat_medium: 5.63, meat_low: 4.67,
  pescatarian: 3.91, vegetarian: 3.81, vegan: 2.89,
};
const ENERGY_FACTORS = { electricity: 0.233, gas: 0.203 };

const estimateTotal = (transport, diet, electricity, gas) => {
  const t = transport.reduce((sum, l) => sum + (TRANSPORT_FACTORS[l.mode] ?? 0) * l.distanceKm, 0);
  const d = DIET_FACTORS[diet]      ?? 0;
  const e = electricity * ENERGY_FACTORS.electricity + gas * ENERGY_FACTORS.gas;
  return Math.round((t + d + e) * 100) / 100;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const TRANSPORT_LABELS = {
  car_petrol: 'Car (petrol)',    car_diesel: 'Car (diesel)',
  car_electric: 'Car (electric)', motorbike: 'Motorbike',
  bus: 'Bus',                    train: 'Train / rail',
  tram_metro: 'Tram / metro',   cycling: 'Cycling',
  walking: 'Walking',            flight_short: 'Flight (short-haul)',
  flight_long: 'Flight (long-haul)', none: 'No travel today',
};

const DIET_OPTIONS = [
  { value: 'vegan',       label: 'Vegan',        sub: '2.9 kg CO₂e/day',  icon: '🌱' },
  { value: 'vegetarian',  label: 'Vegetarian',   sub: '3.8 kg CO₂e/day',  icon: '🥦' },
  { value: 'pescatarian', label: 'Pescatarian',  sub: '3.9 kg CO₂e/day',  icon: '🐟' },
  { value: 'meat_low',    label: 'Low meat',     sub: '4.7 kg CO₂e/day',  icon: '🥗' },
  { value: 'meat_medium', label: 'Some meat',    sub: '5.6 kg CO₂e/day',  icon: '🍗' },
  { value: 'meat_heavy',  label: 'Meat-heavy',   sub: '7.2 kg CO₂e/day',  icon: '🥩' },
];

const STEPS = ['Transport', 'Diet', 'Energy', 'Review'];

// ─── Sub-components ───────────────────────────────────────────────────────────

const StepIndicator = ({ current }) => (
  <div className="flex items-center gap-0 mb-8">
    {STEPS.map((label, i) => (
      <React.Fragment key={label}>
        <div className="flex flex-col items-center gap-1">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center font-mono text-xs font-semibold
              transition-colors duration-200
              ${i < current  ? 'bg-[#4a7c59] text-[#f0ede8]'
              : i === current ? 'bg-[#f0ede8] text-[#1a2e1a]'
              : 'bg-[#2d4a2d] text-[#6b8f6b]'}`}
          >
            {i < current ? '✓' : i + 1}
          </div>
          <span className={`text-[10px] font-mono hidden sm:block
            ${i === current ? 'text-[#a8c5a0]' : 'text-[#4a5568]'}`}>
            {label}
          </span>
        </div>
        {i < STEPS.length - 1 && (
          <div className={`flex-1 h-px mx-1 mb-4 ${i < current ? 'bg-[#4a7c59]' : 'bg-[#2d4a2d]'}`} />
        )}
      </React.Fragment>
    ))}
  </div>
);

const SliderField = ({ label, value, min, max, step = 0.5, unit, onChange, sublabel }) => (
  <div className="space-y-2">
    <div className="flex justify-between items-baseline">
      <label className="text-[#a8c5a0] text-xs font-mono uppercase tracking-widest">{label}</label>
      <span className="text-[#f0ede8] font-mono text-sm font-semibold">
        {value} <span className="text-[#6b8f6b] text-xs font-normal">{unit}</span>
      </span>
    </div>
    <input
      type="range"
      min={min} max={max} step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full h-1.5 appearance-none bg-[#2d4a2d] rounded-full outline-none
                 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full
                 [&::-webkit-slider-thumb]:bg-[#4a7c59] [&::-webkit-slider-thumb]:cursor-pointer
                 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#a8c5a0]
                 cursor-pointer"
      aria-label={label}
    />
    <div className="flex justify-between text-[#4a5568] font-mono text-[10px]">
      <span>{min} {unit}</span>
      {sublabel && <span className="text-[#6b8f6b]">{sublabel}</span>}
      <span>{max} {unit}</span>
    </div>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const EMPTY_LEG = () => ({ mode: 'car_petrol', distanceKm: 10 });

const CarbonLogForm = ({ onClose, onSuccess, baseline = 12 }) => {
  const [step,       setStep]       = useState(0);
  const [transport,  setTransport]  = useState([EMPTY_LEG()]);
  const [diet,       setDiet]       = useState('meat_medium');
  const [electricity,setElectricity]= useState(6);
  const [gas,        setGas]        = useState(3);
  const [notes,      setNotes]      = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const estimate = estimateTotal(transport, diet, electricity, gas);

  // ── Transport step handlers ───────────────────────────────────────────────

  const updateLeg = (i, field, value) =>
    setTransport((prev) => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));

  const addLeg = () => {
    if (transport.length < 4) setTransport((prev) => [...prev, EMPTY_LEG()]);
  };

  const removeLeg = (i) => setTransport((prev) => prev.filter((_, idx) => idx !== i));

  // ── Submission ────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setError('');
    try {
      // Filter out 'none' legs — server doesn't need them
      const legs = transport
        .filter((l) => l.mode !== 'none')
        .map((l) => ({ mode: l.mode, distanceKm: l.distanceKm }));

      const result = await carbonApi.submitLog({
        transport: legs,
        diet,
        energy: { electricityKwh: electricity, naturalGasKwh: gas },
        notes,
      });
      onSuccess(result);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [transport, diet, electricity, gas, notes, onSuccess]);

  // ── Step content ──────────────────────────────────────────────────────────

  const renderStep = () => {
    switch (step) {
      // ── Step 0: Transport ───────────────────────────────────────────────
      case 0:
        return (
          <div className="space-y-5">
            <p className="text-[#6b8f6b] text-sm">
              Add each way you travelled today. Skip this step if you didn't go anywhere.
            </p>

            {transport.map((leg, i) => (
              <div key={i} className="bg-[#162616] border border-[#2d4a2d] rounded-lg p-4 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-[#a8c5a0] text-xs font-mono uppercase tracking-widest">
                    Trip {i + 1}
                  </span>
                  {transport.length > 1 && (
                    <button
                      onClick={() => removeLeg(i)}
                      className="text-[#6b8f6b] hover:text-[#c0392b] text-xs font-mono transition-colors"
                      aria-label={`Remove trip ${i + 1}`}
                    >
                      Remove
                    </button>
                  )}
                </div>

                {/* Mode selector */}
                <div className="space-y-1.5">
                  <label className="text-[#a8c5a0] text-xs font-mono uppercase tracking-widest block">
                    Mode of transport
                  </label>
                  <select
                    value={leg.mode}
                    onChange={(e) => updateLeg(i, 'mode', e.target.value)}
                    className="w-full bg-[#1e2e1e] border border-[#2d4a2d] text-[#f0ede8]
                               font-mono text-sm rounded-lg px-3 py-2.5 outline-none
                               focus:border-[#4a7c59] transition-colors cursor-pointer"
                  >
                    {Object.entries(TRANSPORT_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>

                {/* Distance slider — hide when mode is 'none' */}
                {leg.mode !== 'none' && (
                  <SliderField
                    label="Distance"
                    value={leg.distanceKm}
                    min={0}
                    max={leg.mode.startsWith('flight') ? 12000 : 200}
                    step={leg.mode.startsWith('flight') ? 50 : 1}
                    unit="km"
                    onChange={(v) => updateLeg(i, 'distanceKm', v)}
                    sublabel={`≈ ${(TRANSPORT_FACTORS[leg.mode] * leg.distanceKm).toFixed(2)} kg CO₂e`}
                  />
                )}
              </div>
            ))}

            {transport.length < 4 && (
              <button
                onClick={addLeg}
                className="w-full border border-dashed border-[#2d4a2d] hover:border-[#4a7c59]
                           text-[#6b8f6b] hover:text-[#a8c5a0] font-mono text-sm py-3 rounded-lg
                           transition-colors"
              >
                + Add another trip
              </button>
            )}
          </div>
        );

      // ── Step 1: Diet ────────────────────────────────────────────────────
      case 1:
        return (
          <div className="space-y-3">
            <p className="text-[#6b8f6b] text-sm mb-4">
              What best describes how you ate today?
            </p>
            {DIET_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDiet(opt.value)}
                className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-lg border
                            font-mono text-left transition-all duration-150
                            ${diet === opt.value
                              ? 'border-[#4a7c59] bg-[#4a7c59]/15 text-[#f0ede8]'
                              : 'border-[#2d4a2d] bg-[#162616] text-[#a8c5a0] hover:border-[#4a7c59]/60'
                            }`}
              >
                <span className="text-xl w-7 shrink-0 text-center">{opt.icon}</span>
                <div className="flex-1">
                  <div className="text-sm font-semibold">{opt.label}</div>
                  <div className="text-xs text-[#6b8f6b]">{opt.sub}</div>
                </div>
                {diet === opt.value && (
                  <span className="text-[#4a7c59] text-sm shrink-0">✓</span>
                )}
              </button>
            ))}
          </div>
        );

      // ── Step 2: Energy ──────────────────────────────────────────────────
      case 2:
        return (
          <div className="space-y-8">
            <p className="text-[#6b8f6b] text-sm">
              Estimate your home energy use today. Not sure? An average UK home
              uses about 8 kWh electricity and 33 kWh gas per day.
            </p>

            <SliderField
              label="Electricity"
              value={electricity}
              min={0}
              max={50}
              step={0.5}
              unit="kWh"
              onChange={setElectricity}
              sublabel={`≈ ${(electricity * ENERGY_FACTORS.electricity).toFixed(2)} kg CO₂e`}
            />

            <SliderField
              label="Natural gas"
              value={gas}
              min={0}
              max={80}
              step={0.5}
              unit="kWh"
              onChange={setGas}
              sublabel={`≈ ${(gas * ENERGY_FACTORS.gas).toFixed(2)} kg CO₂e`}
            />

            <div className="bg-[#162616] border border-[#2d4a2d] rounded-lg px-4 py-3">
              <p className="text-[#6b8f6b] text-xs font-mono">
                Energy total: <span className="text-[#f0ede8]">
                  {(electricity * ENERGY_FACTORS.electricity + gas * ENERGY_FACTORS.gas).toFixed(2)} kg CO₂e
                </span>
              </p>
            </div>
          </div>
        );

      // ── Step 3: Review ──────────────────────────────────────────────────
      case 3: {
        const transportKg = transport.reduce(
          (s, l) => s + (TRANSPORT_FACTORS[l.mode] ?? 0) * l.distanceKm, 0
        );
        const dietKg   = DIET_FACTORS[diet] ?? 0;
        const energyKg = electricity * ENERGY_FACTORS.electricity + gas * ENERGY_FACTORS.gas;
        const beatBase = estimate < baseline;

        return (
          <div className="space-y-5">
            {/* Main result */}
            <div className={`rounded-lg px-5 py-4 text-center border
              ${beatBase
                ? 'bg-[#4a7c59]/10 border-[#4a7c59]/40'
                : 'bg-[#d47c2a]/10 border-[#d47c2a]/40'}`}>
              <p className="text-[#6b8f6b] text-xs font-mono uppercase tracking-widest mb-1">
                Today's estimated footprint
              </p>
              <p className={`text-4xl font-mono font-bold ${beatBase ? 'text-[#4a7c59]' : 'text-[#d47c2a]'}`}>
                {estimate.toFixed(2)}
                <span className="text-base font-normal ml-1 text-[#6b8f6b]">kg CO₂e</span>
              </p>
              <p className={`text-sm mt-2 font-mono ${beatBase ? 'text-[#4a7c59]' : 'text-[#d47c2a]'}`}>
                {beatBase
                  ? `${(baseline - estimate).toFixed(2)} kg below your baseline — you'll earn XP! 🎯`
                  : `${(estimate - baseline).toFixed(2)} kg above your ${baseline} kg baseline`}
              </p>
            </div>

            {/* Breakdown */}
            <div className="space-y-2">
              {[
                { label: 'Transport', kg: transportKg, icon: '🚗' },
                { label: 'Diet',      kg: dietKg,      icon: '🍽️' },
                { label: 'Energy',    kg: energyKg,    icon: '⚡' },
              ].map(({ label, kg, icon }) => (
                <div key={label} className="flex items-center gap-3 font-mono text-sm">
                  <span className="w-6 text-center">{icon}</span>
                  <span className="text-[#a8c5a0] flex-1">{label}</span>
                  <span className="text-[#f0ede8]">{kg.toFixed(2)} kg</span>
                  <div className="w-24 h-1.5 bg-[#2d4a2d] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#4a7c59] rounded-full"
                      style={{ width: `${Math.min(100, (kg / estimate) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-[#a8c5a0] text-xs font-mono uppercase tracking-widest block">
                Note (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
                rows={2}
                placeholder="e.g. worked from home, had a long drive for family visit…"
                className="w-full bg-[#162616] border border-[#2d4a2d] text-[#f0ede8] text-sm
                           font-mono rounded-lg px-3 py-2.5 outline-none resize-none
                           focus:border-[#4a7c59] transition-colors placeholder:text-[#4a5568]"
              />
            </div>

            {error && (
              <div className="bg-[#c0392b]/10 border border-[#c0392b]/40 rounded-lg px-4 py-3
                              text-[#ff6b6b] text-sm font-mono">
                {error}
              </div>
            )}
          </div>
        );
      }

      default: return null;
    }
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="log-form-title"
    >
      {/* Modal panel */}
      <div className="bg-[#1a2e1a] border border-[#2d4a2d] rounded-xl w-full max-w-lg
                      max-h-[90vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-2 shrink-0">
          <div>
            <h2 id="log-form-title" className="text-[#f0ede8] font-semibold text-lg">
              Log today's footprint
            </h2>
            <p className="text-[#4a7c59] font-mono text-xs mt-0.5">
              {estimate.toFixed(2)} kg CO₂e estimated
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[#6b8f6b] hover:text-[#f0ede8] text-xl leading-none
                       transition-colors p-1 rounded focus:outline-none focus:ring-2 focus:ring-[#4a7c59]"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 pt-4 shrink-0">
          <StepIndicator current={step} />
        </div>

        {/* Step content — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 pb-4">
          {renderStep()}
        </div>

        {/* Footer nav */}
        <div className="flex gap-3 px-6 py-4 border-t border-[#2d4a2d] shrink-0">
          <button
            onClick={() => step > 0 ? setStep((s) => s - 1) : onClose()}
            className="flex-1 border border-[#2d4a2d] hover:border-[#4a7c59] text-[#a8c5a0]
                       font-mono text-sm py-2.5 rounded-lg transition-colors"
          >
            {step === 0 ? 'Cancel' : '← Back'}
          </button>

          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              className="flex-1 bg-[#4a7c59] hover:bg-[#5a9c70] text-[#f0ede8]
                         font-mono text-sm py-2.5 rounded-lg transition-colors font-semibold"
            >
              Next →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 bg-[#4a7c59] hover:bg-[#5a9c70] disabled:opacity-50
                         disabled:cursor-not-allowed text-[#f0ede8] font-mono text-sm
                         py-2.5 rounded-lg transition-colors font-semibold"
            >
              {submitting ? 'Saving…' : 'Save log ✓'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CarbonLogForm;
