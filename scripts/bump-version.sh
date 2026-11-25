#!/usr/bin/env bash
# ใช้: scripts/bump-version.sh 1.0.1 "สรุปสิ่งที่แก้"
# แก้เลขเวอร์ชันทุกจุดให้ตรงกัน + เพิ่มบันทึกใน CHANGELOG.md
# จากนั้น commit แล้วสร้าง tag v<เวอร์ชัน> เป็นจุดสำรองไว้ย้อนกลับ:
#   git add -A && git commit -m "v1.0.1: ..." && git tag v1.0.1 && git push origin main --tags
set -euo pipefail
cd "$(dirname "$0")/.."
NEW="${1:?ต้องระบุเลขเวอร์ชัน เช่น 1.0.1}"
NOTES="${2:-}"
[[ "$NEW" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "รูปแบบเวอร์ชันต้องเป็น X.Y.Z"; exit 1; }
OLD=$(sed -n "s/.*VERSION: '\([0-9.]*\)'.*/\1/p" js/config.js)
TODAY=$(TZ=Asia/Bangkok date +%F)

sed -i "s/VERSION: '$OLD'/VERSION: '$NEW'/" js/config.js
sed -i "s/^const VERSION = '[0-9.]*';/const VERSION = '$NEW';/" sw.js
sed -i "s/^var VERSION = '[0-9.]*';/var VERSION = '$NEW';/" apps-script/Code.gs
sed -i -E "s/\?v=[0-9]+\.[0-9]+\.[0-9]+/?v=$NEW/g" index.html
python3 - "$NEW" "$TODAY" "$NOTES" <<'PY'
import json, sys
v, d, n = sys.argv[1:4]
json.dump({"version": v, "date": d, "notes": n}, open("version.json", "w"), ensure_ascii=False, indent=2)
open("version.json", "a").write("\n")
cl = open("CHANGELOG.md").read()
head, sep, rest = cl.partition("\n## ")
entry = f"\n## v{v} — {d}\n- {n or '(ไม่ได้ระบุ)'}\n"
open("CHANGELOG.md", "w").write(head.rstrip("\n") + "\n" + entry + (sep + rest if sep else ""))
PY
echo "เปลี่ยนเวอร์ชัน $OLD → $NEW เรียบร้อย"
grep -n "$NEW" js/config.js sw.js apps-script/Code.gs version.json | head
