import { useMemo } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { LineChart as LineChartIcon } from 'lucide-react';
import { formatDateTime, formatPricePerM } from '@/lib/format';
import { EmptyState } from '@/components/ui';
import { CHART_COLORS, ChartFrame, useChartTheme, useTooltipStyle } from '@/components/charts/theme';
import type { ModelDetailResponse } from '@/types/api';

type Point = Record<string, number>;

/** Step chart of each offer's output price over time (prices change in discrete steps). */
export function PriceHistoryChart({
  history,
  offers,
  baselineOutputPerM,
}: {
  history: ModelDetailResponse['priceHistory'];
  offers: ModelDetailResponse['offers'];
  baselineOutputPerM: number | null;
}) {
  const theme = useChartTheme();
  const tooltip = useTooltipStyle();

  const { rows, series } = useMemo(() => {
    const names = new Map(offers.map((o) => [o.id, o.seller.name]));
    const ids = [...new Set(history.map((h) => h.offerId))];
    const byTime = new Map<number, Point>();
    for (const h of history) {
      const t = new Date(h.at).getTime();
      const row = byTime.get(t) ?? { t };
      row[h.offerId] = h.outputPerM;
      byTime.set(t, row);
    }
    // Extend currently listed offers to "now" with their current price so steps render to the present.
    const now = Date.now();
    const current = offers.filter((o) => ids.includes(o.id));
    if (current.length) {
      const row = byTime.get(now) ?? { t: now };
      for (const o of current) row[o.id] = o.outputPerM;
      byTime.set(now, row);
    }
    const sorted = [...byTime.values()].sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
    return {
      rows: sorted,
      series: ids.map((id, i) => ({ id, name: names.get(id) ?? `Offer …${id.slice(-6)}`, color: CHART_COLORS[i % CHART_COLORS.length]! })),
    };
  }, [history, offers]);

  if (!history.length) {
    return <EmptyState icon={<LineChartIcon className="h-5 w-5" aria-hidden />} title="No price history yet" description="Price changes for this model's offers over the last 30 days will appear here." />;
  }

  return (
    <ChartFrame height={280} label={`Output price per 1M tokens over time for ${series.length} offer${series.length === 1 ? '' : 's'}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            stroke={theme.axis}
            fontSize={12}
            tickLine={false}
          />
          <YAxis tickFormatter={(v: number) => formatPricePerM(v)} stroke={theme.axis} fontSize={12} tickLine={false} axisLine={false} width={64} />
          <Tooltip {...tooltip} labelFormatter={(label) => formatDateTime(new Date(Number(label)))} formatter={(value, name) => [`${formatPricePerM(Number(value))} / 1M out`, name]} />
          <Legend wrapperStyle={{ fontSize: 12, color: theme.axis }} />
          {baselineOutputPerM !== null && (
            <ReferenceLine y={baselineOutputPerM} stroke={theme.axis} strokeDasharray="6 4" label={{ value: 'Baseline', position: 'insideTopRight', fill: theme.axis, fontSize: 11 }} />
          )}
          {series.map((s) => (
            <Line key={s.id} type="stepAfter" dataKey={s.id} name={s.name} stroke={s.color} strokeWidth={2} dot={{ r: 2.5 }} connectNulls isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
