"""Print only aggregate diagnostics; keep SQL and table details in encrypted storage."""
import collections
import json
import pathlib
import re

base = pathlib.Path("/mnt/v/ALFA-Backups")
report = json.loads((base / "isolated-restore-evidence.json").read_text())
diff = json.loads((base / "restore-schema-difference.json").read_text())
print(json.dumps({
    "count_mismatches": sum(not x["count_matches"] for x in report["table_checks"].values()),
    "content_mismatches": sum(not x["content_matches"] for x in report["table_checks"].values()),
    "source_not_valid_statements": len(re.findall(
        r"NOT VALID;", (base / "restore-schema-review.sql").read_text())),
    "schema_difference_line_counts": {side: len(diff[side]) for side in ("missing", "extra")},
}))
for side in ("missing", "extra"):
    categories = collections.Counter()
    for line in diff[side]:
        # Exact ACL/schema commands contain metadata, not backup row contents.
        if re.match(r"^(CREATE SCHEMA |ALTER SCHEMA |GRANT |REVOKE |CREATE POLICY |SET |SELECT pg_catalog.set_config)", line):
            print(side + ": " + re.sub(r"'(?:[^']|'')*'", "'[literal]'", line))
        else:
            categories[" ".join(line.strip().split()[:2])] += 1
    print(side + " other categories: " + json.dumps(categories))
