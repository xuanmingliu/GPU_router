from pathlib import Path
from urllib.parse import quote, unquote, urlsplit
from urllib.request import Request, urlopen
import re

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
UPSTREAM = "https://gpu.ai-galaxy.cn"

ASSET_RE = re.compile(
    r"(?:/assets/|assets/)?([A-Za-z0-9_%\u4e00-\u9fff.@?=&+\-]+-[A-Za-z0-9_-]{5,}"
    r"\.(?:js|css|png|jpg|jpeg|svg|webp|gif|woff2?|ttf|eot)(?:\?v=[A-Za-z0-9_.-]+)?)"
)


def normalize(name: str) -> str:
    name = unquote(name)
    name = name.split("#", 1)[0]
    return name


def scan_text(path: Path) -> set[str]:
    try:
        text = path.read_text()
    except UnicodeDecodeError:
        return set()
    found = set()
    for match in ASSET_RE.finditer(text):
        found.add(normalize(match.group(1)))
    return found


def download(name: str) -> bool:
    clean_name = name.split("?", 1)[0]
    dest = ASSETS / clean_name
    if dest.exists():
        return False
    quoted_name = quote(name, safe="/?=&+%.-_")
    url = f"{UPSTREAM}/assets/{quoted_name}"
    req = Request(url, headers={"User-Agent": "Mozilla/5.0", "Referer": f"{UPSTREAM}/store"})
    try:
        with urlopen(req, timeout=30) as resp:
            data = resp.read()
    except Exception as exc:
        print(f"miss {name}: {exc}")
        return False

    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    if dest.suffix in {".js", ".css", ".html"}:
        try:
            text = dest.read_text()
            text = text.replace("智星云", "附中云")
            dest.write_text(text)
        except UnicodeDecodeError:
            pass
    print(f"got  {name}")
    return True


def main():
    ASSETS.mkdir(exist_ok=True)
    seen = set()
    for round_no in range(20):
        wanted = set()
        for path in [ROOT / "store.html", ROOT / "index.html", *ASSETS.glob("*")]:
            if path.is_file() and path.suffix in {".html", ".js", ".css", ".svg"}:
                wanted.update(scan_text(path))
        wanted = {item for item in wanted if item not in seen}
        if not wanted:
            print("done")
            return
        print(f"round {round_no + 1}: {len(wanted)} candidates")
        seen.update(wanted)
        changed = False
        for item in sorted(wanted):
            changed = download(item) or changed
        if not changed:
            print("no new files downloaded")
            return


if __name__ == "__main__":
    main()
