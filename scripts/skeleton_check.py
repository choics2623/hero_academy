#!/usr/bin/env python3
"""대사만 바꿨는지 확인한다: lines와 선택지 문구(text)를 뺀 나머지 뼈대가 기준 커밋과 같아야 한다.

사용: python3 scripts/skeleton_check.py content/events/10_y1_spring.yaml [기준=master]
출력: 이벤트별 대사 줄 수 (전 → 후), 뼈대가 달라진 곳
"""
import subprocess
import sys

import yaml


def strip(o):
    if isinstance(o, dict):
        return {k: strip(v) for k, v in o.items() if k not in ("lines", "text")}
    if isinstance(o, list):
        return [strip(x) for x in o]
    return o


def count(o):
    n = 0
    if isinstance(o, dict):
        for k, v in o.items():
            if k == "lines" and isinstance(v, list):
                n += len(v)
            n += count(v)
    elif isinstance(o, list):
        for x in o:
            n += count(x)
    return n


def diff(a, b, path="", out=None):
    out = [] if out is None else out
    if type(a) != type(b):
        out.append(f"{path}: {a!r} → {b!r}")
    elif isinstance(a, dict):
        for k in sorted(set(a) | set(b), key=str):
            if k not in a or k not in b:
                out.append(f"{path}.{k}: {'추가됨' if k in b else '사라짐'}")
            else:
                diff(a[k], b[k], f"{path}.{k}", out)
    elif isinstance(a, list):
        if len(a) != len(b):
            out.append(f"{path}: 항목 수 {len(a)} → {len(b)}")
        for i, (x, y) in enumerate(zip(a, b)):
            diff(x, y, f"{path}[{i}]", out)
    elif a != b:
        out.append(f"{path}: {a!r} → {b!r}")
    return out


def main():
    path = sys.argv[1]
    base = sys.argv[2] if len(sys.argv) > 2 else "master"
    old = yaml.safe_load(subprocess.check_output(["git", "show", f"{base}:{path}"]).decode("utf-8"))
    new = yaml.safe_load(open(path, encoding="utf-8"))
    oldm = {e["id"]: e for e in old}
    newm = {e["id"]: e for e in new}
    problems = []
    if list(oldm) != list(newm):
        problems.append(f"이벤트 목록이 다름: {set(oldm) ^ set(newm) or '순서'}")
    tot0 = tot1 = 0
    for eid, e0 in oldm.items():
        e1 = newm.get(eid)
        if e1 is None:
            continue
        c0, c1 = count(e0), count(e1)
        tot0 += c0
        tot1 += c1
        print(f"{eid:28s} {c0:4d} → {c1:4d}")
        problems += [f"{eid}{p}" for p in diff(strip(e0), strip(e1))]
    print(f"{'합계':28s} {tot0:4d} → {tot1:4d}")
    if problems:
        print("\n뼈대가 달라진 곳:")
        for p in problems:
            print("  -", p)
        sys.exit(1)
    print("\n뼈대 동일 ✓")


main()
