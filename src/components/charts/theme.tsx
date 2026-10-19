import type { ReactNode } from 'react';
import { useTheme } from '@/hooks/useTheme';

/** Shared chart palette. Blue/cyan for data; green only for savings/success. */
export const CHART_COLORS = ['#155EEF', '#06B6D4', '#3B82F6', '#6366F1', '#0EA5E9', '#84ADFF', '#0040C1'];
export const SUCCESS_COLOR = '#10B981';
export const DANGER_COLOR = '#EF4444';
export const WARNING_COLOR = '#F59E0B';

export function useChartTheme() {
  const { resolved } = useTheme();
  const dark = resolved === 'dark';
  return {
    grid: dark ? '#22304D' : '#E4ECFF',
    axis: dark ? '#94A3B8' : '#64748B',
    tooltipBg: dark ? '#111A2E' : '#FFFFFF',
    tooltipBorder: dark ? '#33415F' : '#D1E0FF',
    text: dark ? '#E2E8F0' : '#0F172A',
  };
}

/** Props for a Recharts <Tooltip contentStyle/labelStyle> matching the theme. */
export function useTooltipStyle() {
  const t = useChartTheme();
  return {
    contentStyle: { background: t.tooltipBg, border: `1px solid ${t.tooltipBorder}`, borderRadius: 8, fontSize: 12, color: t.text },
    labelStyle: { color: t.text, fontWeight: 600 },
    itemStyle: { color: t.text },
  };
}

export function ChartFrame({ height = 260, children, label }: { height?: number; children: ReactNode; label: string }) {
  return (
    <div style={{ height }} role="img" aria-label={label} className="w-full">
      {children}
    </div>
  );
}
