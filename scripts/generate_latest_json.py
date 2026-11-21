#!/usr/bin/env python3
"""Generate latest.json metadata for the Document Vault download & product website."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
from typing import Any, Callable
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

DEFAULT_RELEASES_REPO = "niosus/document-vault-releases"
SPARKLE_NS = "http://www.andymatuschak.org/xml-namespaces/sparkle"
DC_NS = "http://purl.org/dc/elements/1.1/"
ET.register_namespace("sparkle", SPARKLE_NS)
ET.register_namespace("dc", DC_NS)
_SEMVER_RE = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)(?:[-.]([0-9A-Za-z.-]+))?$")
_UNSIGNED_FOOTER_MARKER = "### ⚠️ Unsigned Preview Build"


def github_pages_appcast_url(repo: str) -> str:
    """Return the GitHub Pages URL hosting appcast.xml for a GitHub repository."""
    owner, _, name = str(repo or "").strip().partition("/")
    if owner and name:
        return f"https://{owner}.github.io/{name}/appcast.xml"
    return f"https://github.com/{repo}/releases/latest/download/appcast.xml"


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
        "appcast_url": github_pages_appcast_url(repo),
        "latest": latest_stable,
        "prerelease": latest_prerelease,
        "history": normalized[: max(1, history_limit)],
    }


def _find_appcast_asset_url(releases: list[dict[str, Any]]) -> str | None:
    """Return the browser_download_url for appcast.xml from the newest non-draft release."""
    candidates: list[tuple[tuple[int, int, int, int, str], str, str]] = []
    for rel in releases:
        if not isinstance(rel, dict) or rel.get("draft"):
            continue
        assets = rel.get("assets") or []
        appcast_asset = next(
            (
                a
                for a in assets
                if isinstance(a, dict)
                and str(a.get("name", "")).lower() == "appcast.xml"
                and a.get("browser_download_url")
            ),
            None,
        )
        if appcast_asset is None:
            continue
        tag = str(rel.get("tag_name") or "").strip()
        published_at = str(rel.get("published_at") or rel.get("created_at") or "")
        candidates.append((parse_version_tuple(tag), published_at, str(appcast_asset["browser_download_url"])))
    if not candidates:
        return None
    candidates.sort(key=lambda entry: (entry[0], entry[1]), reverse=True)
    return candidates[0][2]


def reconcile_appcast_xml(xml_text: str, releases: list[dict[str, Any]]) -> str:
    """Drop broken ERROR signatures and align item <sparkle:channel> tags with GitHub release flags."""
    root = ET.fromstring(xml_text)
    channel_el = root.find("channel")
    if channel_el is None:
        raise ValueError("Invalid appcast.xml: missing <channel> element.")

    prerelease_by_version: dict[str, bool] = {}
    for rel in releases:
        if not isinstance(rel, dict) or rel.get("draft"):
            continue
        tag = str(rel.get("tag_name") or "").strip()
        ver = tag.lstrip("v")
        if ver:
            prerelease_by_version[ver] = bool(rel.get("prerelease"))

    chan_tag = f"{{{SPARKLE_NS}}}channel"
    short_attr = f"{{{SPARKLE_NS}}}shortVersionString"
    sig_attr = f"{{{SPARKLE_NS}}}edSignature"

    for item in list(channel_el.findall("item")):
        enc = item.find("enclosure")
        sig = enc.attrib.get(sig_attr, "") if enc is not None else ""
        if sig.startswith("ERROR"):
            channel_el.remove(item)
            continue

        short_ver = enc.attrib.get(short_attr, "").strip() if enc is not None else ""
        if short_ver and short_ver in prerelease_by_version:
            is_pre = prerelease_by_version[short_ver]
            existing_chan = item.find(chan_tag)
            if is_pre:
                if existing_chan is None:
                    existing_chan = ET.SubElement(item, chan_tag)
                existing_chan.text = "prerelease"
            elif existing_chan is not None:
                item.remove(existing_chan)

    ET.indent(root, space="  ")
    body = ET.tostring(root, encoding="unicode", xml_declaration=False)
    return f'<?xml version="1.0" encoding="utf-8"?>\n{body}\n'


def fetch_and_reconcile_appcast(
    releases: list[dict[str, Any]],
    *,
    token: str = "",
    fetch_text: Callable[[str], str] | None = None,
) -> str | None:
    """Download the newest release's appcast.xml asset and reconcile it against GitHub releases."""
    asset_url = _find_appcast_asset_url(releases)
    if not asset_url:
        return None
    if fetch_text is not None:
        raw_xml = fetch_text(asset_url)
    else:
        headers = {"User-Agent": "DocumentVault-LatestJson-Generator/1.0"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        req = urllib.request.Request(asset_url, headers=headers)
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw_xml = resp.read().decode("utf-8")
    return reconcile_appcast_xml(raw_xml, releases)


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
        "--appcast-output",
        type=Path,
        default=None,
        help="Optional output path to sync the newest release appcast.xml for GitHub Pages",
    )
    parser.add_argument(
        "--history-limit",
        type=int,
        default=6,
        help="Number of recent releases to include in history (default: 6)",
    )
    args = parser.parse_args()

    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN") or ""
    if args.input_json is not None:
        raw = json.loads(args.input_json.read_text(encoding="utf-8"))
        if not isinstance(raw, list):
            raise SystemExit("--input-json must contain a JSON array of GitHub releases.")
        releases = raw
    else:
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

    if args.appcast_output is not None:
        appcast_xml = fetch_and_reconcile_appcast(releases, token=token)
        if appcast_xml:
            appcast_out = args.appcast_output.resolve()
            appcast_out.parent.mkdir(parents=True, exist_ok=True)
            appcast_out.write_text(appcast_xml, encoding="utf-8")
            print(f"Synced {appcast_out}")
        else:
            print("No appcast.xml release asset found; skipping appcast sync.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
