# Structured Response Contract

Every answer the platform returns is a **structured document**, not a block of
text. The model writes prose *and* the presentation blocks that go with it; the
backend validates both before the client sees them.

This document is the contract. It is defined in three places that must stay in
sync:

| Concern | File |
|---|---|
| What the model is asked to produce | `backend/app/rag/grounding.py` (`OUTPUT_CONTRACT`) |
| Parsing, repair, and validation | `backend/app/rag/structured.py` |
| Wire schema | `backend/app/schemas/chat.py` |
| Client types and rendering | `frontend/src/lib/response.ts`, `frontend/src/components/chat/MessageBubble.tsx` |

---

## 1. The payload

```jsonc
{
  "headline":   "One sentence that directly answers the question.",
  "answer":     "The full answer in GitHub-flavoured markdown.",
  "confidence": "supported" | "partial" | "insufficient",

  "key_points":  [{ "text": "...", "source": "Doc, p.4" }],
  "kpi_cards":   [{ "label": "...", "value": "12.4%", "change": "+1.2pp", "trend": "up", "source": "..." }],
  "table":       { "title": "...", "headers": [...], "rows": [[...]], "source": "..." },
  "visualizations": [ /* see §3 */ ],
  "flow_diagram":   { "title": "...", "nodes": [...], "edges": [...] },
  "timeline":    [{ "date": "Mar 2024", "label": "...", "detail": "..." }],

  "citations": [{ "document_id": "...", "document_name": "...", "page": 40, "section": "...", "snippet": "..." }],
  "sources":   [{ "document_id": "...", "document_name": "...", "pages": [1, 2], "top_score": 0.54 }],
  "follow_up_questions": ["..."],

  "trace_id": "...", "latency_ms": 4817, "model_used": "groq/...",
  "retrieval": { "candidates": 30, "reranked": 8, "context_chunks": 5, "top_score": 0.54 }
}
```

Every key is **always present**. Unused blocks are `null` (objects) or `[]`
(arrays), so the client never needs to defend against missing fields.

`citations` are validated against what the retriever actually returned;
`sources` lists every document consulted, whether or not the model cited it.

---

## 2. Streaming

`POST /api/chat/stream` emits Server-Sent Events. **The client never receives
JSON syntax as answer text** — the backend extracts the `answer` field
incrementally and streams only its decoded prose.

| Event | Payload | Meaning |
|---|---|---|
| `meta` | `{conversation_id, agent_id, agent_name}` | Sent first |
| `stage` | `{stage: "retrieving" \| "grounding" \| "generating" \| "rate_limited", ...}` | Drives the progress indicator |
| `source` | one `SourceRef` | A document consulted, sent before generation |
| `token` | `{text: "..."}` | Decoded answer prose |
| `structured` | the full payload above | Validated blocks, sent once generation completes |
| `done` | `{message_id, trace_id, latency_ms, model_used, confidence}` | Turn persisted |
| `error` | `{text: "..."}` | Generation failed; a `structured` frame still follows |

`token` payloads are JSON objects rather than bare strings so that leading and
trailing whitespace survives SSE line framing.

If the model produces output from which no `answer` can be recovered, the
`structured` frame sets `replace_answer: true` and the client discards whatever
prose it rendered.

---

## 3. Charts

Chart data uses a **label-value pair** shape:

```jsonc
{
  "chart_type": "bar",              // bar | line | pie | donut | area | scatter | stacked_bar | horizontal_bar
  "title": "ASK Group FY14 vs FY24",
  "series": [
    { "label": "AUM", "points": [ {"label": "FY14", "value": 8822}, {"label": "FY24", "value": 83288} ] }
  ],
  "units": "INR cr",
  "source": "Deck.pdf, p.6",
  "insight": "One sentence naming the pattern."
}
```

The older parallel-array shape (`labels` + `datasets[].data`) is still accepted
and normalized into the same internal form.

### Why pairs

Asked for a bare parallel array, weaker models merge adjacent figures — writing
`"data": [882283288]` for two labels whose real values are `8822` and `83288`.
That is a fabricated number, which the grounding rules forbid outright. Pairing
each value with its own label removes the shape that invites the mistake.

### Validation

A series is plotted only when:

- every value parses as a **single** numeric literal (`"8,822 83,288"` is rejected, not stripped to digits);
- the point count matches the label count exactly;
- no point is missing.

A series failing any of these is **dropped, never repaired** — a wrong chart
misrepresents the source document. If no series survives, the whole chart is
dropped and the numbers still reach the reader through the table and KPI cards.
Drops are logged as `chart_series_dropped` / `chart_dropped_no_valid_series`.

---

## 4. Robustness

`parse_structured_response` recovers the payload from the ways models actually
fail:

- output wrapped in ```` ```json ```` fences;
- a JSON object preceded by conversational prose;
- **truncation at `max_tokens`** — an open string is closed, a dangling key is
  dropped, and every open bracket is closed in reverse order.

Truncation is the important one. Before this existed, hitting the token ceiling
dumped the entire raw JSON object into the chat window as the "answer".

---

## 5. Colour and rendering

Charts are themed from `frontend/src/lib/chart-theme.ts`, which holds a
categorical palette validated against the app's chart surface (`#14141e`) for
the OKLCH lightness band, chroma floor, colour-vision separation, normal-vision
separation, and 3:1 contrast.

Two rules when editing it:

1. Hues are assigned in **fixed slot order and never cycled**. A ninth series
   folds into "Other" rather than inventing a colour.
2. Status colours (good / warning / serious / critical) are reserved for state
   and never reused as a series colour.

Every chart ships a **table view** toggle, so values stay readable independently
of colour.
