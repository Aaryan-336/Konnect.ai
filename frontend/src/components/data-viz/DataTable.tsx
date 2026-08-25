'use client';

import React, { useState, useMemo } from 'react';
import { ArrowUpDown, ChevronDown, ChevronUp, Download } from 'lucide-react';

interface TableData {
  title?: string | null;
  headers: string[];
  rows: (string | number | null)[][];
  source?: string | null;
}

interface DataTableProps {
  data: TableData;
  title?: string;
}

export default function DataTable({ data, title }: DataTableProps) {
  // The spec may carry its own title; the prop overrides it.
  const heading = title || data.title || null;
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [filterText, setFilterText] = useState<string>('');

  const handleSort = (colIndex: number) => {
    if (sortCol === colIndex) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(colIndex);
      setSortAsc(true);
    }
  };

  const processedRows = useMemo(() => {
    let list = [...data.rows];

    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      list = list.filter((row) =>
        row.some((cell) => cell !== null && String(cell).toLowerCase().includes(q))
      );
    }

    if (sortCol !== null) {
      list.sort((a, b) => {
        const valA = a[sortCol];
        const valB = b[sortCol];

        if (valA === null) return 1;
        if (valB === null) return -1;

        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortAsc ? valA - valB : valB - valA;
        }

        return sortAsc
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA));
      });
    }

    return list;
  }, [data.rows, filterText, sortCol, sortAsc]);

  const exportCSV = () => {
    const csvContent = [
      data.headers.join(','),
      ...data.rows.map((r) =>
        r.map((cell) => `"${cell !== null ? String(cell).replace(/"/g, '""') : ''}"`).join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${heading || 'table_export'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="mb-4 mt-3 rounded-[var(--r-lg)] border p-4 transition-all"
      style={{
        background: 'var(--bg-card)',
        borderColor: 'var(--border-primary)',
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          {heading && (
            <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {heading}
            </h4>
          )}
          {data.source && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Source: {data.source}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Filter table..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="px-2.5 py-1 text-xs rounded-lg border outline-none focus:border-[var(--accent)]"
            style={{
              background: 'var(--bg-tertiary)',
              borderColor: 'var(--border-primary)',
              color: 'var(--text-primary)',
            }}
          />
          <button
            onClick={exportCSV}
            title="Export CSV"
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border hover:bg-[var(--bg-hover)] transition-colors"
            style={{
              background: 'var(--bg-tertiary)',
              borderColor: 'var(--border-primary)',
              color: 'var(--text-secondary)',
            }}
          >
            <Download size={13} />
            CSV
          </button>
        </div>
      </div>

      <div className="scroll-x">
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
              {data.headers.map((h, i) => (
                <th
                  key={i}
                  onClick={() => handleSort(i)}
                  className="py-2.5 px-3 font-semibold cursor-pointer select-none hover:text-[var(--accent)] transition-colors border-b"
                  style={{ borderColor: 'var(--border-primary)' }}
                >
                  <div className="flex items-center gap-1.5">
                    <span>{h}</span>
                    {sortCol === i ? (
                      sortAsc ? (
                        <ChevronUp size={13} />
                      ) : (
                        <ChevronDown size={13} />
                      )
                    ) : (
                      <ArrowUpDown size={12} className="opacity-40" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {processedRows.map((row, rIdx) => (
              <tr
                key={rIdx}
                className="border-b transition-colors hover:bg-[var(--bg-hover)]"
                style={{
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                {row.map((cell, cIdx) => (
                  <td key={cIdx} className="py-2 px-3">
                    {cell !== null && cell !== undefined ? String(cell) : '—'}
                  </td>
                ))}
              </tr>
            ))}
            {processedRows.length === 0 && (
              <tr>
                <td
                  colSpan={data.headers.length}
                  className="py-4 text-center text-xs"
                  style={{ color: 'var(--text-muted)' }}
                >
                  No matching records
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
