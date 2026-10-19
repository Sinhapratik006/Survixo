import type { ReactNode } from 'react';
import { BarChart3 } from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CHART_COLORS, ChartFrame, DANGER_COLOR, SUCCESS_COLOR, useChartTheme, useTooltipStyle } from '@/components/charts/theme';
import { Card, EmptyState, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { dayLabel, formatCompact, formatNumber, formatUsd } from '@/lib/format';
import type { UsageSeriesPoint } from './types';

export function ChartCard({
  title,
  unit,
  loading,
  empty,
  emptyText = 'No usage recorded in this period yet.',
  height = 260,
  actions,
  footer,
  className,
  children,
}: {
  title: string;
  unit: string;
  loading?: boolean;
  empty?: boolean;
  emptyText?: string;
  height?: number;
  actions?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <div className="flex flex-wrap items-start justify-between gap-2 px-5 pt-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
          <p className="mt-0.5 text-xs text-muted">{unit}</p>
        </div>
        {actions}
      </div>
      <div className="flex-1 px-3 pb-4 pt-3 sm:px-4">
        {loading ? (
          <div role="status" aria-label={`Loading ${title}`} style={{ height }} className="flex flex-col justify-end gap-2">
            <Skeleton className="h-full w-full" />
            <Skeleton className="h-3 w-full" />
          </div>
        ) : empty ? (
          <div style={{ minHeight: height }} className="flex items-center justify-center">
            <EmptyState icon={<BarChart3 className="h-5 w-5" aria-hidden />} title="Nothing to chart yet" description={emptyText} className="py-6" />
          </div>
        ) : (
          children
        )}
      </div>
      {footer && <div className="border-t border-brand-50 px-5 py-3 text-xs text-muted dark:border-navy-700">{footer}</div>}
    </Card>
  );
}

function useAxisProps() {
  const t = useChartTheme();
  return {
    grid: { stroke: t.grid, strokeDasharray: '3 3', vertical: false },
    axis: { stroke: t.axis, tick: { fill: t.axis, fontSize: 11 }, tickLine: false, axisLine: { stroke: t.grid } },
    muted: t.axis,
  };
}

const dayTick = (v: unknown) => dayLabel(String(v));
const dayTooltipLabel = (label: ReactNode) => dayLabel(String(label));
const legendStyle = { fontSize: 12, paddingTop: 8 };

/** Daily spend stacked with realized savings (green) against the baseline reference cost. */
export function CostVsBaselineChart({ series, height = 260 }: { series: UsageSeriesPoint[]; height?: number }) {
  const { grid, axis, muted } = useAxisProps();
  const tooltip = useTooltipStyle();
  const data = series.map((d) => ({ day: d.day, cost: d.costUsd, savings: Math.max(0, d.baselineUsd - d.costUsd), baseline: d.baselineUsd }));
  return (
    <ChartFrame height={height} label="Daily spend in US dollars, with savings versus baseline reference prices">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="day" {...axis} tickFormatter={dayTick} minTickGap={24} />
          <YAxis {...axis} width={64} tickFormatter={(v: number) => formatUsd(v)} />
          <Tooltip {...tooltip} labelFormatter={dayTooltipLabel} formatter={(v, name) => [formatUsd(Number(v)), name]} />
          <Legend wrapperStyle={legendStyle} />
          <Bar dataKey="cost" name="Spend (USD)" stackId="c" fill={CHART_COLORS[0]} isAnimationActive={false} maxBarSize={28} />
          <Bar dataKey="savings" name="Savings vs. baseline (USD)" stackId="c" fill={SUCCESS_COLOR} radius={[3, 3, 0, 0]} isAnimationActive={false} maxBarSize={28} />
          <Line type="monotone" dataKey="baseline" name="Baseline reference (USD)" stroke={muted} strokeDasharray="4 3" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** Daily request volume split into succeeded and failed requests. */
export function RequestsChart({ series, height = 260 }: { series: UsageSeriesPoint[]; height?: number }) {
  const { grid, axis } = useAxisProps();
  const tooltip = useTooltipStyle();
  const data = series.map((d) => ({ day: d.day, ok: Math.max(0, d.requests - d.failures), failures: d.failures }));
  return (
    <ChartFrame height={height} label="Daily requests, succeeded versus failed">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="day" {...axis} tickFormatter={dayTick} minTickGap={24} />
          <YAxis {...axis} width={48} allowDecimals={false} tickFormatter={(v: number) => formatCompact(v)} />
          <Tooltip {...tooltip} labelFormatter={dayTooltipLabel} formatter={(v, name) => [`${formatNumber(Number(v))} requests`, name]} />
          <Legend wrapperStyle={legendStyle} />
          <Bar dataKey="ok" name="Succeeded" stackId="r" fill={CHART_COLORS[1]} isAnimationActive={false} maxBarSize={28} />
          <Bar dataKey="failures" name="Failed" stackId="r" fill={DANGER_COLOR} radius={[3, 3, 0, 0]} isAnimationActive={false} maxBarSize={28} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
