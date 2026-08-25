'use client';

import React, { useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { Table2, BarChart3, Info } from 'lucide-react';
import {
  CHART_INK,
  MAX_SERIES,
  axisChrome,
  formatValue,
  seriesColor,
  tooltipStyle,
} from '@/lib/chart-theme';
import { useTheme } from '@/lib/theme';

export interface ChartDataset {
  label?: string;
  data: (number | null)[];
}

export interface VisualizationSpec {
  chart_type: string;
  title: string;
  labels: string[];
  datasets: ChartDataset[];
  units?: string | null;
  source?: string | null;
  insight?: string | null;
}

interface ChartRendererProps {
  spec: VisualizationSpec;
  height?: number;
  /** Suppress the card chrome when the parent already provides it. */
  bare?: boolean;
}

const PART_TO_WHOLE = new Set(['pie', 'donut']);
/** Part-to-whole is only readable at a glance up to six segments. */
const MAX_SEGMENTS = 6;

/**
 * Cap the series count at the palette size instead of cycling hues, which
 * would make the ninth series indistinguishable from the first.
 */
function capSeries(datasets: ChartDataset[]): ChartDataset[] {
  return datasets.slice(0, MAX_SERIES);
}

/**
 * Fold part-to-whole segments past the readable limit into a single "Other"
 * slice rather than rendering an unreadable ring.
 */
function foldSegments(labels: string[], values: (number | null)[]) {
  const pairs = labels.map((name, i) => ({ name, value: values[i] ?? 0 }));
  if (pairs.length <= MAX_SEGMENTS) return pairs;

  const sorted = [...pairs].sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, MAX_SEGMENTS - 1);
  const tail = sorted.slice(MAX_SEGMENTS - 1);
  return [...head, { name: 'Other', value: tail.reduce((s, p) => s + p.value, 0) }];
}

