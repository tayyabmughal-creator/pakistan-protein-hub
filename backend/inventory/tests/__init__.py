"""Inventory tests.

This file exists so `manage.py test` finds these tests, not just pytest.
Python 3.11 dropped namespace-package support in unittest discovery, so
without it `manage.py test inventory` silently reports zero tests while CI
(pytest) runs all of them — the two disagreeing is worse than either being
wrong.
"""
