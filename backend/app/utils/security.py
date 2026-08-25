"""Input sanitization and prompt injection protection utilities."""

import re
import html


def sanitize_html(text: str) -> str:
    """Escape HTML entities to prevent XSS."""
    return html.escape(text)


def sanitize_user_input(text: str, max_length: int = 10000) -> str:
    """Sanitize user input — trim, length check, basic cleanup."""
    if not text:
        return ""
    text = text.strip()
    if len(text) > max_length:
        text = text[:max_length]
    return text


def detect_prompt_injection(text: str) -> bool:
    """
    Basic prompt injection detection.

    Returns True if suspicious patterns are detected.
    This is a defense-in-depth measure, not the sole protection.
    The grounding engine's system prompt is the primary defense.
    """
    patterns = [
        r"ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|rules|guidelines|prompts|constraints)",
        r"disregard\s+(all\s+)?(previous|above|prior)\s*(instructions|rules|guidelines|prompts|constraints)?",
        r"forget\s+(all\s+)?(previous|above|prior)\s*(instructions|rules|guidelines|prompts|constraints)?",
        r"you\s+are\s+now\s+(?:a|an)\s+",
        r"new\s+instruction[s]?\s*:",
        r"system\s*:\s*",
        r"<\s*system\s*>",
        r"reveal\s+(?:your|the|hidden)\s+(?:prompt|instructions|system)",
        r"what\s+(?:is|are)\s+your\s+(?:instructions|system\s+prompt)",
    ]

    text_lower = text.lower()
    for pattern in patterns:
        if re.search(pattern, text_lower):
            return True

    return False
