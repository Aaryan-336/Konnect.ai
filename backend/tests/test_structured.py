"""
Unit tests for structured-response parsing, normalization, and streaming.

These cover the failure modes that previously leaked raw JSON into the chat
window or plotted numbers no source document contains.
"""

import json

from app.rag.structured import (
    AnswerFieldStreamer,
    _as_number,
    clean_answer_text,
    normalize_response,
    parse_structured_response,
)


# --------------------------------------------------------------------------- #
# JSON recovery
# --------------------------------------------------------------------------- #

def test_parses_clean_json():
    parsed = parse_structured_response('{"answer": "hi", "confidence": "supported"}')
    assert parsed == {"answer": "hi", "confidence": "supported"}


def test_strips_code_fences():
    parsed = parse_structured_response('```json\n{"answer": "hi"}\n```')
    assert parsed["answer"] == "hi"


def test_ignores_leading_prose():
    parsed = parse_structured_response('Sure! Here it is:\n{"answer": "hi"}')
    assert parsed["answer"] == "hi"


def test_recovers_truncated_object():
    """A response cut off at max_tokens must still yield the answer."""
    truncated = (
        '{\n  "answer": "### Types\\n\\n- **A**\\n- **B**",\n'
        '  "confidence": "supported",\n'
        '  "citations": [{"document_name": "Deck.pdf", "page": 40}],\n'
        '  "table": null,'
    )
    parsed = parse_structured_response(truncated)
    assert parsed is not None
    assert parsed["answer"].startswith("### Types")
    assert parsed["confidence"] == "supported"


def test_recovers_truncation_mid_string():
    parsed = parse_structured_response('{"answer": "The fund targets **secured lending** and')
    assert parsed is not None
    assert "secured lending" in parsed["answer"]


def test_returns_none_when_no_object_present():
    assert parse_structured_response("no json here at all") is None
    assert parse_structured_response("") is None


def test_braces_inside_answer_do_not_end_the_object():
    raw = '{"answer": "Use {curly} braces", "confidence": "partial"}'
    assert parse_structured_response(raw)["confidence"] == "partial"


# --------------------------------------------------------------------------- #
# Numeric coercion
# --------------------------------------------------------------------------- #

def test_number_parsing_accepts_real_figures():
    assert _as_number("8,822") == 8822.0
    assert _as_number("INR 1,120") == 1120.0
    assert _as_number("12.4%") == 12.4
    assert _as_number(-45) == -45.0
    assert _as_number("403 cr") == 403.0


def test_number_parsing_rejects_merged_and_junk_values():
    """Two figures run together must not become one fabricated number."""
    assert _as_number("8,822 83,288") is None
    assert _as_number("n/a") is None
    assert _as_number("") is None
    assert _as_number(True) is None


# --------------------------------------------------------------------------- #
# Chart validation
# --------------------------------------------------------------------------- #

def _chart(spec):
    return normalize_response({"answer": "x", "confidence": "supported",
                               "visualizations": [spec]})["visualizations"]


def test_chart_accepts_label_value_pairs():
    charts = _chart({
        "chart_type": "bar",
        "title": "FY14 vs FY24",
        "units": "INR cr",
        "series": [
            {"label": "AUM", "points": [
                {"label": "FY14", "value": 8822}, {"label": "FY24", "value": 83288}]},
            {"label": "PAT", "points": [
                {"label": "FY14", "value": 9}, {"label": "FY24", "value": 403}]},
        ],
    })
    assert len(charts) == 1
    assert charts[0]["labels"] == ["FY14", "FY24"]
    assert charts[0]["datasets"][0]["data"] == [8822.0, 83288.0]
    assert charts[0]["datasets"][1]["data"] == [9.0, 403.0]


def test_chart_accepts_parallel_arrays():
    charts = _chart({
        "chart_type": "line",
        "title": "Quarterly",
        "labels": ["Q1", "Q2", "Q3"],
        "datasets": [{"label": "Revenue", "data": [10, 20, 30]}],
    })
    assert charts[0]["datasets"][0]["data"] == [10.0, 20.0, 30.0]


def test_chart_dropped_when_series_shorter_than_labels():
    """A merged figure leaves one point for two labels — never plot it."""
    assert _chart({
        "chart_type": "bar",
        "title": "Merged",
        "labels": ["FY14", "FY24"],
        "datasets": [{"label": "AUM", "data": [882283288]}],
    }) == []


def test_chart_series_with_missing_point_is_dropped():
    charts = _chart({
        "chart_type": "bar",
        "title": "Gap",
        "series": [
            {"label": "A", "points": [
                {"label": "X", "value": 1}, {"label": "Y", "value": 2}]},
            {"label": "B", "points": [{"label": "X", "value": 5}]},
        ],
    })
    assert [ds["label"] for ds in charts[0]["datasets"]] == ["A"]


