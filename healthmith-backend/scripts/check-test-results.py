"""Gradle JUnit 보고서의 실제 결과를 집계한다. 검사 생략도 성공으로 처리하지 않는다."""

import os
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

reports = sorted(Path("build/test-results/test").glob("TEST-*.xml"))
if not reports:
    sys.exit("JUnit XML 보고서가 없습니다.")

totals = dict.fromkeys(("tests", "failures", "errors", "skipped"), 0)
for report in reports:
    suite = ET.parse(report).getroot()
    for key in totals:
        totals[key] += int(suite.get(key, "0"))

summary = (
    f"Backend: {totals['tests']} tests, {totals['failures']} failures, "
    f"{totals['errors']} errors, {totals['skipped']} skipped "
    f"({len(reports)} suites)"
)
print(summary)
if destination := os.environ.get("GITHUB_STEP_SUMMARY"):
    with open(destination, "a", encoding="utf-8") as output:
        output.write(summary + "\n")

if totals["tests"] == 0 or any(totals[key] for key in ("failures", "errors", "skipped")):
    sys.exit("실행 누락 또는 실패한 테스트가 있습니다.")
