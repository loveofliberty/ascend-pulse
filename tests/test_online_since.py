import json
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class OnlineSinceTests(unittest.TestCase):
    def test_metrics_include_stable_launch_date(self):
        metrics = json.loads(
            (ROOT / "metrics.json").read_text(encoding="utf-8")
        )

        self.assertEqual(metrics["online_since"], "2026-09-13")

    def test_header_places_online_since_after_update_status(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")

        self.assertIn('<time id="online-since">', html)
        self.assertLess(html.index('id="updated-at"'), html.index('id="updated-relative"'))
        self.assertLess(html.index('id="updated-relative"'), html.index('id="online-since"'))

    def test_launch_date_uses_locale_aware_browser_formatting(self):
        script = (
            "const app = require('./app.js'); "
            "console.log(app.formatProjectDate('2026-09-13', 'en-US'));"
        )
        result = subprocess.run(
            ["node", "-e", script],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )

        self.assertEqual(result.stdout.strip(), "Sep 13, 2026")


if __name__ == "__main__":
    unittest.main()
