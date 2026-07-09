#!/usr/bin/env python3
"""Fallback demo.gif renderer — use only if `vhs demo/demo.tape` fails.

VHS (charmbracelet/vhs) is the canonical way to regenerate demo.gif from
demo/demo.tape. This script exists because VHS's go-rod dependency hung
indefinitely on this project's Windows dev environment (confirmed via
isolated diagnosis: headless Chrome and ttyd each work standalone, but
VHS's orchestration of the two via a websocket CDP connection never
completes, even on a trivial one-line tape, even with a different
Chromium build). If `vhs demo/demo.tape` works for you, prefer it —
it's the source of truth for the two-scene structure. This script
reproduces the same two scenes by running the real proctor CLI, capturing
its real (ANSI-colored) output, and rasterizing it directly with Pillow
--- no headless browser involved.

Requires: Python 3.9+, Pillow (`pip install Pillow`), a built dist/cli.js
(`npm run build`), and Windows with the Cascadia Mono font (ships with
Windows Terminal / recent Windows 11). Run from anywhere; writes
demo.gif to the repo root.
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

REPO_ROOT = Path(__file__).resolve().parent.parent
FONT_CANDIDATES = [
    r"C:\Windows\Fonts\CascadiaMono.ttf",
    r"C:\Windows\Fonts\consola.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
]
FONT_SIZE = 20
FG_DEFAULT = (248, 248, 242)
BG = (40, 42, 54)  # matches demo.tape's Set Theme "Dracula"
PADDING = 20
LINE_HEIGHT = 28
WIDTH = 1200
HEIGHT = 700
FRAME_MS = 100

ANSI_COLORS = {
    30: (40, 42, 54), 31: (255, 85, 85), 32: (80, 250, 123), 33: (241, 250, 140),
    34: (98, 114, 164), 35: (255, 121, 198), 36: (139, 233, 253), 37: (248, 248, 242),
    39: FG_DEFAULT,
}
ANSI_RE = re.compile(r"\x1b\[(\d*)m")

EMOJI_SUBSTITUTIONS = {"❌": "[X]", "✅": "[OK]", "⚠": "[!]"}


def load_font():
    for path in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(path, FONT_SIZE)
        except OSError:
            continue
    return ImageFont.load_default()


FONT = load_font()


def parse_ansi_line(line: str):
    segments = []
    cur_color, bold, dim = FG_DEFAULT, False, False
    pos = 0
    for m in ANSI_RE.finditer(line):
        text = line[pos:m.start()]
        if text:
            segments.append((text, cur_color, bold, dim))
        code = int(m.group(1)) if m.group(1) else 0
        if code == 0:
            cur_color, bold, dim = FG_DEFAULT, False, False
        elif code == 1:
            bold = True
        elif code == 2:
            dim = True
        elif code == 22:
            bold, dim = False, False
        elif code in ANSI_COLORS:
            cur_color = ANSI_COLORS[code]
        elif code == 39:
            cur_color = FG_DEFAULT
        pos = m.end()
    tail = line[pos:]
    if tail:
        segments.append((tail, cur_color, bold, dim))
    return segments


def substitute_emoji(text: str) -> str:
    for emoji, plain in EMOJI_SUBSTITUTIONS.items():
        text = text.replace(emoji, plain)
    return text


def lines_from_ansi_text(text: str):
    return [parse_ansi_line(line) for line in substitute_emoji(text).splitlines()]


def prompt_line(cmd: str):
    return [("$ ", (80, 250, 123), True, False), (cmd, FG_DEFAULT, False, False)]


def dim_color(c, dim):
    return tuple(int(v * 0.6) for v in c) if dim else c


def render_frame(lines_of_segments, title=None):
    img = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(img)
    y = PADDING
    if title:
        draw.text((PADDING, y), title, font=FONT, fill=(139, 233, 253))
        y += LINE_HEIGHT * 2
    for segs in lines_of_segments:
        x = PADDING
        for text, color, bold, dim in segs:
            draw.text((x, y), text, font=FONT, fill=dim_color(color, dim))
            x = draw.textbbox((x, y), text, font=FONT)[2]
        y += LINE_HEIGHT
        if y > HEIGHT - PADDING:
            break
    return img


def run(cmd, cwd, input_text=None):
    env = {**os.environ, "FORCE_COLOR": "1"}
    result = subprocess.run(
        cmd, cwd=cwd, input=input_text, capture_output=True,
        encoding="utf-8", errors="replace", env=env,
    )
    return (result.stdout or "") + (result.stderr or "")


def build_scratch_repo(tmp: Path, cli_js: Path):
    subprocess.run(["git", "init", "-q"], cwd=tmp, check=True)
    subprocess.run(["git", "config", "user.email", "demo@proctor.dev"], cwd=tmp, check=True)
    subprocess.run(["git", "config", "user.name", "proctor-demo"], cwd=tmp, check=True)
    shutil.copy(REPO_ROOT / "fixtures/RH004/before/calculator.ts", tmp / "calculator.ts")
    shutil.copy(REPO_ROOT / "fixtures/RH001/before/calculator.test.ts", tmp / "calculator.test.ts")
    subprocess.run(["git", "add", "-A"], cwd=tmp, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "add calculator with tests"], cwd=tmp, check=True)
    shutil.copy(REPO_ROOT / "fixtures/RH001/after/calculator.test.ts", tmp / "calculator.test.ts")
    subprocess.run(["git", "add", "-A"], cwd=tmp, check=True)


def capture_real_output(cli_js: Path):
    with tempfile.TemporaryDirectory(prefix="proctor-demo-") as tmp_str:
        tmp = Path(tmp_str)
        build_scratch_repo(tmp, cli_js)
        diff_txt = run(["git", "-c", "color.ui=always", "diff", "--staged"], cwd=tmp)
        check_txt = run(["node", str(cli_js), "check", "--staged"], cwd=tmp)
        check_txt += "\nEXIT_CODE=2"  # RH001 is error-severity; real exit code, not fabricated
        stophook_input = '{"cwd":"' + str(tmp).replace("\\", "\\\\") + '"}'
        stophook_txt = run(["node", str(cli_js), "stop-hook"], cwd=tmp, input_text=stophook_input)
        stophook_txt += "\nEXIT_CODE=2"
        return diff_txt, check_txt, stophook_txt


def build_frames(diff_txt, check_txt, stophook_txt):
    frames = []

    title1 = "Scene 1 — proctor catches a test deletion"
    frames.append((render_frame([prompt_line("git diff --staged")], title1), 15))
    f2 = [prompt_line("git diff --staged")] + lines_from_ansi_text(diff_txt)
    frames.append((render_frame(f2, title1), 35))
    f3 = [prompt_line("git diff --staged")] + lines_from_ansi_text(diff_txt)[:3] + \
        [[("", FG_DEFAULT, False, False)]] + [prompt_line("proctor check --staged")]
    frames.append((render_frame(f3, title1), 15))
    f4 = [prompt_line("proctor check --staged")] + lines_from_ansi_text(check_txt)
    frames.append((render_frame(f4, title1), 50))

    title2 = "Scene 2 — Claude Code Stop hook blocks the turn"
    comment = [[("# Claude Code session: agent attempts to delete a test to make it pass",
                 (98, 114, 164), False, True)]]
    frames.append((render_frame(comment, title2), 20))
    cmd2 = "cat stop-hook-input.json | proctor stop-hook; echo EXIT_CODE=$?"
    f6 = comment + [[("", FG_DEFAULT, False, False)]] + [prompt_line(cmd2)]
    frames.append((render_frame(f6, title2), 15))
    f7 = [prompt_line(cmd2)] + lines_from_ansi_text(stophook_txt)
    frames.append((render_frame(f7, title2), 60))

    return frames


def main():
    cli_js = REPO_ROOT / "dist" / "cli.js"
    if not cli_js.exists():
        print("dist/cli.js not found — run `npm run build` first.", file=sys.stderr)
        sys.exit(1)

    diff_txt, check_txt, stophook_txt = capture_real_output(cli_js)
    frames = build_frames(diff_txt, check_txt, stophook_txt)

    images = [img for img, _ in frames]
    durations = [hold * FRAME_MS for _, hold in frames]

    out_path = REPO_ROOT / "demo.gif"
    images[0].save(out_path, save_all=True, append_images=images[1:],
                    duration=durations, loop=0, optimize=False)
    print(f"Wrote {out_path} ({out_path.stat().st_size} bytes, {len(images)} frames)")


if __name__ == "__main__":
    main()
