"""Gleason Timepiece scout — scheduled eBay deal scanner.

Runs on GitHub Actions on a cron, reads and writes Supabase, emails you when a
listing clears every gate. Finds and prices deals; never buys them.
"""

__version__ = "0.1.0"
