/* SPDX-License-Identifier: GPL-3.0-only
 * Molecular FX Lab — Precision Rotary Parameter Control
 */

import React, { useCallback, useRef } from 'react';
import type { EffectParamMeta } from '../effects/catalog';

interface RotaryKnobProps {
  param: EffectParamMeta;
  value: number;
  disabled?: boolean;
  onChange: (nextValue: number) => void;
}

const START_ANGLE = -135;
const END_ANGLE = 135;
const SWEEP = END_ANGLE - START_ANGLE;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 0 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

export const RotaryKnob: React.FC<RotaryKnobProps> = ({ param, value, disabled = false, onChange }) => {
  const dragRef = useRef<{ startY: number; startX: number; startVal: number } | null>(null);

  const clamp = useCallback(
    (v: number) => Math.max(param.min, Math.min(param.max, Math.round(v))),
    [param.max, param.min]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startX: e.clientX, startVal: value };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || disabled) return;
    const dy = dragRef.current.startY - e.clientY;
    const dx = e.clientX - dragRef.current.startX;
    const sensitivity = e.shiftKey ? 0.2 : 0.65;
    const delta = (dy + dx * 0.35) * sensitivity;
    const next = clamp(dragRef.current.startVal + delta);
    if (next !== value) onChange(next);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      e.currentTarget.releasePointerCapture(e.pointerId);
      dragRef.current = null;
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    const step = e.shiftKey ? 1 : 2;
    const dir = e.deltaY < 0 ? 1 : -1;
    onChange(clamp(value + dir * step));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const step = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault();
      onChange(clamp(value + step));
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault();
      onChange(clamp(value - step));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChange(param.min);
    } else if (e.key === 'End') {
      e.preventDefault();
      onChange(param.max);
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      onChange(param.defaultValue);
    }
  };

  const norm = (value - param.min) / (param.max - param.min);
  const currentAngle = START_ANGLE + norm * SWEEP;
  const loAngle = START_ANGLE + ((param.drawLo - param.min) / (param.max - param.min)) * SWEEP;
  const hiAngle = START_ANGLE + ((param.drawHi - param.min) / (param.max - param.min)) * SWEEP;
  const defAngle = START_ANGLE + ((param.defaultValue - param.min) / (param.max - param.min)) * SWEEP;

  const ptrOuter = polarToCartesian(56, 56, 30, currentAngle);
  const ptrInner = polarToCartesian(56, 56, 15, currentAngle);
  const defTickOuter = polarToCartesian(56, 56, 48, defAngle);
  const defTickInner = polarToCartesian(56, 56, 43, defAngle);

  return (
    <div className="flex flex-col items-center bg-[#1C1E21] border border-[#32363C] rounded-md px-4 py-4 select-none">
      <div className="w-full flex items-baseline justify-between gap-2 mb-1">
        <span className="text-xs font-semibold tracking-wider text-[#F2EFE9]">{param.name}</span>
        <span className="font-mono text-[11px] text-[#8E939C] tabular-nums">
          P{param.index} · {String(value).padStart(2, '0')}
        </span>
      </div>

      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={`${param.name} parameter`}
        aria-valuemin={param.min}
        aria-valuemax={param.max}
        aria-valuenow={value}
        aria-valuetext={param.formatValue(value)}
        title={`${param.description} Drag or scroll to adjust. Double-click to reset to RM_HOME (${param.defaultValue}).`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={() => !disabled && onChange(param.defaultValue)}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        className={`relative my-1.5 rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F97316] ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-ns-resize'
        }`}
      >
        <svg width="112" height="112" viewBox="0 0 112 112" className="block overflow-visible">
          {/* Background track arc */}
          <path
            d={describeArc(56, 56, 42, START_ANGLE, END_ANGLE)}
            fill="none"
            stroke="#2E3238"
            strokeWidth="5"
            strokeLinecap="round"
          />

          {/* Molecular RM_LO..RM_HI recommended draw bounds subtle arc */}
          <path
            d={describeArc(56, 56, 48, loAngle, hiAngle)}
            fill="none"
            stroke="#4B515C"
            strokeWidth="1.5"
            strokeLinecap="round"
          />

          {/* RM_HOME default reference tick */}
          <line
            x1={defTickInner.x}
            y1={defTickInner.y}
            x2={defTickOuter.x}
            y2={defTickOuter.y}
            stroke="#9CA3AF"
            strokeWidth="1.5"
            strokeLinecap="round"
          />

          {/* Active value arc */}
          {norm > 0.005 && (
            <path
              d={describeArc(56, 56, 42, START_ANGLE, currentAngle)}
              fill="none"
              stroke="#F97316"
              strokeWidth="5"
              strokeLinecap="round"
            />
          )}

          {/* Machined dial cap */}
          <circle cx="56" cy="56" r="33" fill="#272A2F" stroke="#3D424B" strokeWidth="1.5" />
          <circle cx="56" cy="56" r="28" fill="#202327" />

          {/* Indicator needle */}
          <line
            x1={ptrInner.x}
            y1={ptrInner.y}
            x2={ptrOuter.x}
            y2={ptrOuter.y}
            stroke="#F97316"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* Physical mapped readout */}
      <div className="mt-1 text-center">
        <div className="font-mono text-sm font-medium text-[#F5F2EC] tabular-nums">
          {param.formatValue(value)}
        </div>
        <div className="text-[11px] text-[#8E939C] mt-0.5 leading-snug max-w-[180px] truncate" title={param.description}>
          {param.scale} · home {param.defaultValue}
        </div>
      </div>
    </div>
  );
};