export default function ChartRenderer({ spec, height = 300, bare = false }: ChartRendererProps) {
  const [showTable, setShowTable] = useState(false);

  const datasets = useMemo(() => capSeries(spec.datasets || []), [spec.datasets]);
  // The palette is resolved from the live theme, so the option object has to
  // be rebuilt whenever the theme flips.
  const { resolved } = useTheme();
  const multiSeries = datasets.length > 1;

  const option = useMemo(() => {
    const type = (spec.chart_type || 'bar').toLowerCase();
    const isPart = PART_TO_WHOLE.has(type);
    const isArea = type === 'area';
    const isLine = type === 'line' || isArea;
    const isScatter = type === 'scatter';
    const isHorizontal = type === 'horizontal_bar';
    const isStacked = type === 'stacked_bar';

    const base = {
      backgroundColor: 'transparent',
      textStyle: { fontFamily: 'inherit' },
      animationDuration: 450,
    };

    // ---- Part-to-whole -------------------------------------------------
    if (isPart) {
      const segments = foldSegments(spec.labels, datasets[0]?.data ?? []);

      return {
        ...base,
        tooltip: {
          ...tooltipStyle,
          trigger: 'item',
          formatter: (p: any) =>
            `${p.name}<br/><strong>${formatValue(p.value, spec.units)}</strong> (${p.percent}%)`,
        },
        legend: {
          bottom: 0,
          left: 'center',
          icon: 'roundRect',
          itemWidth: 10,
          itemHeight: 10,
          itemGap: 14,
          // Identity lives in the label text, not in colour alone.
          textStyle: { color: CHART_INK.textSecondary, fontSize: 11 },
        },
        color: segments.map((_, i) => seriesColor(i)),
        series: [
          {
            name: spec.title,
            type: 'pie',
            radius: type === 'donut' ? ['46%', '70%'] : '66%',
            center: ['50%', '46%'],
            avoidLabelOverlap: true,
            // A 2px surface gap separates slices — no borders drawn around marks.
            itemStyle: { borderColor: CHART_INK.surface, borderWidth: 2, borderRadius: 4 },
            label: {
              show: true,
              color: CHART_INK.textSecondary,
              fontSize: 11,
              formatter: '{b}\n{d}%',
              lineHeight: 15,
            },
            labelLine: { lineStyle: { color: CHART_INK.axis }, length: 8, length2: 10 },
            data: segments,
          },
        ],
      };
    }

    // ---- Cartesian -----------------------------------------------------
    const categoryAxis = {
      type: 'category' as const,
      data: spec.labels,
      boundaryGap: !isLine,
      ...axisChrome,
      splitLine: { show: false },
      axisLabel: {
        color: CHART_INK.textSecondary,
        fontSize: 11,
        interval: 0,
        // Rotate only when labels would otherwise collide.
        rotate: spec.labels.length > 6 || spec.labels.some((l) => l.length > 10) ? 30 : 0,
        hideOverlap: true,
      },
    };

    const valueAxis = {
      type: 'value' as const,
      ...axisChrome,
      axisLine: { show: false },
      axisLabel: {
        color: CHART_INK.textMuted,
        fontSize: 11,
        formatter: (v: number) => formatValue(v),
      },
    };

    const series = datasets.map((ds, idx) => {
      const color = seriesColor(idx);
      return {
        name: ds.label || spec.title,
        type: isLine ? 'line' : isScatter ? 'scatter' : 'bar',
        data: ds.data,
        stack: isStacked ? 'total' : undefined,
        // Thin marks: 2px lines, ≥8px markers, slim bars.
        barMaxWidth: 28,
        barGap: '12%',
        symbolSize: isScatter ? 10 : 8,
        showSymbol: isLine && spec.labels.length <= 12,
        smooth: isLine ? 0.25 : undefined,
        lineStyle: isLine ? { width: 2, color } : undefined,
        itemStyle: {
          color,
          // 4px rounded data-end anchored to the baseline; stacked segments
          // get a 2px surface gap instead of a border.
          borderRadius: isStacked ? 2 : !isLine && !isScatter
            ? (isHorizontal ? [0, 4, 4, 0] : [4, 4, 0, 0])
            : 0,
          borderColor: isStacked ? CHART_INK.surface : undefined,
          borderWidth: isStacked ? 2 : 0,
        },
        areaStyle: isArea
          ? {
              color: {
                type: 'linear',
                x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: `${color}59` },
                  { offset: 1, color: `${color}05` },
                ],
              },
            }
          : undefined,
        emphasis: { focus: 'series' as const },
      };
    });

    return {
      ...base,
      tooltip: {
        ...tooltipStyle,
        // Crosshair on line/area, per-mark on bar/scatter.
        trigger: isScatter ? 'item' : 'axis',
        axisPointer: {
          type: isLine ? 'line' : 'shadow',
          lineStyle: { color: CHART_INK.axis, width: 1 },
          shadowStyle: { color: resolved === 'dark' ? 'rgba(255,255,255,.05)' : 'rgba(20,20,25,.04)' },
        },
        valueFormatter: (v: any) => formatValue(v, spec.units),
      },
      // A single series is named by the title; a legend would be redundant.
      legend: multiSeries
        ? {
            top: 0,
            right: 0,
            icon: 'roundRect',
            itemWidth: 10,
            itemHeight: 10,
            itemGap: 14,
            textStyle: { color: CHART_INK.textSecondary, fontSize: 11 },
          }
        : { show: false },
      grid: {
        left: 4,
        right: 8,
        bottom: 4,
        top: multiSeries ? 32 : 12,
        containLabel: true,
      },
      xAxis: isHorizontal ? valueAxis : categoryAxis,
      yAxis: isHorizontal ? categoryAxis : valueAxis,
      series,
    };
  }, [spec, datasets, multiSeries, resolved]);

  const chart = (
    <ReactECharts
      option={option}
      style={{ height, width: '100%' }}
      opts={{ renderer: 'svg' }}
      notMerge
    />
  );

  if (bare) return chart;

  return (
    <figure
      className="my-4 overflow-hidden rounded-[var(--r-lg)] border"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
    >
      <figcaption
        className="flex items-start justify-between gap-3 px-4 pt-4 pb-2"
      >
        <div className="min-w-0">
          <h4 className="text-sm font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>
            {spec.title}
          </h4>
          {spec.units && (
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Measured in {spec.units}
            </p>
          )}
        </div>

        {/* Table view keeps every value readable regardless of colour. */}
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-lg border transition-colors hover:bg-[var(--bg-hover)]"
          style={{
            background: 'var(--bg-tertiary)',
            borderColor: 'var(--border-primary)',
            color: 'var(--text-secondary)',
          }}
          aria-pressed={showTable}
        >
          {showTable ? <BarChart3 size={12} /> : <Table2 size={12} />}
          {showTable ? 'Chart' : 'Values'}
        </button>
      </figcaption>

      <div className="px-2 pb-2">
        {showTable ? (
          <div className="scroll-x px-2 pb-2">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr style={{ color: 'var(--text-muted)' }}>
                  <th className="text-left py-2 pr-3 font-medium">Category</th>
                  {datasets.map((ds, i) => (
                    <th key={i} className="text-right py-2 px-3 font-medium whitespace-nowrap">
                      <span
                        className="inline-block w-2 h-2 rounded-sm mr-1.5 align-middle"
                        style={{ background: seriesColor(i) }}
                        aria-hidden
                      />
                      {ds.label || 'Value'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {spec.labels.map((label, r) => (
                  <tr
                    key={r}
                    className="border-t"
                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
                  >
                    <td className="py-1.5 pr-3">{label}</td>
                    {datasets.map((ds, c) => (
                      <td key={c} className="py-1.5 px-3 text-right tabular-nums">
                        {formatValue(ds.data[r], spec.units)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          chart
        )}
      </div>

      {(spec.insight || spec.source) && (
        <div
          className="px-4 py-3 border-t space-y-1"
          style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-secondary)' }}
        >
          {spec.insight && (
            <p className="text-xs flex items-start gap-1.5" style={{ color: 'var(--text-secondary)' }}>
              <Info size={12} className="mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />
              {spec.insight}
            </p>
          )}
          {spec.source && (
            <p className="text-[11px] pl-[18px]" style={{ color: 'var(--text-muted)' }}>
              Source: {spec.source}
            </p>
          )}
        </div>
      )}
    </figure>
  );
}
