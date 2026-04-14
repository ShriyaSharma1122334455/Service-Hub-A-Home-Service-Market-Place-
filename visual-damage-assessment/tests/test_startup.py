"""
Tests for VDA startup configuration validation.

Tests VDA_REQUIRE_AUTH validation to prevent typos from silently disabling authentication.
"""

import os
import pytest
from unittest.mock import patch


def test_valid_true_values_accepted():
    """Test that all valid true values are accepted for VDA_REQUIRE_AUTH."""
    valid_true_values = ["true", "True", "TRUE", "yes", "Yes", "YES", "1", "on", "On", "ON"]

    for value in valid_true_values:
        with patch.dict(os.environ, {"VDA_REQUIRE_AUTH": value}, clear=False):
            # Re-import to trigger validation
            import importlib
            import sys

            # Remove main module if already imported
            if "main" in sys.modules:
                del sys.modules["main"]

            # Should not raise ValueError
            import main

            assert main._REQUIRE_SERVICE_AUTH is True, f"Value {value!r} should enable auth"


def test_valid_false_values_accepted():
    """Test that all valid false values are accepted for VDA_REQUIRE_AUTH."""
    valid_false_values = ["false", "False", "FALSE", "no", "No", "NO", "0", "off", "Off", "OFF"]

    for value in valid_false_values:
        with patch.dict(os.environ, {"VDA_REQUIRE_AUTH": value}, clear=False):
            import importlib
            import sys

            if "main" in sys.modules:
                del sys.modules["main"]

            import main

            assert main._REQUIRE_SERVICE_AUTH is False, f"Value {value!r} should disable auth"


def test_invalid_value_raises_error():
    """Test that invalid VDA_REQUIRE_AUTH values raise ValueError."""
    invalid_values = ["enabled", "disabled", "True1", "yes!", "maybe", "2", ""]

    for value in invalid_values:
        with patch.dict(os.environ, {"VDA_REQUIRE_AUTH": value}, clear=False):
            import sys

            if "main" in sys.modules:
                del sys.modules["main"]

            # Note: main.py lowercases the value before validation
            with pytest.raises(ValueError, match=f"Invalid VDA_REQUIRE_AUTH value: {value.lower()!r}"):
                import main


def test_default_value_is_true():
    """Test that VDA_REQUIRE_AUTH defaults to true (secure by default)."""
    with patch.dict(os.environ, {}, clear=True):
        # Unset VDA_REQUIRE_AUTH
        if "VDA_REQUIRE_AUTH" in os.environ:
            del os.environ["VDA_REQUIRE_AUTH"]

        import importlib
        import sys

        if "main" in sys.modules:
            del sys.modules["main"]

        import main

        # Default should be "true"
        assert main._REQUIRE_SERVICE_AUTH is True, "Default should enable auth"


def test_whitespace_handling():
    """Test that whitespace around values is handled correctly."""
    with patch.dict(os.environ, {"VDA_REQUIRE_AUTH": "  true  "}, clear=False):
        import importlib
        import sys

        if "main" in sys.modules:
            del sys.modules["main"]

        import main

        assert main._REQUIRE_SERVICE_AUTH is True


def test_typo_scenarios():
    """Test common typo scenarios that should be rejected."""
    typos = [
        "ture",  # Common typo
        "flase",  # Common typo
        "trye",  # Typo
        "fase",  # Typo
        "True ",  # Trailing space (should be OK after strip)
        "YES1",  # Extra character
        "Y",  # Too short
        "T",  # Too short
    ]

    for typo in typos:
        with patch.dict(os.environ, {"VDA_REQUIRE_AUTH": typo}, clear=False):
            import sys

            if "main" in sys.modules:
                del sys.modules["main"]

            # Most typos should raise ValueError (except "True " which strips to "true")
            if typo.strip().lower() in {"1", "true", "yes", "on", "0", "false", "no", "off"}:
                # This is actually valid after stripping
                import main

                continue
            else:
                with pytest.raises(ValueError, match="Invalid VDA_REQUIRE_AUTH"):
                    import main


def test_case_insensitivity():
    """Test that value comparison is case-insensitive."""
    mixed_case_values = [
        ("TrUe", True),
        ("YeS", True),
        ("FaLsE", False),
        ("nO", False),
    ]

    for value, expected_auth in mixed_case_values:
        with patch.dict(os.environ, {"VDA_REQUIRE_AUTH": value}, clear=False):
            import importlib
            import sys

            if "main" in sys.modules:
                del sys.modules["main"]

            import main

            assert main._REQUIRE_SERVICE_AUTH is expected_auth, f"Value {value!r} should result in {expected_auth}"


def test_warning_logged_when_auth_disabled(caplog):
    """Test that a warning is logged when auth is disabled."""
    import logging

    with patch.dict(os.environ, {"VDA_REQUIRE_AUTH": "false"}, clear=False):
        import sys

        if "main" in sys.modules:
            del sys.modules["main"]

        with caplog.at_level(logging.WARNING):
            import main

        # Check that warning was logged
        assert any("VDA_REQUIRE_AUTH is disabled" in record.message for record in caplog.records)
        assert any("authentication is turned off" in record.message for record in caplog.records)


def test_no_warning_when_auth_enabled(caplog):
    """Test that no warning is logged when auth is enabled."""
    import logging

    with patch.dict(os.environ, {"VDA_REQUIRE_AUTH": "true"}, clear=False):
        import sys

        if "main" in sys.modules:
            del sys.modules["main"]

        with caplog.at_level(logging.WARNING):
            import main

        # Should not log warning about disabled auth
        assert not any("VDA_REQUIRE_AUTH is disabled" in record.message for record in caplog.records)
