/**
 * Dependency-free SVG charts.
 *
 * The platform only ever needs a handful of chart shapes, and shipping them as
 * inline SVG keeps the bundle small, prints correctly, and lets every value carry
 * a text equivalent for screen readers.
 */

import { useId } from 'react';
import { cn } from '@/lib/utils';

export interface ChartDatum {
  label: string;
  value: number;
  secondary?: number;
  color?: string;
}

const RISK_COLORS = { red: '#c0392f', amber: '#b4761c', green: '#1f8f66', brand: '#0f766e', ink: '#475569' };

export function BarChart({
  data,
  height = 180,
  tone = RISK_COLORS.brand,
  suffix = '',
  showValue = true,
  className,
  ariaLabel,
}: {
  data: ChartDatum[];
  height?: number;
  tone?: string;
  suffix?: string;
  showValue?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const max = Math.max(1, ...data.map((datum) => datum.value));
  return (
    <div className={cn('w-full', className)}>
      <div
        className="flex items-end gap-1.5"
        style={{ height }}
        role="img"
        aria-label={ariaLabel ?? `Bar chart: ${data.map((datum) => `${datum.label} ${datum.value}${suffix}`).join(', ') || 'no data'}`}
      >
        {data.map((datum) => {
          const pct = (datum.value / max) * 100;
          return (
            <div key={datum.label} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
              {showValue && datum.value > 0 ? (
                <span className="micro tnum text-ink-500 opacity-0 transition-opacity group-hover:opacity-100">
                  {datum.value}
                  {suffix}
                </span>
              ) : (
                <span className="micro tnum text-ink-400">{datum.value === 0 && showValue ? '0' : ''}</span>
              )}
              <div
                className="w-full rounded-t transition-[height,opacity] duration-500 group-hover:opacity-85"
                style={{
                  height: `${Math.max(pct, datum.value > 0 ? 4 : 1.5)}%`,
                  backgroundColor: datum.color ?? tone,
                  opacity: datum.value === 0 ? 0.18 : 1,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-1.5 border-t border-ink-200 pt-1.5">
        {data.map((datum) => (
          <span key={datum.label} className="micro min-w-0 flex-1 truncate text-center text-ink-500" title={datum.label}>
            {datum.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function GroupedBarChart({
  data,
  height = 200,
  series = [
    { key: 'value', label: 'Series 1', color: RISK_COLORS.brand },
    { key: 'secondary', label: 'Series 2', color: RISK_COLORS.amber },
  ],
  className,
}: {
  data: ChartDatum[];
  height?: number;
  series?: { key: 'value' | 'secondary'; label: string; color: string }[];
  className?: string;
}) {
  const max = Math.max(1, ...data.flatMap((datum) => [datum.value, datum.secondary ?? 0]));
  return (
    <div className={className}>
      <div className="flex items-end gap-2" style={{ height }}>
        {data.map((datum) => (
          <div key={datum.label} className="flex min-w-0 flex-1 flex-col items-center justify-end">
            <div className="flex h-full w-full items-end justify-center gap-1">
              {series.map((entry) => {
                const value = (datum[entry.key] as number | undefined) ?? 0;
                return (
                  <div
                    key={entry.key}
                    title={`${datum.label} · ${entry.label}: ${value}`}
                    className="w-full max-w-3 rounded-t transition-all duration-500"
                    style={{ height: `${Math.max((value / max) * 100, value > 0 ? 4 : 1)}%`, backgroundColor: entry.color, opacity: value === 0 ? 0.15 : 1 }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2 border-t border-ink-200 pt-1.5">
        {data.map((datum) => (
          <span key={datum.label} className="micro min-w-0 flex-1 truncate text-center text-ink-500">
            {datum.label}
          </span>
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-3">
        {series.map((entry) => (
          <span key={entry.key} className="micro inline-flex items-center gap-1.5 text-ink-600">
            <span className="size-2 rounded-[2px]" style={{ backgroundColor: entry.color }} aria-hidden />
            {entry.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function LineChart({
  data,
  height = 160,
  tone = RISK_COLORS.brand,
  className,
  ariaLabel,
}: {
  data: ChartDatum[];
  height?: number;
  tone?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const gradientId = useId().replace(/:/g, '');
  const width = 300;
  const max = Math.max(1, ...data.map((datum) => datum.value));
  const stepX = data.length > 1 ? width / (data.length - 1) : width;
  const points = data.map((datum, index) => [index * stepX, height - (datum.value / max) * (height - 18) - 6] as const);
  const path = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${path} L${width} ${height} L0 ${height} Z`;

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={ariaLabel ?? `Line chart: ${data.map((datum) => `${datum.label} ${datum.value}`).join(', ') || 'no data'}`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={`fill-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={tone} stopOpacity="0.24" />
            <stop offset="100%" stopColor={tone} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((fraction) => (
          <line key={fraction} x1="0" x2={width} y1={height * fraction} y2={height * fraction} stroke="#e6ecf0" strokeWidth="1" />
        ))}
        {data.length > 1 ? <path d={area} fill={`url(#fill-${gradientId})`} /> : null}
        {data.length > 1 ? <path d={path} fill="none" stroke={tone} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {points.map(([x, y], index) => (
          <circle key={index} cx={x} cy={y} r="2.6" fill="white" stroke={tone} strokeWidth="1.6">
            <title>{`${data[index]?.label}: ${data[index]?.value}`}</title>
          </circle>
        ))}
      </svg>
      <div className="mt-1.5 flex justify-between">
        {data.map((datum) => (
          <span key={datum.label} className="micro text-ink-500">
            {datum.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function DonutChart({
  data,
  size = 148,
  thickness = 18,
  centerLabel,
  centerValue,
  className,
}: {
  data: ChartDatum[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string | number;
  className?: string;
}) {
  const total = data.reduce((sum, datum) => sum + datum.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className={cn('flex flex-wrap items-center gap-4', className)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={total === 0 ? 'No data' : data.map((d) => `${d.label}: ${d.value}`).join(', ')}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#eef2f4" strokeWidth={thickness} />
          {total > 0
            ? data.map((datum) => {
                const fraction = datum.value / total;
                const dash = fraction * circumference;
                const element = (
                  <circle
                    key={datum.label}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={datum.color ?? RISK_COLORS.brand}
                    strokeWidth={thickness}
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeDashoffset={-offset}
                    strokeLinecap="butt"
                  />
                );
                offset += dash;
                return element;
              })
            : null}
        </g>
        <text x="50%" y="46%" textAnchor="middle" className="fill-ink-900" style={{ fontSize: 22, fontWeight: 700 }}>
          {centerValue ?? total}
        </text>
        {centerLabel ? (
          <text x="50%" y="60%" textAnchor="middle" className="fill-ink-500" style={{ fontSize: 9, letterSpacing: '0.06em' }}>
            {centerLabel.toUpperCase()}
          </text>
        ) : null}
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.map((datum) => (
          <li key={datum.label} className="flex items-center justify-between gap-3 text-[0.82rem]">
            <span className="inline-flex min-w-0 items-center gap-2 text-ink-600">
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: datum.color ?? RISK_COLORS.brand }} aria-hidden />
              <span className="truncate">{datum.label}</span>
            </span>
            <span className="shrink-0 font-semibold text-ink-900 tnum">
              {datum.value}
              {total > 0 ? <span className="ml-1 text-xs font-normal text-ink-400">{Math.round((datum.value / total) * 100)}%</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HBarChart({
  data,
  tone = RISK_COLORS.brand,
  suffix = '',
  className,
}: {
  data: ChartDatum[];
  tone?: string;
  suffix?: string;
  className?: string;
}) {
  const max = Math.max(1, ...data.map((datum) => datum.value));
  return (
    <ul className={cn('space-y-2.5', className)}>
      {data.map((datum) => (
        <li key={datum.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[0.82rem] font-medium text-ink-700">{datum.label}</span>
            <span className="shrink-0 text-[0.82rem] font-semibold text-ink-900 tnum">
              {datum.value}
              {suffix}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.max((datum.value / max) * 100, datum.value > 0 ? 3 : 0)}%`, backgroundColor: datum.color ?? tone }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export const chartColors = RISK_COLORS;
