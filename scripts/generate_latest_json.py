#!/usr/bin/env python3
"""Generate latest.json metadata for the Document Vault download & product website."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
from typing import Any
import urllib.error
import urllib.request

DEFAULT_RELEASES_REPO = "niosus/document-vault-releases"
_SEMVER_RE = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)(?:[-.]([0-9A-Za-z.-]+))?$")
_UNSIGNED_FOOTER_MARKER = "### ⚠️ Unsigned Preview Build"


def parse_version_tuple(tag_or_version: str) -> tuple[int, int, int, int, str]:
    """Return a sortable SemVer key where stable releases rank slightly above pre-tagged builds of the same X.Y.Z."""
    raw = str(tag_or_version or "").strip()
    match = _SEMVER_RE.match(raw)
    if not match:
        return (0, 0, 0, 0, raw)
    major, minor, patch = int(match.group(1)), int(match.group(2)), int(match.group(3))
    suffix = match.group(4) or ""
    # Stable tag (no suffix) ranks above suffixed tag on identical X.Y.Z
    is_clean = 1 if not suffix else 0
    return (major, minor, patch, is_clean, suffix)


def clean_release_notes(body: str) -> str:
    """Strip automated unsigned-Gatekeeper boilerplate from release body for cleaner web display."""
    text = str(body or "").replace("\r\n", "\n").strip()
    if not text:
        return ""
    idx = text.find(_UNSIGNED_FOOTER_MARKER)
    if idx != -1:
        prefix = text[:idx].rstrip()
        if prefix.endswith("---"):
            prefix = prefix[:-3].rstrip()
        return prefix
    return text


def _pick_dmg_asset(assets: list[dict[str, Any]]) -> dict[str, Any] | None:
    dmgs = [
        asset
        for asset in assets
        if isinstance(asset, dict)
        and str(asset.get("name", "")).lower().endswith(".dmg")
        and asset.get("browser_download_url")
    ]
    if not dmgs:
        return None
    # Prefer signed/notarized .dmg over -unsigned.dmg if both are attached
    for asset in dmgs:
        if "-unsigned.dmg" not in str(asset.get("name", "")).lower():
            return asset
    return dmgs[0]


def normalize_release(release: dict[str, Any]) -> dict[str, Any] | None:
    """Normalize a GitHub Release API object into a compact website payload, or None if unusable."""
    if not isinstance(release, dict) or release.get("draft"):
        return None

    assets = release.get("assets") or []
    dmg = _pick_dmg_asset(assets)
    if dmg is None:
        return None

    tag = str(release.get("tag_name") or "").strip()
    version = tag.lstrip("v") or str(release.get("name") or "").strip()
    dmg_name = str(dmg.get("name") or "")
    is_prerelease = bool(release.get("prerelease"))
    is_unsigned = "-unsigned.dmg" in dmg_name.lower() or "unsigned" in str(release.get("name") or "").lower()

    return {
        "version": version,
        "tag": tag,
        "title": str(release.get("name") or f"Document Vault {tag}").strip(),
        "prerelease": is_prerelease,
        "signed": not is_unsigned,
        "published_at": str(release.get("published_at") or release.get("created_at") or ""),
        "dmg_name": dmg_name,
        "dmg_url": str(dmg.get("browser_download_url") or ""),
        "size_bytes": int(dmg.get("size") or 0),
        "notes": clean_release_notes(str(release.get("body") or "")),
        "release_url": str(release.get("html_url") or ""),
    }


def build_latest_payload(
    releases: list[dict[str, Any]],
    *,
    repo: str = DEFAULT_RELEASES_REPO,
    history_limit: int = 6,
    generated_at: str | None = None,
) -> dict[str, Any]:
    """Compute the latest stable, latest prerelease, and recent history from GitHub releases."""
    normalized: list[dict[str, Any]] = []
    for rel in releases:
        item = normalize_release(rel)
        if item is not None:
            normalized.append(item)

    # Sort newest first by SemVer, then published_at
    normalized.sort(
        key=lambda item: (parse_version_tuple(item["tag"] or item["version"]), item["published_at"]),
        reverse=True,
    )

    latest_stable = next((item for item in normalized if not item["prerelease"]), None)
    latest_prerelease = next((item for item in normalized if item["prerelease"]), None)

    return {
        "schema_version": 1,
        "generated_at": generated_at or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "repo": repo,
        "releases_url": f"https://github.com/{repo}/releases",
        "appcast_url": f"https://github.com/{repo}/releases/latest/download/appcast.xml",
        "latest": latest_stable,
        "prerelease": latest_prerelease,
        "history": normalized[: max(1, history_limit)],
    }


def fetch_github_releases(repo: str, *, per_page: int = 25, token: str = "") -> list[dict[str, Any]]:
    """Fetch releases JSON from the GitHub REST API."""
    url = f"https://api.github.com/repos/{repo}/releases?per_page={per_page}"
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "DocumentVault-LatestJson-Generator/1.0",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"GitHub API request failed ({exc.code}): {detail}") from exc

    if not isinstance(data, list):
        raise RuntimeError("Unexpected GitHub releases response: expected a JSON array.")
    return data


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate latest.json for Document Vault releases.")
    parser.add_argument(
        "--repo",
        default=DEFAULT_RELEASES_REPO,
        help=f"GitHub releases repo (default: {DEFAULT_RELEASES_REPO})",
    )
    parser.add_argument(
        "--input-json",
        type=Path,
        default=None,
        help="Optional local JSON file of GitHub releases (skips network fetch)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("latest.json"),
        help="Output JSON file path (default: latest.json)",
    )
    parser.add_argument(
        "--history-limit",
        type=int,
        default=6,
        help="Number of recent releases to include in history (default: 6)",
    )
    args = parser.parse_args()

    if args.input_json is not None:
        raw = json.loads(args.input_json.read_text(encoding="utf-8"))
        if not isinstance(raw, list):
            raise SystemExit("--input-json must contain a JSON array of GitHub releases.")
        releases = raw
    else:
        token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN") or ""
        releases = fetch_github_releases(args.repo, token=token)

    payload = build_latest_payload(
        releases,
        repo=args.repo,
        history_limit=args.history_limit,
    )
    out_path = args.output.resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {out_path} (latest={bool(payload['latest'])}, prerelease={bool(payload['prerelease'])})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
