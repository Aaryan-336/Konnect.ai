"""
Structured-response utilities for the RAG pipeline.

The LLM is instructed to emit a single JSON object describing a fully structured
answer (prose + key points + KPIs + table + charts + flow diagram + timeline +
citations).  Two things have to be true for the UI to render that reliably:

1. The JSON must survive imperfect models — code fences, leading prose, and
   truncation at `max_tokens` all have to be recovered from rather than dumped
   raw into the chat window.
2. Every structured block must be *shape-valid* before it reaches the client.
   A chart whose `data` length does not match its `labels` length is worse than
   no chart at all.

`parse_structured_response` handles (1), `normalize_response` handles (2), and
`AnswerFieldStreamer` lets the streaming endpoint emit the `answer` prose token
by token without ever exposing JSON syntax to the user.
"""

from __future__ import annotations

import json
import re
from typing import Any

import structlog

logger = structlog.get_logger()

# Presentation blocks the UI knows how to render.
CHART_TYPES = {"bar", "line", "pie", "donut", "area", "scatter", "stacked_bar", "horizontal_bar"}
TREND_VALUES = {"up", "down", "stable"}
CONFIDENCE_VALUES = {"supported", "partial", "insufficient"}

MAX_KEY_POINTS = 8
MAX_KPI_CARDS = 6
MAX_CHARTS = 3
MAX_TABLE_ROWS = 60
MAX_TIMELINE_EVENTS = 12
MAX_FOLLOW_UPS = 4
MAX_FLOW_NODES = 12


# --------------------------------------------------------------------------- #
# JSON recovery
# --------------------------------------------------------------------------- #

_FENCE_RE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.IGNORECASE)

# Models frequently splice inline provenance markers into the prose despite being
# told to keep citations in the citations array. They render as noise, so strip
# them and let the citation cards carry provenance instead.
_INLINE_CITATION_RE = re.compile(
    "\u3010[^\u3011]*\u3011"      # 【4|Page 10|"..."】
    r"|\[\[[^\]]*\]\]"          # [[doc:page]]
    r"|\[source:[^\]]*\]",        # [source: ...]
    re.IGNORECASE,
)


def clean_answer_text(text: str) -> str:
    """Remove inline citation markers and tidy the whitespace they leave behind."""
    if not text:
        return ""
    cleaned = _INLINE_CITATION_RE.sub("", text)
    cleaned = re.sub(r"[ \t]+([.,;:])", r"\1", cleaned)   # space before punctuation
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)           # runs of spaces
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)           # runs of blank lines
    return "\n".join(line.rstrip() for line in cleaned.split("\n")).strip()


def strip_code_fences(raw: str) -> str:
    """Remove ```json ... ``` wrappers some models add despite JSON mode."""
    return _FENCE_RE.sub("", raw.strip())


def _slice_outermost_object(text: str) -> str | None:
    """
    Return the substring spanning the first top-level JSON object.

    Brace counting is string-aware so that braces inside answer prose (common in
    markdown code samples) do not terminate the object early.
    """
    start = text.find("{")
    if start == -1:
        return None

    depth = 0
    in_string = False
    escaped = False

    for i in range(start, len(text)):
        ch = text[i]
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start:i + 1]

    # Unbalanced — the model was cut off mid-object.
    return text[start:]


def _repair_truncated_json(fragment: str) -> str:
    """
    Best-effort close of a JSON object truncated mid-generation.

    Closes an open string, drops a dangling key/comma, then closes every open
    bracket in reverse order.  This turns a `max_tokens` truncation into a
    partial-but-usable answer instead of a raw JSON dump in the chat window.
    """
    stack: list[str] = []
    in_string = False
    escaped = False
    last_safe = 0  # index just past the last completed value

    for i, ch in enumerate(fragment):
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
                last_safe = i + 1
            continue
        if ch == '"':
            in_string = True
        elif ch in "{[":
            stack.append("}" if ch == "{" else "]")
        elif ch in "}]":
            if stack:
                stack.pop()
            last_safe = i + 1
        elif ch in ",:":
            pass
        elif not ch.isspace():
            last_safe = i + 1

    repaired = fragment
    if in_string:
        # Cut back to the last completed value and close the containing string.
        repaired = fragment + '"'
    else:
        repaired = fragment[:last_safe] if last_safe else fragment

    # Remove a trailing comma or a dangling `"key":` with no value.
    repaired = re.sub(r",\s*$", "", repaired.rstrip())
    repaired = re.sub(r',?\s*"[^"]*"\s*:\s*$', "", repaired.rstrip())

    return repaired + "".join(reversed(stack))


