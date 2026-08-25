'use client';

import React, { useMemo } from 'react';
import { GitBranch } from 'lucide-react';
import { CHART_INK } from '@/lib/chart-theme';

export interface FlowNode {
  id: string;
  label: string;
  detail?: string | null;
}

export interface FlowEdge {
  from: string;
  to: string;
  label?: string | null;
}

export interface FlowDiagramSpec {
  title: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  source?: string | null;
}

interface FlowDiagramProps {
  spec: FlowDiagramSpec;
}

const NODE_W = 190;
const NODE_H = 62;
const GAP_X = 56;
const GAP_Y = 26;
const PAD = 12;

/**
 * Assign each node a depth by longest path from a root, so a process renders
 * left-to-right in dependency order rather than in whatever order the model
 * happened to list the nodes.
 */
function layerNodes(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[][] {
  const incoming = new Map<string, number>();
  nodes.forEach((n) => incoming.set(n.id, 0));
  edges.forEach((e) => incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1));

  const depth = new Map<string, number>();
  nodes.forEach((n) => depth.set(n.id, 0));

  // Relax depths; bounded by node count so a cyclic graph still terminates.
  for (let pass = 0; pass < nodes.length; pass++) {
    let changed = false;
    for (const edge of edges) {
      const next = (depth.get(edge.from) ?? 0) + 1;
      if (next > (depth.get(edge.to) ?? 0)) {
        depth.set(edge.to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const maxDepth = Math.max(0, ...Array.from(depth.values()));
  const layers: FlowNode[][] = Array.from({ length: maxDepth + 1 }, () => []);
  nodes.forEach((n) => layers[depth.get(n.id) ?? 0].push(n));
  return layers.filter((l) => l.length > 0);
}

export default function FlowDiagram({ spec }: FlowDiagramProps) {
  const layout = useMemo(() => {
    const layers = layerNodes(spec.nodes, spec.edges);
    const rows = Math.max(...layers.map((l) => l.length));

    const width = PAD * 2 + layers.length * NODE_W + (layers.length - 1) * GAP_X;
    const height = PAD * 2 + rows * NODE_H + (rows - 1) * GAP_Y;

    const positions = new Map<string, { x: number; y: number }>();
    layers.forEach((layer, col) => {
      // Centre each column vertically against the tallest column.
      const colHeight = layer.length * NODE_H + (layer.length - 1) * GAP_Y;
      const offsetY = PAD + (height - PAD * 2 - colHeight) / 2;
      layer.forEach((node, row) => {
        positions.set(node.id, {
          x: PAD + col * (NODE_W + GAP_X),
          y: offsetY + row * (NODE_H + GAP_Y),
        });
      });
    });

    return { layers, width, height, positions };
  }, [spec]);

  const { width, height, positions } = layout;

  return (
    <figure
      className="my-4 overflow-hidden rounded-[var(--r-lg)] border"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
    >
      <figcaption className="flex items-center gap-2 px-4 pt-4 pb-2">
        <GitBranch size={14} style={{ color: 'var(--spark)' }} />
        <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {spec.title}
        </h4>
      </figcaption>

      {/* Wide diagrams scroll inside the card rather than breaking the page. */}
      <div className="scroll-x px-2 pb-2">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-label={`${spec.title}: ${spec.nodes.map((n) => n.label).join(' then ')}`}
          style={{ maxWidth: '100%', height: 'auto', minWidth: Math.min(width, 520) }}
        >
          <defs>
            <marker
              id="flow-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={CHART_INK.axis} />
            </marker>
          </defs>

          {/* Edges first so nodes paint over the line ends. */}
          {spec.edges.map((edge, i) => {
            const from = positions.get(edge.from);
            const to = positions.get(edge.to);
            if (!from || !to) return null;

            const x1 = from.x + NODE_W;
            const y1 = from.y + NODE_H / 2;
            const x2 = to.x;
            const y2 = to.y + NODE_H / 2;
            const midX = (x1 + x2) / 2;

            return (
              <g key={i}>
                <path
                  d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={CHART_INK.axis}
                  strokeWidth={1.5}
                  markerEnd="url(#flow-arrow)"
                />
                {edge.label && (
                  <text
                    x={midX}
                    y={(y1 + y2) / 2 - 6}
                    textAnchor="middle"
                    fontSize={10}
                    fill={CHART_INK.textMuted}
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}

          {spec.nodes.map((node, i) => {
            const pos = positions.get(node.id);
            if (!pos) return null;
            const isFirst = i === 0;

            return (
              <g key={node.id}>
                <rect
                  x={pos.x}
                  y={pos.y}
                  width={NODE_W}
                  height={NODE_H}
                  rx={10}
                  fill={CHART_INK.surfaceRaised}
                  stroke={isFirst ? 'var(--spark)' : CHART_INK.axis}
                  strokeWidth={1.5}
                />
                <text
                  x={pos.x + 14}
                  y={pos.y + (node.detail ? 25 : 36)}
                  fontSize={12.5}
                  fontWeight={600}
                  fill={CHART_INK.textPrimary}
                >
                  {node.label.length > 24 ? `${node.label.slice(0, 23)}…` : node.label}
                </text>
                {node.detail && (
                  <text x={pos.x + 14} y={pos.y + 43} fontSize={10.5} fill={CHART_INK.textMuted}>
                    {node.detail.length > 30 ? `${node.detail.slice(0, 29)}…` : node.detail}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {spec.source && (
        <div
          className="px-4 py-2.5 border-t text-[11px]"
          style={{
            borderColor: 'var(--border-subtle)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-muted)',
          }}
        >
          Source: {spec.source}
        </div>
      )}
    </figure>
  );
}
