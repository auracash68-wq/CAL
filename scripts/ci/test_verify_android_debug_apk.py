#!/usr/bin/env python3
"""
Unit tests for scripts/ci/verify-android-debug-apk.py.
Covers regression protection against greedy regex bugs (e.g. platformBuildVersionName='16'),
dynamic APK discovery, stale/ambiguous/empty/corrupt APKs, and real project Gradle config parsing.
"""

import importlib.util
import json
import os
import stat
import sys
import tempfile
import time
import unittest
import zipfile
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parent / "verify-android-debug-apk.py"
SPEC = importlib.util.spec_from_file_location("verify_apk", SCRIPT_PATH)
assert SPEC and SPEC.loader
verify_apk = importlib.util.module_from_spec(SPEC)
sys.modules["verify_apk"] = verify_apk
SPEC.loader.exec_module(verify_apk)


def _create_valid_dummy_apk(target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("AndroidManifest.xml", b"binary-manifest-placeholder")
        zf.writestr("classes.dex", b"dex\n039\x00placeholder")
        zf.writestr("resources.arsc", b"resources-placeholder")


class ApkMetadataParserTests(unittest.TestCase):
    def test_regression_never_extracts_platform_build_version_name_as_package_id(self) -> None:
        badging = "\n".join(
            [
                "package: name='com.example.app' versionCode='12' versionName='2.3.1' "
                "platformBuildVersionName='16' platformBuildVersionCode='36' "
                "compileSdkVersion='36' compileSdkVersionCodename='16'",
                "sdkVersion:'24'",
                "targetSdkVersion:'36'",
                "application-debuggable",
            ]
        )
        meta = verify_apk.parse_aapt_badging(badging)
        self.assertEqual(meta.application_id, "com.example.app")
        self.assertNotEqual(meta.application_id, "16")
        self.assertEqual(meta.version_code, "12")
        self.assertEqual(meta.version_name, "2.3.1")
        self.assertEqual(meta.min_sdk, "24")
        self.assertEqual(meta.target_sdk, "36")
        self.assertEqual(meta.debuggable, "true")

    def test_reordered_attributes_still_extract_true_application_id(self) -> None:
        badging = (
            "package: platformBuildVersionName='16' platformBuildVersionCode='36' "
            "name='in.ganaka.calculator.debug' versionCode='7' versionName='1.4.2-beta'\n"
            "sdkVersion:'24'\n"
            "targetSdkVersion:'36'\n"
            "application-debuggable\n"
        )
        meta = verify_apk.parse_aapt_badging(badging)
        self.assertEqual(meta.application_id, "in.ganaka.calculator.debug")
        self.assertEqual(meta.version_code, "7")
        self.assertEqual(meta.version_name, "1.4.2-beta")

    def test_rejects_numeric_or_malformed_application_id(self) -> None:
        badging = "package: name='16' versionCode='1' versionName='1.0'\n"
        with self.assertRaises(verify_apk.ClassifiedError) as ctx:
            verify_apk.parse_aapt_badging(badging)
        self.assertEqual(ctx.exception.category, "APK_VERIFICATION_FAILURE")


class ProjectGradleConfigTests(unittest.TestCase):
    def test_reads_actual_ganaka_android_gradle_configuration(self) -> None:
        repo_root = Path(__file__).resolve().parents[2]
        cfg = verify_apk.read_expected_gradle_config(repo_root / "android", module_name="app", variant="debug")
        self.assertEqual(cfg.application_id, "in.ganaka.calculator")
        self.assertEqual(cfg.version_code, "1")
        self.assertEqual(cfg.version_name, "1.0.0")
        self.assertEqual(cfg.min_sdk, "24")
        self.assertEqual(cfg.target_sdk, "36")

    def test_applies_debug_application_id_suffix_and_version_suffix(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            android_dir = Path(tmp) / "android"
            app_dir = android_dir / "app"
            app_dir.mkdir(parents=True)
            (app_dir / "build.gradle").write_text(
                """
                android {
                    namespace = "com.example.base"
                    defaultConfig {
                        applicationId "com.example.flavor"
                        minSdkVersion 26
                        targetSdkVersion 36
                        versionCode 42
                        versionName "3.2.0"
                    }
                    buildTypes {
                        debug {
                            applicationIdSuffix ".debug"
                            versionNameSuffix "-dev"
                        }
                    }
                }
                """,
                encoding="utf-8",
            )
            cfg = verify_apk.read_expected_gradle_config(android_dir, module_name="app", variant="debug")
            self.assertEqual(cfg.application_id, "com.example.flavor.debug")
            self.assertEqual(cfg.version_code, "42")
            self.assertEqual(cfg.version_name, "3.2.0-dev")
            self.assertEqual(cfg.min_sdk, "26")
            self.assertEqual(cfg.target_sdk, "36")


class ApkDiscoveryAndIntegrityTests(unittest.TestCase):
    def test_missing_apk_raises_discovery_failure(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            android_dir = Path(tmp) / "android"
            (android_dir / "app/build/outputs/apk/debug").mkdir(parents=True)
            with self.assertRaises(verify_apk.ClassifiedError) as ctx:
                verify_apk.discover_debug_apk(android_dir)
            self.assertEqual(ctx.exception.category, "APK_DISCOVERY_FAILURE")

    def test_empty_and_corrupt_apk_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            empty_apk = Path(tmp) / "empty.apk"
            empty_apk.write_bytes(b"")
            with self.assertRaises(verify_apk.ClassifiedError) as ctx1:
                verify_apk.verify_apk_zip_structure(empty_apk)
            self.assertEqual(ctx1.exception.category, "APK_VERIFICATION_FAILURE")

            corrupt_apk = Path(tmp) / "corrupt.apk"
            corrupt_apk.write_bytes(b"not-a-valid-zip-file")
            with self.assertRaises(verify_apk.ClassifiedError) as ctx2:
                verify_apk.verify_apk_zip_structure(corrupt_apk)
            self.assertEqual(ctx2.exception.category, "APK_VERIFICATION_FAILURE")

    def test_ambiguous_multiple_apks_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            android_dir = Path(tmp) / "android"
            out_dir = android_dir / "app/build/outputs/apk/debug"
            _create_valid_dummy_apk(out_dir / "flavorA-debug.apk")
            _create_valid_dummy_apk(out_dir / "flavorB-debug.apk")
            with self.assertRaises(verify_apk.ClassifiedError) as ctx:
                verify_apk.discover_debug_apk(android_dir)
            self.assertEqual(ctx.exception.category, "APK_DISCOVERY_FAILURE")

    def test_stale_apk_excluded_via_build_marker(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            android_dir = Path(tmp) / "android"
            stale_apk = android_dir / "app/build/outputs/apk/debug/app-debug.apk"
            _create_valid_dummy_apk(stale_apk)
            old_ts = time.time() - 120
            os.utime(stale_apk, (old_ts, old_ts))
            with self.assertRaises(verify_apk.ClassifiedError) as ctx:
                verify_apk.discover_debug_apk(android_dir, min_mtime=time.time())
            self.assertEqual(ctx.exception.category, "APK_DISCOVERY_FAILURE")

    def test_end_to_end_verification_with_mocked_apkanalyzer_and_apksigner(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            android_dir = root / "android"
            app_dir = android_dir / "app"
            app_dir.mkdir(parents=True)
            (app_dir / "build.gradle").write_text(
                """
                android {
                    namespace = "in.ganaka.calculator"
                    defaultConfig {
                        applicationId "in.ganaka.calculator"
                        minSdkVersion 24
                        targetSdkVersion 36
                        versionCode 1
                        versionName "1.0.0"
                    }
                }
                """,
                encoding="utf-8",
            )
            apk_dir = app_dir / "build/outputs/apk/debug"
            apk_path = apk_dir / "ganaka-debug.apk"
            _create_valid_dummy_apk(apk_path)
            (apk_dir / "output-metadata.json").write_text(
                json.dumps(
                    {
                        "variantName": "debug",
                        "elements": [{"outputFile": "ganaka-debug.apk"}],
                    }
                ),
                encoding="utf-8",
            )

            mock_analyzer = root / "apkanalyzer"
            mock_analyzer.write_text(
                """#!/usr/bin/env bash
case "$1 $2" in
  "manifest application-id") echo "in.ganaka.calculator" ;;
  "manifest version-code") echo "1" ;;
  "manifest version-name") echo "1.0.0" ;;
  "manifest min-sdk") echo "24" ;;
  "manifest target-sdk") echo "36" ;;
  "manifest debuggable") echo "true" ;;
  "apk summary") echo "in.ganaka.calculator 1 1.0.0" ;;
  *) exit 1 ;;
esac
""",
                encoding="utf-8",
            )
            mock_analyzer.chmod(mock_analyzer.stat().st_mode | stat.S_IXUSR)

            mock_signer = root / "apksigner"
            mock_signer.write_text("#!/usr/bin/env bash\necho 'Verifies'\n", encoding="utf-8")
            mock_signer.chmod(mock_signer.stat().st_mode | stat.S_IXUSR)

            found_apk, sha_file, meta, sha_hex, size_bytes, sig_status = verify_apk.run_verification(
                android_dir=android_dir,
                module_name="app",
                variant="debug",
                apkanalyzer_bin=str(mock_analyzer),
                apksigner_bin=str(mock_signer),
            )
            self.assertEqual(found_apk.name, "ganaka-debug.apk")
            self.assertEqual(meta.application_id, "in.ganaka.calculator")
            self.assertEqual(meta.debuggable, "true")
            self.assertTrue(sha_file.is_file())
            self.assertEqual(len(sha_hex), 64)
            self.assertGreater(size_bytes, 0)
            self.assertIn("VERIFIED", sig_status)


if __name__ == "__main__":
    unittest.main()