def parse_structured_response(raw: str) -> dict[str, Any] | None:
    """
    Parse the model's raw output into a dict, recovering from common defects.

    Returns None only when no JSON object can be salvaged at all.
    """
    if not raw or not raw.strip():
        return None

    candidate = strip_code_fences(raw)

    try:
        parsed = json.loads(candidate)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    fragment = _slice_outermost_object(candidate)
    if fragment is None:
        return None

    try:
        parsed = json.loads(fragment)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    try:
        parsed = json.loads(_repair_truncated_json(fragment))
        if isinstance(parsed, dict):
            logger.info("structured_json_repaired", length=len(fragment))
            return parsed
    except json.JSONDecodeError:
        logger.warning("structured_json_unrecoverable", length=len(raw))

    return None


# --------------------------------------------------------------------------- #
# Coercion helpers
# --------------------------------------------------------------------------- #

def _as_text(value: Any, limit: int = 2000) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()[:limit]
    if isinstance(value, (int, float, bool)):
        return str(value)
    return json.dumps(value, ensure_ascii=False)[:limit]


# A single numeric literal: optional sign and currency prefix, digits with
# optional thousands separators, optional decimals, optional trailing % or unit
# word. Anchored, so a string holding two numbers ("8,822 83,288") is rejected
# rather than mashed into one fabricated figure.
_NUMBER_RE = re.compile(
    r"""^
    [^\d\-+.]{0,3}                       # currency symbol or similar prefix
    \s*
    (?P<sign>[-+])?
    (?P<int>\d{1,3}(?:,\d{3})+|\d+)      # 1,234,567 or 1234567
    (?P<frac>\.\d+)?
    \s*
    (?:%|[A-Za-z]{1,3})?                  # trailing % or short unit
    $""",
    re.VERBOSE,
)


def _as_number(value: Any) -> float | None:
    """
    Coerce a model-supplied cell into a number, or None if it is not one.

    Deliberately strict. A permissive parser that strips every non-digit turns
    "8,822 83,288" into 882283288 — a figure no source contains. Refusing to
    guess is the only safe behaviour for a grounded system.
    """
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if not isinstance(value, str):
        return None

    match = _NUMBER_RE.match(value.strip())
    if not match:
        return None

    literal = f"{match.group('sign') or ''}{match.group('int').replace(',', '')}{match.group('frac') or ''}"
    try:
        return float(literal)
    except ValueError:
        return None


def _as_list(value: Any) -> list:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


# --------------------------------------------------------------------------- #
# Block normalizers
# --------------------------------------------------------------------------- #

def _extract_series(spec: dict) -> tuple[list[str], list[dict]] | None:
    """
    Read a chart's labels and series from either accepted shape.

    Preferred shape pairs each value with its own label:
        {"series": [{"label": "AUM", "points": [{"label": "FY14", "value": 8822}, ...]}]}

    Weak models reliably merge values when asked for a bare parallel array
    ("data": [882283288] for two labels), and a merged figure is a fabricated
    one. Pairing each number with its label removes the shape that invites the
    mistake. The parallel-array shape is still accepted:
        {"labels": [...], "datasets": [{"label": "AUM", "data": [...]}]}
    """
    raw_series = _as_list(spec.get("series"))
    if raw_series:
        labels: list[str] = []
        parsed: list[tuple[str, dict[str, float]]] = []

        for entry in raw_series:
            if not isinstance(entry, dict):
                continue
            points = _as_list(entry.get("points") or entry.get("data"))
            values: dict[str, float] = {}
            for point in points:
                if not isinstance(point, dict):
                    continue
                key = _as_text(point.get("label") or point.get("x") or point.get("name"), 120)
                value = _as_number(point.get("value") if "value" in point else point.get("y"))
                if not key or value is None:
                    continue
                values[key] = value
                if key not in labels:
                    labels.append(key)
            if values:
                parsed.append((
                    _as_text(entry.get("label") or spec.get("title") or "Series", 120),
                    values,
                ))

        if not labels or not parsed:
            return None

        datasets = []
        for label, values in parsed:
            # Every label must have a value; a gap means the model dropped a
            # figure rather than the source lacking one.
            if any(key not in values for key in labels):
                logger.info("chart_series_dropped", title=spec.get("title"), label=label,
                            reason="missing_points")
                continue
            datasets.append({"label": label, "data": [values[key] for key in labels]})

        return (labels, datasets) if datasets else None

    # Parallel-array shape.
    labels = [_as_text(x, 120) for x in _as_list(spec.get("labels"))]
    if not labels:
        return None

    raw_datasets = _as_list(spec.get("datasets"))
    if not raw_datasets and spec.get("data") is not None:
        raw_datasets = [{"label": spec.get("title"), "data": spec.get("data")}]

    datasets = []
    for ds in raw_datasets:
        if not isinstance(ds, dict):
            continue

        values = [_as_number(v) for v in _as_list(ds.get("data"))]

        # A series is plotted only when every point parsed and the point count
        # matches the labels. Anything else means the numbers are not
        # trustworthy, and a wrong chart misrepresents the source document.
        if len(values) != len(labels) or any(v is None for v in values):
            logger.info(
                "chart_series_dropped",
                title=spec.get("title"),
                label=ds.get("label"),
                labels=len(labels),
                points=len(values),
                unparsed=sum(1 for v in values if v is None),
            )
            continue

        datasets.append({
            "label": _as_text(ds.get("label") or spec.get("title") or "Series", 120),
            "data": values,
        })

    return (labels, datasets) if datasets else None


