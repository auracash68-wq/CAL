#!/usr/bin/env python3
"""
Android Debug APK Discovery, Metadata Verification, Integrity Check & SHA-256 Generator.

Designed for CI/CD reliability:
- Never hardcodes APK paths or package IDs.
- Never uses greedy regex to parse aapt/aapt2 output.
- Prefers official Android SDK `apkanalyzer`, with anchored non-greedy `aapt2` fallback.
- Classifies failures explicitly into:
    ENVIRONMENT_FAILURE
    APK_DISCOVERY_FAILURE
    APK_VERIFICATION_FAILURE
"""

from __future__ import annotations

import argparse
import glob
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple


PACKAGE_ID_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$")
AAPT_KV_RE = re.compile(r"([A-Za-z0-9_]+)=['\"]([^'\"]*)['\"]")


class ClassifiedError(RuntimeError):
    def __init__(self, category: str, message: str) -> None:
        super().__init__(message)
        self.category = category


@dataclass
class ExpectedGradleConfig:
    module_name: str
    application_id: str
    namespace: Optional[str]
    version_code: Optional[str]
    version_name: Optional[str]
    min_sdk: Optional[str]
    target_sdk: Optional[str]


@dataclass
class ApkMetadata:
    tool_used: str
    application_id: str
    version_code: str
    version_name: str
    min_sdk: str
    target_sdk: str
    debuggable: str
    summary: Optional[str] = None


def _strip_groovy_comments(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)
    text = re.sub(r"//.*", "", text)
    return text


def _extract_braced_block(text: str, block_name: str) -> Optional[str]:
    match = re.search(rf"\b{re.escape(block_name)}\s*\{{", text)
    if not match:
        return None
    start = match.end()
    depth = 1
    idx = start
    while idx < len(text) and depth > 0:
        ch = text[idx]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
        idx += 1
    if depth != 0:
        return None
    return text[start : idx - 1]


def _resolve_var(raw_value: Optional[str], ext_vars: Dict[str, str]) -> Optional[str]:
    if raw_value is None:
        return None
    val = raw_value.strip().strip("\"'")
    if val.startswith("rootProject.ext."):
        key = val.split("rootProject.ext.", 1)[1].strip()
        return ext_vars.get(key, val)
    if val in ext_vars:
        return ext_vars[val]
    return val


