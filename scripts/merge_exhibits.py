"""将 data/ 下各案例 JSON 合并为 data/exhibits.json 数组。"""
import json
from pathlib import Path

ORDER = ["the-dao", "parity", "beanstalk", "ronin", "nomad"]
DATA_DIR = Path(__file__).resolve().parents[1] / "data"

exhibits = []
for name in ORDER:
    path = DATA_DIR / f"{name}.json"
    obj = json.loads(path.read_text(encoding="utf-8"))
    obj["id"] = name
    exhibits.append(obj)

out = DATA_DIR / "exhibits.json"
out.write_text(json.dumps(exhibits, ensure_ascii=False, indent=2), encoding="utf-8")

print(f"merged {len(exhibits)} exhibits -> {out}")
for e in exhibits:
    findings_n = len(e.get("technical_findings", []))
    alt_n = len(e.get("alternative_hypotheses", []))
    print(
        f"  [{e['id']:12s}] {e['contract_name']:20s}"
        f" conf={e['confidence']:.2f}"
        f" findings={findings_n}"
        f" alt_hyp={alt_n}"
        f" | {e['death_cause'][:45]}"
    )