def _normalize_chart(spec: Any) -> dict | None:
    """
    Validate one visualization spec.

    Dropped entirely when labels or series are missing, misaligned, or
    unparseable — a wrong chart misrepresents the source document, which the
    grounding rules forbid.
    """
    if not isinstance(spec, dict):
        return None

    chart_type = _as_text(spec.get("chart_type") or spec.get("type")).lower().replace("-", "_")
    if chart_type not in CHART_TYPES:
        chart_type = "bar"

    extracted = _extract_series(spec)
    if extracted is None:
        logger.info("chart_dropped_no_valid_series", title=spec.get("title"))
        return None

    labels, datasets = extracted

    # A single data point is a statistic, not a chart.
    if len(labels) < 2:
        return None

    return {
        "chart_type": chart_type,
        "title": _as_text(spec.get("title") or "Chart", 160),
        "labels": labels,
        "datasets": datasets,
        "units": _as_text(spec.get("units"), 40) or None,
        "source": _as_text(spec.get("source"), 300) or None,
        "insight": _as_text(spec.get("insight"), 400) or None,
    }


def _normalize_table(spec: Any) -> dict | None:
    if not isinstance(spec, dict):
        return None

    headers = [_as_text(h, 120) for h in _as_list(spec.get("headers"))]
    raw_rows = _as_list(spec.get("rows"))
    if not headers or not raw_rows:
        return None

    rows = []
    for row in raw_rows[:MAX_TABLE_ROWS]:
        cells = _as_list(row)
        normalized = [
            cell if isinstance(cell, (int, float)) and not isinstance(cell, bool)
            else (None if cell is None else _as_text(cell, 300))
            for cell in cells
        ]
        # Pad/trim so the table never renders ragged.
        if len(normalized) < len(headers):
            normalized += [None] * (len(headers) - len(normalized))
        rows.append(normalized[:len(headers)])

    if not rows:
        return None

    return {
        "title": _as_text(spec.get("title"), 160) or None,
        "headers": headers,
        "rows": rows,
        "source": _as_text(spec.get("source"), 300) or None,
    }


def _normalize_kpis(value: Any) -> list[dict]:
    cards = []
    for item in _as_list(value)[:MAX_KPI_CARDS]:
        if not isinstance(item, dict):
            continue
        label = _as_text(item.get("label"), 80)
        raw_value = item.get("value")
        if not label or raw_value is None or _as_text(raw_value, 60) == "":
            continue
        trend = _as_text(item.get("trend"), 20).lower()
        cards.append({
            "label": label,
            "value": _as_text(raw_value, 60),
            "change": _as_text(item.get("change"), 60) or None,
            "trend": trend if trend in TREND_VALUES else None,
            "source": _as_text(item.get("source"), 200) or None,
        })
    return cards