def read_expected_gradle_config(
    android_dir: Path,
    module_name: str = "app",
    variant: str = "debug",
) -> ExpectedGradleConfig:
    """
    Reads expected applicationId, versionCode, versionName, minSdk, and targetSdk
    from the actual Gradle project files (including variables.gradle and buildType suffixes).
    Never uses namespace as an automatic substitute when applicationId is explicitly set.
    """
    ext_vars: Dict[str, str] = {}
    variables_gradle = android_dir / "variables.gradle"
    if variables_gradle.is_file():
        v_text = _strip_groovy_comments(variables_gradle.read_text(encoding="utf-8"))
        for m in re.finditer(r"\b([A-Za-z0-9_]+)\s*=\s*['\"]?([^'\"\n\r]+?)['\"]?\s*$", v_text, re.MULTILINE):
            ext_vars[m.group(1)] = m.group(2).strip()

    module_dir = android_dir / module_name
    build_file = module_dir / "build.gradle"
    if not build_file.is_file():
        build_file = module_dir / "build.gradle.kts"
    if not build_file.is_file():
        raise ClassifiedError(
            "ENVIRONMENT_FAILURE",
            f"Android module Gradle file not found in {module_dir}",
        )

    raw_text = _strip_groovy_comments(build_file.read_text(encoding="utf-8"))
    default_cfg = _extract_braced_block(raw_text, "defaultConfig") or raw_text

    ns_match = re.search(r"\bnamespace\s*=?\s*['\"]([^'\"]+)['\"]", raw_text)
    namespace = ns_match.group(1).strip() if ns_match else None

    app_id_match = re.search(r"\bapplicationId\s*=?\s*['\"]([^'\"]+)['\"]", default_cfg)
    application_id = app_id_match.group(1).strip() if app_id_match else None

    if not application_id:
        if namespace:
            application_id = namespace
        else:
            raise ClassifiedError(
                "ENVIRONMENT_FAILURE",
                f"Could not determine applicationId from {build_file}",
            )

    vc_match = re.search(r"\bversionCode\s*=?\s*([A-Za-z0-9_.]+)", default_cfg)
    vn_match = re.search(r"\bversionName\s*=?\s*['\"]([^'\"]+)['\"]", default_cfg)
    min_match = re.search(r"\bminSdk(?:Version)?\s*=?\s*([A-Za-z0-9_.]+)", default_cfg)
    tgt_match = re.search(r"\btargetSdk(?:Version)?\s*=?\s*([A-Za-z0-9_.]+)", default_cfg)

    version_code = _resolve_var(vc_match.group(1) if vc_match else None, ext_vars)
    version_name = vn_match.group(1).strip() if vn_match else None
    min_sdk = _resolve_var(min_match.group(1) if min_match else None, ext_vars)
    target_sdk = _resolve_var(tgt_match.group(1) if tgt_match else None, ext_vars)

    # Check buildTypes.<variant> for applicationIdSuffix or versionNameSuffix
    build_types_block = _extract_braced_block(raw_text, "buildTypes")
    if build_types_block:
        variant_block = _extract_braced_block(build_types_block, variant)
        if variant_block:
            id_suffix = re.search(
                r"\bapplicationIdSuffix\s*=?\s*['\"]([^'\"]+)['\"]", variant_block
            )
            if id_suffix:
                application_id = f"{application_id}{id_suffix.group(1)}"
            vn_suffix = re.search(
                r"\bversionNameSuffix\s*=?\s*['\"]([^'\"]+)['\"]", variant_block
            )
            if vn_suffix and version_name is not None:
                version_name = f"{version_name}{vn_suffix.group(1)}"

    return ExpectedGradleConfig(
        module_name=module_name,
        application_id=application_id,
        namespace=namespace,
        version_code=version_code,
        version_name=version_name,
        min_sdk=min_sdk,
        target_sdk=target_sdk,
    )


def discover_debug_apk(
    android_dir: Path,
    module_name: str = "app",
    min_mtime: Optional[float] = None,
) -> Path:
    """
    Dynamically discovers the Debug APK generated by Gradle inside
    android/<module>/build/outputs/apk.

    - Uses AGP `output-metadata.json` when present to find exact variant outputs.
    - Excludes androidTest APKs, release APKs, and stale APKs older than `min_mtime`.
    - Fails clearly if 0 APKs exist or if multiple ambiguous APKs exist.
    """
    apk_root = android_dir / module_name / "build" / "outputs" / "apk"
    if not apk_root.is_dir():
        raise ClassifiedError(
            "APK_DISCOVERY_FAILURE",
            f"APK output root directory does not exist: {apk_root}",
        )

    candidates: List[Path] = []

    # 1. Inspect AGP output-metadata.json files inside debug-related output directories
    for meta_path in sorted(apk_root.rglob("output-metadata.json")):
        rel_parts = [p.lower() for p in meta_path.relative_to(apk_root).parts]
        if any("androidtest" in p or "release" in p for p in rel_parts):
            continue
        try:
            data = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception:
            continue
        variant_name = str(data.get("variantName", "")).lower()
        if variant_name and "debug" not in variant_name:
            continue
        for elem in data.get("elements", []):
            output_file = elem.get("outputFile")
            if not output_file:
                continue
            apk_path = meta_path.parent / output_file
            if apk_path.is_file() and apk_path.suffix.lower() == ".apk":
                candidates.append(apk_path)

    # 2. Fallback filesystem scan if no output-metadata.json was emitted
    if not candidates:
        for apk_path in sorted(apk_root.rglob("*.apk")):
            rel_lower = str(apk_path.relative_to(apk_root)).lower()
            if "androidtest" in rel_lower or "release" in rel_lower:
                continue
            if "debug" in rel_lower:
                candidates.append(apk_path)

    # Deduplicate preserving order
    unique_candidates: List[Path] = []
    seen = set()
    for p in candidates:
        resolved = p.resolve()
        if resolved not in seen:
            seen.add(resolved)
            unique_candidates.append(p)

    # Exclude stale APKs created before the current build marker
    if min_mtime is not None:
        fresh = [p for p in unique_candidates if p.stat().st_mtime >= min_mtime - 1.0]
        if not fresh and unique_candidates:
            raise ClassifiedError(
                "APK_DISCOVERY_FAILURE",
                "Only stale APK files from an earlier build were found; no fresh Debug APK was produced.",
            )
        unique_candidates = fresh

    if not unique_candidates:
        raise ClassifiedError(
            "APK_DISCOVERY_FAILURE",
            f"No Debug APK found under {apk_root}",
        )

    if len(unique_candidates) > 1:
        # If ABI/density splits generated a universal debug APK, prefer the universal APK explicitly
        universal = [p for p in unique_candidates if "universal" in p.name.lower()]
        if len(universal) == 1:
            return universal[0]
        listed = ", ".join(str(p) for p in unique_candidates)
        raise ClassifiedError(
            "APK_DISCOVERY_FAILURE",
            f"Ambiguous multiple Debug APKs discovered ({len(unique_candidates)}): {listed}",
        )

    return unique_candidates[0]