def test_single_point_is_not_a_chart():
    assert _chart({
        "chart_type": "bar",
        "title": "Solo",
        "labels": ["Only"],
        "datasets": [{"label": "X", "data": [5]}],
    }) == []


def test_unknown_chart_type_falls_back_to_bar():
    charts = _chart({
        "chart_type": "radar",
        "title": "Odd",
        "labels": ["A", "B"],
        "datasets": [{"label": "X", "data": [1, 2]}],
    })
    assert charts[0]["chart_type"] == "bar"


# --------------------------------------------------------------------------- #
# Other blocks
# --------------------------------------------------------------------------- #

def test_table_rows_are_padded_to_header_width():
    table = normalize_response({
        "answer": "x", "confidence": "supported",
        "table": {"headers": ["A", "B"], "rows": [["x", 1], ["y"]]},
    })["table"]
    assert table["rows"] == [["x", 1], ["y", None]]


def test_kpi_without_label_or_value_is_dropped():
    cards = normalize_response({
        "answer": "x", "confidence": "supported",
        "kpi_cards": [
            {"label": "AUM", "value": "INR 1,200 cr", "trend": "up"},
            {"label": "", "value": 5},
            {"label": "Missing", "value": None},
        ],
    })["kpi_cards"]
    assert len(cards) == 1
    assert cards[0]["label"] == "AUM"


def test_flow_without_edges_is_chained_in_order():
    flow = normalize_response({
        "answer": "x", "confidence": "supported",
        "flow_diagram": {"title": "Flow", "nodes": [
            {"id": "n1", "label": "Origination"},
            {"id": "n2", "label": "Diligence"},
            {"id": "n3", "label": "Approval"},
        ], "edges": []},
    })["flow_diagram"]
    assert [(e["from"], e["to"]) for e in flow["edges"]] == [("n1", "n2"), ("n2", "n3")]


def test_flow_with_one_node_is_dropped():
    assert normalize_response({
        "answer": "x", "confidence": "supported",
        "flow_diagram": {"title": "Flow", "nodes": [{"id": "n1", "label": "Only"}]},
    })["flow_diagram"] is None


def test_legacy_singular_visualization_key_is_accepted():
    charts = normalize_response({
        "answer": "x", "confidence": "supported",
        "visualization": {"chart_type": "bar", "title": "Legacy",
                          "labels": ["A", "B"], "datasets": [{"label": "X", "data": [1, 2]}]},
    })["visualizations"]
    assert len(charts) == 1


def test_normalize_always_returns_every_key():
    result = normalize_response(None, fallback_answer="fallback text")
    for key in ("answer", "confidence", "key_points", "kpi_cards", "table",
                "visualizations", "flow_diagram", "timeline", "citations",
                "follow_up_questions"):
        assert key in result
    assert result["answer"] == "fallback text"


# --------------------------------------------------------------------------- #
# Answer text cleanup
# --------------------------------------------------------------------------- #

def test_inline_citation_markers_are_stripped():
    text = '- **LAS** – the core vehicle.\u30104|Page 10|"quoted"\u3011\n\n\n\nDone .'
    assert clean_answer_text(text) == "- **LAS** – the core vehicle.\n\nDone."


# --------------------------------------------------------------------------- #
# Incremental streaming
# --------------------------------------------------------------------------- #

def test_streamer_decodes_answer_character_by_character():
    raw = ('{\n  "headline": "x",\n'
           '  "answer": "Line one\\nLine two \\"quoted\\" and \\u00e9",\n'
           '  "confidence": "supported"}')
    streamer = AnswerFieldStreamer()
    out = "".join(streamer.feed(ch) for ch in raw)
    assert out == 'Line one\nLine two "quoted" and é'
    assert streamer.finished


def test_streamer_handles_multi_character_tokens():
    tokens = ['{"ans', 'wer": "Hel', 'lo **world', '**\\n\\n- item"', ', "confidence": "supported"}']
    streamer = AnswerFieldStreamer()
    assert "".join(streamer.feed(t) for t in tokens) == "Hello **world**\n\n- item"


def test_streamer_emits_nothing_before_the_answer_field():
    streamer = AnswerFieldStreamer()
    assert streamer.feed('{"headline": "a headline", "confidence": "supported", ') == ""
    assert not streamer.started
    assert streamer.feed('"answer": "now') == "now"
    assert streamer.started


def test_streamer_never_emits_json_syntax():
    """The whole point: the client must never see braces or field names."""
    raw = json.dumps({
        "headline": "h",
        "answer": "Real answer text",
        "confidence": "supported",
        "citations": [{"document_name": "d.pdf", "snippet": "not the answer"}],
    })
    streamer = AnswerFieldStreamer()
    out = "".join(streamer.feed(ch) for ch in raw)
    assert out == "Real answer text"
    assert "{" not in out and "citations" not in out