def _normalize_key_points(value: Any) -> list[dict]:
    points = []
    for item in _as_list(value)[:MAX_KEY_POINTS]:
        if isinstance(item, str):
            text = item.strip()
            source = None
        elif isinstance(item, dict):
            text = _as_text(item.get("text") or item.get("point"), 400)
            source = _as_text(item.get("source") or item.get("document_name"), 200) or None
        else:
            continue
        if text:
            points.append({"text": text[:400], "source": source})
    return points


def _normalize_flow(spec: Any) -> dict | None:
    """Normalize a process/flow diagram into nodes + edges the SVG renderer accepts."""
    if not isinstance(spec, dict):
        return None

    raw_nodes = _as_list(spec.get("nodes"))
    nodes = []
    seen_ids: set[str] = set()

    for idx, item in enumerate(raw_nodes[:MAX_FLOW_NODES]):
        if isinstance(item, str):
            node_id, label, detail = f"n{idx + 1}", item.strip(), None
        elif isinstance(item, dict):
            label = _as_text(item.get("label") or item.get("name"), 90)
            node_id = _as_text(item.get("id"), 40) or f"n{idx + 1}"
            detail = _as_text(item.get("detail") or item.get("description"), 200) or None
        else:
            continue
        if not label or node_id in seen_ids:
            continue
        seen_ids.add(node_id)
        nodes.append({"id": node_id, "label": label, "detail": detail})

    if len(nodes) < 2:
        return None

    edges = []
    for item in _as_list(spec.get("edges")):
        if not isinstance(item, dict):
            continue
        src = _as_text(item.get("from") or item.get("source"), 40)
        dst = _as_text(item.get("to") or item.get("target"), 40)
        if src in seen_ids and dst in seen_ids and src != dst:
            edges.append({"from": src, "to": dst, "label": _as_text(item.get("label"), 60) or None})

    # A node list with no usable edges still reads as a sequence — chain it.
    if not edges:
        edges = [
            {"from": nodes[i]["id"], "to": nodes[i + 1]["id"], "label": None}
            for i in range(len(nodes) - 1)
        ]

    return {
        "title": _as_text(spec.get("title"), 160) or "Process Flow",
        "nodes": nodes,
        "edges": edges,
        "source": _as_text(spec.get("source"), 300) or None,
    }


def _normalize_timeline(value: Any) -> list[dict]:
    events = []
    for item in _as_list(value)[:MAX_TIMELINE_EVENTS]:
        if not isinstance(item, dict):
            continue
        label = _as_text(item.get("label") or item.get("event"), 160)
        if not label:
            continue
        events.append({
            "date": _as_text(item.get("date") or item.get("when"), 60) or None,
            "label": label,
            "detail": _as_text(item.get("detail") or item.get("description"), 300) or None,
        })
    return events


def _normalize_citations(value: Any) -> list[dict]:
    citations = []
    for item in _as_list(value):
        if not isinstance(item, dict):
            continue
        name = _as_text(item.get("document_name") or item.get("document"), 300)
        if not name:
            continue
        page = item.get("page")
        page_num = int(page) if isinstance(page, (int, float)) and not isinstance(page, bool) else None
        if page_num is None and isinstance(page, str) and page.strip().isdigit():
            page_num = int(page.strip())
        citations.append({
            "document_name": name,
            "page": page_num,
            "section": _as_text(item.get("section"), 300) or None,
            "snippet": _as_text(item.get("snippet") or item.get("quote"), 600),
        })
    return citations


def normalize_response(data: dict | None, fallback_answer: str = "") -> dict:
    """
    Coerce raw model output into the exact contract the frontend renders.

    Every key is always present so the client never has to defend against
    missing fields.
    """
    data = data if isinstance(data, dict) else {}

    answer = clean_answer_text(_as_text(data.get("answer"), 20000) or fallback_answer)

    confidence = _as_text(data.get("confidence"), 20).lower()
    if confidence not in CONFIDENCE_VALUES:
        confidence = "supported" if answer else "insufficient"

    # Accept both the singular legacy key and the plural one.
    raw_charts = _as_list(data.get("visualizations"))
    if data.get("visualization"):
        raw_charts = [data["visualization"]] + raw_charts

    charts = []
    for spec in raw_charts:
        chart = _normalize_chart(spec)
        if chart:
            charts.append(chart)
        if len(charts) >= MAX_CHARTS:
            break

    follow_ups = [
        _as_text(q, 200) for q in _as_list(data.get("follow_up_questions"))[:MAX_FOLLOW_UPS]
    ]

    return {
        "answer": answer,
        "headline": _as_text(data.get("headline") or data.get("summary"), 240) or None,
        "confidence": confidence,
        "key_points": _normalize_key_points(data.get("key_points")),
        "kpi_cards": _normalize_kpis(data.get("kpi_cards")),
        "table": _normalize_table(data.get("table")),
        "visualizations": charts,
        "flow_diagram": _normalize_flow(data.get("flow_diagram") or data.get("flow")),
        "timeline": _normalize_timeline(data.get("timeline")),
        "citations": _normalize_citations(data.get("citations")),
        "follow_up_questions": [q for q in follow_ups if q],
    }


