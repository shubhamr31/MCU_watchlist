from pathlib import Path
import re
text = Path(r"C:\Users\sra26\Desktop\mcu-watchlist-v1\hotstar_main.js").read_text(encoding="utf-8", errors="ignore")
strings = re.findall(r"['\"]([^'\"]{4,200})['\"]", text)
seen = set()
for s in strings:
    if any(k in s.lower() for k in ["search", "hotstar", "/in/", "bifrost", "content", "slug", "watch"]) and s not in seen:
        seen.add(s)
        print(s)
        if len(seen) >= 120:
            break
print('total', len(seen))
