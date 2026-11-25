"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Lightweight SVG charts following the dataviz method: thin marks, 4px rounded data ends,
 * 2px lines, ≥8px end dots with a surface ring, hairline grid, hover tooltip on every mark,
 * legend for ≥2 series plus direct end labels, and a table view.
 * Palette: validated categorical slots 1–2 (light surface) — see `npm`-free validator run.
 */
export const SERIES = ["#2a78d6", "#eb6834"] as const;
const SURFACE = "#ffffff";
const GRID = "#e8e7e3";
const TEXT_MUTED = "#64748b";

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/** Positioned in % of the chart width so it tracks the responsive SVG; flips left near the right edge. */
function Tooltip({ xPct, y, children }: { xPct: number; y: number; children: ReactNode }) {
  const flip = xPct > 62;
  return (
    <div
      className="pointer-events-none absolute z-10 min-w-36 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
      style={{ top: y, left: flip ? undefined : `calc(${xPct}% + 12px)`, right: flip ? `calc(${100 - xPct}% + 12px)` : undefined }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------ Trend (lines) -- */

export interface TrendSeries {
  name: string;
  values: number[];
}

export function TrendChart({ labels, series, height = 220 }: { labels: string[]; series: TrendSeries[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const W = 640;
  const pad = { top: 16, right: 92, bottom: 26, left: 32 };
  const innerW = W - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const n = labels.length;
  const x = (i: number) => pad.left + (n <= 1 ? innerW / 2 : (i * innerW) / (n - 1));
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const ticks = [0, max / 2, max];
  const labelEvery = Math.max(1, Math.ceil(n / 7));

  // Direct end labels; nudge apart if they would collide.
  const ends = series.map((s, si) => ({ si, y: y(s.values[n - 1] ?? 0), v: s.values[n - 1] ?? 0 }));
  if (ends.length === 2 && Math.abs(ends[0]!.y - ends[1]!.y) < 14) {
    const [a, b] = ends[0]!.y <= ends[1]!.y ? [ends[0]!, ends[1]!] : [ends[1]!, ends[0]!];
    a.y -= 7;
    b.y += 7;
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-4 text-xs text-slate-600">
          {series.map((s, i) => (
            <span key={s.name} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-sm" style={{ background: SERIES[i] }} />
              {s.name}
            </span>
          ))}
        </div>
        <button type="button" onClick={() => setAsTable((t) => !t)} className="cursor-pointer text-xs font-medium text-slate-500 hover:text-slate-700">
          {asTable ? "Xem biểu đồ" : "Xem dạng bảng"}
        </button>
      </div>

      {asTable ? (
        <DataTable head={["Tuần", ...series.map((s) => s.name)]} rows={labels.map((l, i) => [l, ...series.map((s) => s.values[i] ?? 0)])} />
      ) : (
        <div className="relative" onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${height}`} className="h-auto w-full" role="img" aria-label={`Biểu đồ ${series.map((s) => s.name).join(" và ")} theo tuần`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.left} x2={pad.left + innerW} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
                <text x={pad.left - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill={TEXT_MUTED}>
                  {Math.round(t)}
                </text>
              </g>
            ))}
            {labels.map((l, i) =>
              i % labelEvery === 0 || i === n - 1 ? (
                <text key={l + i} x={x(i)} y={height - 8} textAnchor="middle" fontSize={10} fill={TEXT_MUTED}>
                  {l}
                </text>
              ) : null,
            )}
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerH} stroke="#94a3b8" strokeWidth={1} />}
            {series.map((s, si) => (
              <g key={s.name}>
                <polyline
                  fill="none"
                  stroke={SERIES[si]}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
                />
                {(hover !== null ? [hover] : [n - 1]).map((i) => (
                  <circle key={i} cx={x(i)} cy={y(s.values[i] ?? 0)} r={4} fill={SERIES[si]} stroke={SURFACE} strokeWidth={2} />
                ))}
              </g>
            ))}
            {ends.map((e) => (
              <text key={e.si} x={x(n - 1) + 10} y={e.y + 3} fontSize={11} fill="#334155">
                <tspan fontWeight={600}>{e.v}</tspan> {series[e.si]!.name.toLowerCase()}
              </text>
            ))}
            {/* hit targets: one band per x position */}
            {labels.map((l, i) => (
              <rect
                key={`hit-${l}-${i}`}
                x={x(i) - innerW / Math.max(1, n - 1) / 2}
                y={pad.top}
                width={innerW / Math.max(1, n - 1)}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            ))}
          </svg>
          {hover !== null && (
            <Tooltip xPct={(x(hover) / W) * 100} y={8}>
              <p className="mb-1 font-semibold text-slate-800">Tuần {labels[hover]}</p>
              {series.map((s, si) => (
                <p key={s.name} className="flex items-center justify-between gap-4 text-slate-600">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: SERIES[si] }} />
                    {s.name}
                  </span>
                  <b className="text-slate-900">{s.values[hover] ?? 0}</b>
                </p>
              ))}
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------- Columns (1 series) -- */

export function ColumnChart({
  data,
  height = 170,
  valueLabel = "việc",
  format = (v: number) => String(v),
}: {
  data: { label: string; value: number; hint?: string }[];
  height?: number;
  valueLabel?: string;
  format?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  // Narrow drawing width: these charts live in ~1/3-width cards, so text stays legible when scaled.
  const W = 260;
  const pad = { top: 18, bottom: 22, left: 8, right: 8 };
  const innerH = height - pad.top - pad.bottom;
  const band = (W - pad.left - pad.right) / Math.max(1, data.length);
  const barW = Math.min(24, band * 0.6);
  const max = Math.max(1, ...data.map((d) => d.value));
  const maxIdx = data.findIndex((d) => d.value === max && max > 0);

  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${height}`} className="h-auto w-full" role="img" aria-label={`Biểu đồ cột: ${data.map((d) => `${d.label} ${format(d.value)}`).join(", ")}`}>
        <line x1={pad.left} x2={W - pad.right} y1={pad.top + innerH} y2={pad.top + innerH} stroke={GRID} strokeWidth={1} />
        {data.map((d, i) => {
          const h = (d.value / max) * innerH;
          const cx = pad.left + band * i + band / 2;
          const x0 = cx - barW / 2;
          const yTop = pad.top + innerH - h;
          const r = Math.min(4, h);
          return (
            <g key={d.label}>
              {h > 0 && (
                <path
                  d={`M${x0},${pad.top + innerH} V${yTop + r} Q${x0},${yTop} ${x0 + r},${yTop} H${x0 + barW - r} Q${x0 + barW},${yTop} ${x0 + barW},${yTop + r} V${pad.top + innerH} Z`}
                  fill={SERIES[0]}
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              )}
              {i === maxIdx && (
                <text x={cx} y={yTop - 5} textAnchor="middle" fontSize={10} fontWeight={600} fill="#334155">
                  {format(d.value)}
                </text>
              )}
              <text x={cx} y={height - 6} textAnchor="middle" fontSize={10} fill={TEXT_MUTED}>
                {d.label}
              </text>
              <rect x={pad.left + band * i} y={0} width={band} height={height} fill="transparent" onMouseEnter={() => setHover(i)} />
            </g>
          );
        })}
      </svg>
      {hover !== null && data[hover] && (
        <Tooltip xPct={((pad.left + band * hover + band / 2) / W) * 100} y={4}>
          <p className="font-semibold text-slate-800">{data[hover].label}</p>
          <p className="text-slate-600">
            <b className="text-slate-900">{format(data[hover].value)}</b> {valueLabel}
          </p>
          {data[hover].hint && <p className="text-slate-500">{data[hover].hint}</p>}
        </Tooltip>
      )}
    </div>
  );
}

/* --------------------------------------------------- Horizontal bars (1 series) -- */

export function BarList({
  data,
  format = (v: number) => String(v),
  max: maxOverride,
}: {
  data: { label: ReactNode; value: number | null; hint?: string; key: string }[];
  format?: (v: number) => string;
  max?: number;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const max = maxOverride ?? Math.max(1, ...data.map((d) => d.value ?? 0));
  return (
    <ul className="space-y-2.5">
      {data.map((d) => (
        <li
          key={d.key}
          className="relative grid grid-cols-[minmax(90px,30%)_1fr_auto] items-center gap-3 text-sm"
          onMouseEnter={() => setHover(d.key)}
          onMouseLeave={() => setHover(null)}
        >
          <span className="truncate text-slate-600">{d.label}</span>
          <span className="h-3 overflow-hidden rounded-r bg-slate-50">
            {d.value !== null && d.value > 0 && (
              <span
                className={cn("block h-full rounded-r-[4px] transition-opacity", hover && hover !== d.key && "opacity-50")}
                style={{ width: `${Math.max(2, (d.value / max) * 100)}%`, background: SERIES[0] }}
              />
            )}
          </span>
          <span className="w-16 text-right font-medium text-slate-900 tabular-nums">{d.value === null ? "—" : format(d.value)}</span>
          {hover === d.key && d.hint && (
            <span className="pointer-events-none absolute -top-8 left-[30%] z-10 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs whitespace-nowrap text-slate-600 shadow">
              {d.hint}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------- Table -- */

export function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
            {head.map((h) => (
              <th key={h} className="px-2 py-1.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-50">
              {r.map((c, j) => (
                <td key={j} className={cn("px-2 py-1.5", j > 0 && "tabular-nums text-slate-900")}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