# --------------------------------------------------------------------------- #
# Incremental answer streaming
# --------------------------------------------------------------------------- #

class AnswerFieldStreamer:
    """
    Extracts the decoded value of a single top-level JSON string field as it
    arrives, so the client can render prose while the model is still writing
    the structured blocks that follow it.

    Usage:
        streamer = AnswerFieldStreamer()
        for token in llm_stream:
            delta = streamer.feed(token)   # decoded plain text, may be ""
    """

    _SEEK_KEY = 0
    _SEEK_COLON = 1
    _SEEK_QUOTE = 2
    _IN_STRING = 3
    _DONE = 4

    def __init__(self, field: str = "answer"):
        self._needle = f'"{field}"'
        self._buffer = ""
        self._state = self._SEEK_KEY
        self._escape = False
        self._unicode: str | None = None

    @property
    def started(self) -> bool:
        return self._state >= self._IN_STRING

    @property
    def finished(self) -> bool:
        return self._state == self._DONE

    def feed(self, text: str) -> str:
        """Consume raw model output; return newly decoded answer characters."""
        if self._state == self._DONE or not text:
            return ""

        self._buffer += text
        out: list[str] = []

        while self._buffer:
            if self._state == self._SEEK_KEY:
                idx = self._buffer.find(self._needle)
                if idx == -1:
                    # Keep a tail long enough to match a key split across tokens.
                    keep = len(self._needle)
                    self._buffer = self._buffer[-keep:] if len(self._buffer) > keep else self._buffer
                    return "".join(out)
                self._buffer = self._buffer[idx + len(self._needle):]
                self._state = self._SEEK_COLON

            elif self._state == self._SEEK_COLON:
                stripped = self._buffer.lstrip()
                if not stripped:
                    self._buffer = ""
                    return "".join(out)
                if stripped[0] != ":":
                    # Not the key we wanted (e.g. nested "answer" inside prose).
                    self._state = self._SEEK_KEY
                    continue
                self._buffer = stripped[1:]
                self._state = self._SEEK_QUOTE

            elif self._state == self._SEEK_QUOTE:
                stripped = self._buffer.lstrip()
                if not stripped:
                    self._buffer = ""
                    return "".join(out)
                if stripped[0] != '"':
                    # Value is null or non-string — nothing to stream.
                    self._state = self._DONE
                    return "".join(out)
                self._buffer = stripped[1:]
                self._state = self._IN_STRING

            elif self._state == self._IN_STRING:
                consumed = self._consume_string(out)
                if not consumed:
                    return "".join(out)

            else:
                break

        return "".join(out)

    def _consume_string(self, out: list[str]) -> bool:
        """Decode buffered string content. Returns False when it needs more input."""
        i = 0
        buf = self._buffer

        while i < len(buf):
            ch = buf[i]

            if self._unicode is not None:
                self._unicode += ch
                i += 1
                if len(self._unicode) == 4:
                    try:
                        out.append(chr(int(self._unicode, 16)))
                    except ValueError:
                        pass
                    self._unicode = None
                continue

            if self._escape:
                self._escape = False
                i += 1
                if ch == "u":
                    self._unicode = ""
                else:
                    out.append(
                        {"n": "\n", "t": "\t", "r": "\r", "b": "\b", "f": "\f"}.get(ch, ch)
                    )
                continue

            if ch == "\\":
                self._escape = True
                i += 1
                continue

            if ch == '"':
                self._buffer = buf[i + 1:]
                self._state = self._DONE
                return True

            out.append(ch)
            i += 1

        self._buffer = ""
        return False