def validate_package_id(value: str, source: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ClassifiedError(
            "APK_VERIFICATION_FAILURE",
            f"Empty application ID returned by {source}",
        )
    if cleaned.isdigit() or not PACKAGE_ID_RE.match(cleaned):
        raise ClassifiedError(
            "APK_VERIFICATION_FAILURE",
            f"Invalid application ID '{cleaned}' extracted by {source} "
            f"(rejected numeric or malformed identifier).",
        )
    return cleaned


def parse_aapt_badging(output: str) -> ApkMetadata:
    """
    Structured, anchored, non-greedy parser for `aapt2 dump badging` / `aapt dump badging`.
    Explicitly reads the `package:` record into a key-value dictionary so attributes like
    `platformBuildVersionName='16'` can NEVER be mistaken for `name='com.example.app'`.
    """
    package_fields: Dict[str, str] = {}
    min_sdk = ""
    target_sdk = ""
    debuggable = "false"

    for raw_line in output.splitlines():
        line = raw_line.strip()
        if line.startswith("package:"):
            payload = line[len("package:") :].strip()
            for match in AAPT_KV_RE.finditer(payload):
                key, val = match.group(1), match.group(2)
                # Preserve first occurrence of each attribute on the package line
                if key not in package_fields:
                    package_fields[key] = val
        elif line.startswith("sdkVersion:"):
            m = re.search(r"['\"]([^'\"]+)['\"]", line)
            if m:
                min_sdk = m.group(1).strip()
        elif line.startswith("targetSdkVersion:"):
            m = re.search(r"['\"]([^'\"]+)['\"]", line)
            if m:
                target_sdk = m.group(1).strip()
        elif line == "application-debuggable":
            debuggable = "true"

    if not package_fields or "name" not in package_fields:
        raise ClassifiedError(
            "APK_VERIFICATION_FAILURE",
            "Could not locate anchored 'package:' record with 'name' attribute in aapt2 badging output.",
        )

    app_id = validate_package_id(package_fields["name"], "aapt2 dump badging")
    version_code = package_fields.get("versionCode", "").strip()
    version_name = package_fields.get("versionName", "").strip()

    if not version_code:
        raise ClassifiedError(
            "APK_VERIFICATION_FAILURE",
            "Could not extract versionCode from aapt2 badging output.",
        )

    return ApkMetadata(
        tool_used="aapt2",
        application_id=app_id,
        version_code=version_code,
        version_name=version_name,
        min_sdk=min_sdk,
        target_sdk=target_sdk,
        debuggable=debuggable,
    )


def _sdk_roots() -> List[Path]:
    roots: List[Path] = []
    for env_key in ("ANDROID_SDK_ROOT", "ANDROID_HOME"):
        val = os.environ.get(env_key)
        if val and Path(val).is_dir():
            roots.append(Path(val))
    for common in ("/usr/local/lib/android/sdk", str(Path.home() / "Android/Sdk")):
        p = Path(common)
        if p.is_dir() and p not in roots:
            roots.append(p)
    return roots


def find_sdk_tool(tool_name: str) -> Optional[str]:
    direct = shutil.which(tool_name)
    if direct:
        return direct

    candidates: List[str] = []
    for root in _sdk_roots():
        if tool_name == "apkanalyzer":
            patterns = [
                str(root / "cmdline-tools" / "latest" / "bin" / "apkanalyzer"),
                str(root / "cmdline-tools" / "*" / "bin" / "apkanalyzer"),
                str(root / "tools" / "bin" / "apkanalyzer"),
            ]
        else:
            patterns = [
                str(root / "build-tools" / "*" / tool_name),
            ]
        for pat in patterns:
            matches = sorted(glob.glob(pat), reverse=True)
            for m in matches:
                if os.path.isfile(m) and os.access(m, os.X_OK):
                    candidates.append(m)
    return candidates[0] if candidates else None


def _run_cmd(cmd: List[str], failure_category: str = "APK_VERIFICATION_FAILURE") -> str:
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        stderr = (proc.stderr or proc.stdout).strip()
        raise ClassifiedError(
            failure_category,
            f"Command failed ({' '.join(cmd)}): {stderr}",
        )
    return proc.stdout.strip()


def extract_metadata_with_apkanalyzer(apkanalyzer_bin: str, apk_path: Path) -> ApkMetadata:
    apk_str = str(apk_path)
    app_id = validate_package_id(
        _run_cmd([apkanalyzer_bin, "manifest", "application-id", apk_str]),
        "apkanalyzer",
    )
    version_code = _run_cmd([apkanalyzer_bin, "manifest", "version-code", apk_str])
    version_name = _run_cmd([apkanalyzer_bin, "manifest", "version-name", apk_str])
    min_sdk = _run_cmd([apkanalyzer_bin, "manifest", "min-sdk", apk_str])
    target_sdk = _run_cmd([apkanalyzer_bin, "manifest", "target-sdk", apk_str])
    debuggable = _run_cmd([apkanalyzer_bin, "manifest", "debuggable", apk_str]).lower()
    summary = _run_cmd([apkanalyzer_bin, "apk", "summary", apk_str])

    return ApkMetadata(
        tool_used=f"apkanalyzer ({apkanalyzer_bin})",
        application_id=app_id,
        version_code=version_code,
        version_name=version_name,
        min_sdk=min_sdk,
        target_sdk=target_sdk,
        debuggable=debuggable,
        summary=summary,
    )


def extract_apk_metadata(
    apk_path: Path,
    apkanalyzer_override: Optional[str] = None,
    aapt2_override: Optional[str] = None,
) -> ApkMetadata:
    apkanalyzer_bin = apkanalyzer_override or find_sdk_tool("apkanalyzer")
    if apkanalyzer_bin:
        return extract_metadata_with_apkanalyzer(apkanalyzer_bin, apk_path)

    aapt2_bin = aapt2_override or find_sdk_tool("aapt2")
    if aapt2_bin:
        badging = _run_cmd([aapt2_bin, "dump", "badging", str(apk_path)])
        return parse_aapt_badging(badging)

    raise ClassifiedError(
        "ENVIRONMENT_FAILURE",
        "Neither Android SDK 'apkanalyzer' nor 'aapt2' was found in ANDROID_SDK_ROOT / PATH.",
    )


def verify_apk_zip_structure(apk_path: Path) -> int:
    if not apk_path.is_file():
        raise ClassifiedError("APK_DISCOVERY_FAILURE", f"APK file not found: {apk_path}")

    size = apk_path.stat().st_size
    if size <= 0:
        raise ClassifiedError("APK_VERIFICATION_FAILURE", f"APK file is empty (0 bytes): {apk_path}")

    try:
        with zipfile.ZipFile(apk_path, "r") as zf:
            bad_entry = zf.testzip()
            if bad_entry is not None:
                raise ClassifiedError(
                    "APK_VERIFICATION_FAILURE",
                    f"Corrupted ZIP entry inside APK: {bad_entry}",
                )
            names = set(zf.namelist())
    except zipfile.BadZipFile as exc:
        raise ClassifiedError(
            "APK_VERIFICATION_FAILURE",
            f"APK is not a valid ZIP archive: {exc}",
        ) from exc

    required = ["AndroidManifest.xml", "resources.arsc"]
    missing = [r for r in required if r not in names]
    has_dex = any(re.fullmatch(r"classes\d*\.dex", n) for n in names)
    if missing or not has_dex:
        missing_all = missing + ([] if has_dex else ["classes.dex"])
        raise ClassifiedError(
            "APK_VERIFICATION_FAILURE",
            f"APK is missing required Android archive entries: {', '.join(missing_all)}",
        )

    return size


def verify_apk_signature(apk_path: Path, apksigner_override: Optional[str] = None) -> str:
    apksigner_bin = apksigner_override or find_sdk_tool("apksigner")
    if not apksigner_bin:
        raise ClassifiedError(
            "ENVIRONMENT_FAILURE",
            "Android SDK 'apksigner' was not found in build-tools / PATH.",
        )
    _run_cmd([apksigner_bin, "verify", "--verbose", "--print-certs", str(apk_path)])
    return f"VERIFIED ({Path(apksigner_bin).name})"


def compute_sha256(file_path: Path) -> str:
    h = hashlib.sha256()
    with file_path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def format_size(num_bytes: int) -> str:
    if num_bytes < 1024:
        return f"{num_bytes} B"
    if num_bytes < 1024 * 1024:
        return f"{num_bytes / 1024:.2f} KB ({num_bytes} bytes)"
    return f"{num_bytes / (1024 * 1024):.2f} MB ({num_bytes} bytes)"


def compare_metadata(expected: ExpectedGradleConfig, actual: ApkMetadata) -> None:
    mismatches: List[str] = []

    if actual.application_id != expected.application_id:
        mismatches.append(
            f"applicationId mismatch: expected '{expected.application_id}', got '{actual.application_id}'"
        )
    if expected.version_code and actual.version_code != expected.version_code:
        mismatches.append(
            f"versionCode mismatch: expected '{expected.version_code}', got '{actual.version_code}'"
        )
    if expected.version_name and actual.version_name != expected.version_name:
        mismatches.append(
            f"versionName mismatch: expected '{expected.version_name}', got '{actual.version_name}'"
        )
    if expected.min_sdk and actual.min_sdk and actual.min_sdk != expected.min_sdk:
        mismatches.append(
            f"minSdk mismatch: expected '{expected.min_sdk}', got '{actual.min_sdk}'"
        )
    if expected.target_sdk and actual.target_sdk and actual.target_sdk != expected.target_sdk:
        mismatches.append(
            f"targetSdk mismatch: expected '{expected.target_sdk}', got '{actual.target_sdk}'"
        )
    if actual.debuggable != "true":
        mismatches.append(
            f"Expected a debuggable Debug APK (android:debuggable=true), got '{actual.debuggable}'"
        )

    if mismatches:
        raise ClassifiedError(
            "APK_VERIFICATION_FAILURE",
            "APK metadata validation failed:\n  - " + "\n  - ".join(mismatches),
        )


def write_github_output(outputs: Dict[str, str]) -> None:
    gh_out = os.environ.get("GITHUB_OUTPUT")
    if not gh_out:
        return
    with open(gh_out, "a", encoding="utf-8") as fh:
        for key, value in outputs.items():
            safe_val = str(value).replace("\n", " ").strip()
            fh.write(f"{key}={safe_val}\n")


def run_verification(
    android_dir: Path,
    module_name: str = "app",
    variant: str = "debug",
    min_mtime: Optional[float] = None,
    apkanalyzer_bin: Optional[str] = None,
    aapt2_bin: Optional[str] = None,
    apksigner_bin: Optional[str] = None,
) -> Tuple[Path, Path, ApkMetadata, str, int, str]:
    expected = read_expected_gradle_config(android_dir, module_name=module_name, variant=variant)
    apk_path = discover_debug_apk(android_dir, module_name=module_name, min_mtime=min_mtime)
    size_bytes = verify_apk_zip_structure(apk_path)
    metadata = extract_apk_metadata(
        apk_path,
        apkanalyzer_override=apkanalyzer_bin,
        aapt2_override=aapt2_bin,
    )
    compare_metadata(expected, metadata)
    sig_status = verify_apk_signature(apk_path, apksigner_override=apksigner_bin)

    sha256_hex = compute_sha256(apk_path)
    sha256_path = apk_path.with_name(f"{apk_path.name}.sha256")
    sha256_path.write_text(f"{sha256_hex}  {apk_path.name}\n", encoding="utf-8")

    return apk_path, sha256_path, metadata, sha256_hex, size_bytes, sig_status


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Discover and verify an Android Debug APK against Gradle configuration."
    )
    parser.add_argument("--android-dir", default="android", help="Path to Android project root")
    parser.add_argument("--module", default="app", help="Android application module directory name")
    parser.add_argument("--variant", default="debug", help="Build type name (default: debug)")
    parser.add_argument(
        "--build-marker",
        default=None,
        help="Optional timestamp marker file created immediately before Gradle build to exclude stale APKs",
    )
    args = parser.parse_args()

    min_mtime: Optional[float] = None
    if args.build_marker:
        marker_path = Path(args.build_marker)
        if marker_path.is_file():
            min_mtime = marker_path.stat().st_mtime

    try:
        apk_path, sha256_path, meta, sha256_hex, size_bytes, sig_status = run_verification(
            android_dir=Path(args.android_dir),
            module_name=args.module,
            variant=args.variant,
            min_mtime=min_mtime,
        )
    except ClassifiedError as err:
        print(f"[ERROR_CATEGORY: {err.category}] {err}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"[ERROR_CATEGORY: APK_VERIFICATION_FAILURE] Unexpected error: {exc}", file=sys.stderr)
        return 1

    size_human = format_size(size_bytes)
    report_lines = [
        "================ ANDROID DEBUG APK VERIFICATION REPORT ================",
        f"APK FILE:            {apk_path}",
        f"APK SIZE:            {size_human}",
        f"APK SHA-256:         {sha256_hex}",
        f"APPLICATION ID:      {meta.application_id}",
        f"VERSION CODE:        {meta.version_code}",
        f"VERSION NAME:        {meta.version_name}",
        f"MIN SDK:             {meta.min_sdk}",
        f"TARGET SDK:          {meta.target_sdk}",
        f"DEBUGGABLE:          {meta.debuggable}",
        f"INSPECTION TOOL:     {meta.tool_used}",
        f"SIGNATURE STATUS:    {sig_status}",
        "VERIFICATION STATUS: PASS",
        "=======================================================================",
    ]
    print("\n".join(report_lines))

    write_github_output(
        {
            "apk_path": str(apk_path),
            "apk_filename": apk_path.name,
            "sha256_path": str(sha256_path),
            "sha256": sha256_hex,
            "apk_size_human": size_human,
            "application_id": meta.application_id,
            "version_code": meta.version_code,
            "version_name": meta.version_name,
            "min_sdk": meta.min_sdk,
            "target_sdk": meta.target_sdk,
            "debuggable": meta.debuggable,
            "inspection_tool": meta.tool_used,
            "signature_status": sig_status,
        }
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
