import type { ReactNode } from 'react';
import { BarChart3 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CHART_COLORS, ChartFrame, DANGER_COLOR, SUCCESS_COLOR, WARNING_COLOR, useChartTheme, useTooltipStyle } from '@/components/charts/theme';
import { Card, EmptyState, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { dayLabel, formatCompact, formatNumber, formatPricePerM, formatTokens, formatUsd } from '@/lib/format';
import type { AnalyticsOverview } from './useAnalytics';

/** Card wrapper giving every chart a title, unit, loading skeleton and empty state. */
export function ChartCard({
  title,
  unit,
  loading,
  empty,
  emptyText = 'No data recorded in this period yet.',
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
  };
}

const dayTick = (v: unknown) => dayLabel(String(v));
const dayTooltipLabel = (label: ReactNode) => dayLabel(String(label));
const legendStyle = { fontSize: 12, paddingTop: 8 };

export function PriceMovementsChart({ data, height = 260, legend = true }: { data: AnalyticsOverview['priceMovements']; height?: number; legend?: boolean }) {
  const { grid, axis } = useAxisProps();
  const tooltip = useTooltipStyle();
  return (
    <ChartFrame height={height} label={`Lowest blended offer price per model over time, ${data.unit}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data.series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="day" {...axis} tickFormatter={dayTick} minTickGap={24} />
          <YAxis {...axis} width={56} tickFormatter={(v: number) => formatPricePerM(v)} />
          <Tooltip {...tooltip} labelFormatter={dayTooltipLabel} formatter={(v) => (v == null ? 'No offer' : `${formatPricePerM(Number(v))} / 1M`)} />
          {legend && <Legend wrapperStyle={legendStyle} />}
          {data.models.map((m, i) => (
            <Line key={m.id} type="monotone" dataKey={m.id} name={m.name} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function OffersByModelChart({ data, height = 300 }: { data: AnalyticsOverview['offersByModel']; height?: number }) {
  const { grid, axis } = useAxisProps();
  const tooltip = useTooltipStyle();
  return (
    <ChartFrame height={height} label="Active offers and healthy offers by model">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }} barGap={2}>
          <CartesianGrid {...grid} vertical horizontal={false} />
          <XAxis type="number" allowDecimals={false} {...axis} />
          <YAxis type="category" dataKey="name" {...axis} width={130} tickFormatter={(v: string) => (v.length > 20 ? `${v.slice(0, 19)}…` : v)} />
          <Tooltip {...tooltip} formatter={(v) => `${formatNumber(Number(v))} offers`} cursor={{ fill: 'rgba(21,94,239,0.06)' }} />
          <Legend wrapperStyle={legendStyle} />
          <Bar dataKey="offers" name="Active offers" fill={CHART_COLORS[0]} radius={[0, 3, 3, 0]} isAnimationActive={false} />
          <Bar dataKey="healthy" name="Healthy or not yet measured" fill={SUCCESS_COLOR} radius={[0, 3, 3, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function RequestVolumeChart({ data, height = 260, legend = true }: { data: AnalyticsOverview['requestVolume']; height?: number; legend?: boolean }) {
  const { grid, axis } = useAxisProps();
  const tooltip = useTooltipStyle();
  return (
    <ChartFrame height={height} label="Daily request volume by outcome: successful, failed and rejected requests">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="day" {...axis} tickFormatter={dayTick} minTickGap={24} />
          <YAxis {...axis} width={44} allowDecimals={false} tickFormatter={(v: number) => formatCompact(v)} />
          <Tooltip {...tooltip} labelFormatter={dayTooltipLabel} formatter={(v) => `${formatNumber(Number(v))} requests`} cursor={{ fill: 'rgba(21,94,239,0.06)' }} />
          {legend && <Legend wrapperStyle={legendStyle} />}
          <Bar dataKey="success" name="Successful" stackId="r" fill={SUCCESS_COLOR} isAnimationActive={false} />
          <Bar dataKey="failed" name="Failed" stackId="r" fill={DANGER_COLOR} isAnimationActive={false} />
          <Bar dataKey="rejected" name="Rejected" stackId="r" fill={WARNING_COLOR} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function SavingsChart({ data, height = 260 }: { data: AnalyticsOverview['savings']; height?: number }) {
  const { grid, axis } = useAxisProps();
  const tooltip = useTooltipStyle();
  return (
    <ChartFrame height={height} label="Estimated versus realized savings per day in US dollars">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} barGap={1}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="day" {...axis} tickFormatter={dayTick} minTickGap={24} />
          <YAxis {...axis} width={60} tickFormatter={(v: number) => formatUsd(v)} />
          <Tooltip {...tooltip} labelFormatter={dayTooltipLabel} formatter={(v) => formatUsd(Number(v))} cursor={{ fill: 'rgba(21,94,239,0.06)' }} />
          <Legend wrapperStyle={legendStyle} />
          <Bar dataKey="estimatedUsd" name="Estimated (pre-request)" fill={CHART_COLORS[2]} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="realizedUsd" name="Realized (charged)" fill={SUCCESS_COLOR} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function LatencyChart({ data, height = 260 }: { data: AnalyticsOverview['latencyDistribution']; height?: number }) {
  const { grid, axis } = useAxisProps();
  const tooltip = useTooltipStyle();
  return (
    <ChartFrame height={height} label="Latency distribution of successful request attempts by latency bucket">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="bucket" {...axis} interval={0} />
          <YAxis {...axis} width={44} allowDecimals={false} tickFormatter={(v: number) => formatCompact(v)} />
          <Tooltip {...tooltip} formatter={(v) => [`${formatNumber(Number(v))} attempts`, 'Successful attempts']} cursor={{ fill: 'rgba(21,94,239,0.06)' }} />
          <Bar dataKey="count" name="Successful attempts" fill={CHART_COLORS[1]} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function ActivityChart({ data, height = 260 }: { data: AnalyticsOverview['activity']; height?: number }) {
  const { grid, axis } = useAxisProps();
  const tooltip = useTooltipStyle();
  return (
    <ChartFrame height={height} label="Daily tokens processed and active buying organizations">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="day" {...axis} tickFormatter={dayTick} minTickGap={24} />
          <YAxis yAxisId="tokens" {...axis} width={48} tickFormatter={(v: number) => formatTokens(v)} />
          <YAxis yAxisId="buyers" orientation="right" {...axis} width={32} allowDecimals={false} />
          <Tooltip
            {...tooltip}
            labelFormatter={dayTooltipLabel}
            formatter={(v, name) => (name === 'Tokens' ? `${formatTokens(Number(v))} tokens` : `${formatNumber(Number(v))} organizations`)}
            cursor={{ fill: 'rgba(21,94,239,0.06)' }}
          />
          <Legend wrapperStyle={legendStyle} />
          <Bar yAxisId="tokens" dataKey="tokens" name="Tokens" fill={CHART_COLORS[0]} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Line yAxisId="buyers" type="monotone" dataKey="activeBuyers" name="Active buyers" stroke={CHART_COLORS[1]} strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
