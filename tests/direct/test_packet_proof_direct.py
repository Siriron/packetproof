"""
PacketProof direct-mode test suite.

Executes the real contract under the GenVM SDK (genlayer-test 0.29.2).
Run with: pytest tests/direct -q -p no:cacheprovider

What these tests DO prove:
- All lifecycle state transitions fire correctly.
- Every guard (owner-only, state-gated, bounds checks) is enforced.
- Registry-unavailable and malformed-LLM-output paths produce INCONCLUSIVE.
- Identity-mismatch paths are caught deterministically before consensus.
- The challenge admission and resolution lifecycle works end to end.
- Attestation attempt limits are enforced per generation.
- Certify refuses with incomplete evidence or open window.
- Revoke is terminal before CERTIFIED.

What these tests do NOT prove:
- Real multi-validator consensus behavior with live LLMs.
- Real HTTP fetches against live registries.
- Timing of the review window in production (clock is mocked as 0).
- Cross-provider model variance behavior under adversarial prompts.
Direct mode executes the leader function path only; validator disagreement
is exercised via run_validator() cheatcode.
"""
import os
import json
import hashlib
import datetime as _dt

import pytest

CONTRACT = os.environ.get(
    "PACKET_PROOF_CONTRACT_PATH",
    "contracts/packet_proof.py"
)

T0 = "2026-10-01T00:00:00Z"


def J(raw):
    """Views return JSON strings; decode them."""
    return json.loads(raw)


def _set_clock(vm, iso):
    """Direct-mode warp() patches datetime.now() but NOT gl.message_raw["datetime"],
    which is what the contract reads. Set both so the contract sees the new time."""
    import sys
    vm.warp(iso)
    gl = sys.modules.get("genlayer.gl")  # not loaded until the first deploy
    if gl is not None and getattr(gl, "message_raw", None) is not None:
        gl.message_raw["datetime"] = iso


@pytest.fixture(autouse=True)
def _clock(direct_vm):
    _set_clock(direct_vm, T0)


def _advance(vm, seconds):
    base = _dt.datetime(2026, 10, 1, tzinfo=_dt.timezone.utc)
    _set_clock(vm, (base + _dt.timedelta(seconds=seconds)).strftime("%Y-%m-%dT%H:%M:%SZ"))


# ── Test fixtures ─────────────────────────────────────────────────────────────

PKG_NAME      = "acme-utils"
ECOSYSTEM_NPM = "npm"
ECOSYSTEM_PY  = "pypi"
VERSION       = "1.2.3"
COMMIT_SHA    = "a" * 40
REPO_URL      = "https://github.com/acme/acme-utils"
REVIEW_WINDOW = 300  # seconds

REGISTRY_URL_NPM  = f"https://registry.npmjs.org/{PKG_NAME}/{VERSION}"
REGISTRY_URL_PYPI = f"https://pypi.org/pypi/{PKG_NAME}/{VERSION}/json"


def _canon(v):
    return json.dumps(v, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _digest(v):
    return hashlib.sha256(_canon(v).encode()).hexdigest()


def _pkg_key(name, ecosystem, version):
    return f"{ecosystem}:{name.lower()}:{version}"


def _snapshot(
    name=PKG_NAME,
    ecosystem=ECOSYSTEM_NPM,
    version=VERSION,
    commit_sha=COMMIT_SHA,
    repo_url=REPO_URL,
    dist_hashes=None,
    changelog="Added helper utilities. Minor dependency bump.",
):
    if dist_hashes is None:
        dist_hashes = ["sha512:abc123def456abc123def456abc123def456abc123def456abc123def456abc123def456abc123def456abc123def456"]
    return {
        "schema_version": "packetproof.snapshot.v1",
        "package_name": name,
        "ecosystem": ecosystem,
        "version": version,
        "commit_sha": commit_sha,
        "captured_at": "2026-10-01T00:00:00Z",
        "dist_hashes": dist_hashes,
        "description": "Acme utility library",
        "repository_url": repo_url,
        "changelog_excerpt": changelog,
    }


def _npm_registry_record(
    name=PKG_NAME,
    version=VERSION,
    dist_sha="sha512:abc123def456abc123def456abc123def456abc123def456abc123def456abc123def456abc123def456abc123def456",
):
    return {
        "name": name,
        "version": version,
        "description": "Acme utility library",
        "dist": {
            "shasum": "abc123",
            "integrity": dist_sha,
        },
    }


def _mock_registry(vm, record=None, status=200):
    if record is None:
        record = _npm_registry_record()
    vm.mock_web(
        r".*registry\.npmjs\.org.*",
        {"status": status, "body": json.dumps(record)},
    )


def _patch_body(sha=COMMIT_SHA, body="+ added helper\n- removed deprecated fn\n"):
    """A git format-patch body, as served by GitHub at /commit/<sha>.patch."""
    return f"From {sha} Mon Sep 17 00:00:00 2001\nSubject: [PATCH] release 1.2.3\n\n---\n{body}"


def _mock_diff(vm, body=None, status=200):
    """Mock GitHub's raw .patch endpoint. The plain commit page is mocked as an HTML shell
    that must never be used as evidence."""
    vm.mock_web(
        r".*/commit/[a-f0-9]+\.patch.*",
        {"status": status, "body": _patch_body() if body is None else body},
    )
    vm.mock_web(
        r".*/commit/[a-f0-9]+$",
        {"status": 200, "body": "<html><body>commit page</body></html>"},
    )


def _mock_llm_faithful(vm, faithful=True):
    vm.mock_llm(
        r".*PacketProof snapshot authentication.*",
        json.dumps({"faithful": faithful, "reason": "snapshot matches registry"}),
    )


RULE_IDS = ["changelog_present", "changelog_honest", "version_consistent"]
CHALLENGE_RULE = "challenge_evidence_addressed"


def _findings(statuses, extra=None):
    rows = [{"rule_id": rid, "status": st, "reason": f"{rid} ok"} for rid, st in zip(RULE_IDS, statuses)]
    if extra is not None:
        rows.append({"rule_id": CHALLENGE_RULE, "status": extra, "reason": "challenge evidence assessed"})
    return json.dumps({"findings": rows})


def _mock_llm_attest(vm, statuses=("PRESERVED", "CONSISTENT", "CONSISTENT"), challenge_status="CONSISTENT"):
    """Ordinary runs get 3 findings. Runs whose prompt carries CHALLENGE_EVIDENCE get 4
    (the registered-first mock wins, so the challenge variant goes first)."""
    vm.mock_llm(
        r"(?s).*PacketProof release integrity attestation.*CHALLENGE_EVIDENCE.*",
        _findings(statuses, challenge_status),
    )
    vm.mock_llm(
        r"(?s).*PacketProof release integrity attestation.*",
        _findings(statuses),
    )


def _mock_llm_challenge_admission(vm, relevant=True):
    vm.mock_llm(
        r".*PacketProof challenge admission.*",
        json.dumps({"relevant": relevant, "reason": "related to release"}),
    )


def _register(c):
    return c.register_package(
        PKG_NAME, ECOSYSTEM_NPM, VERSION, COMMIT_SHA, REPO_URL, REVIEW_WINDOW
    )


def _submit_snapshot(vm, c, pkg_key, snap=None):
    if snap is None:
        snap = _snapshot()
    digest = _digest(snap)
    _mock_registry(vm)
    _mock_llm_faithful(vm)
    c.submit_snapshot(pkg_key, json.dumps(snap), digest)
    return snap, digest


def _attest(vm, c, pkg_key, statuses=("PRESERVED", "CONSISTENT", "CONSISTENT")):
    _mock_registry(vm)
    _mock_diff(vm)
    _mock_llm_attest(vm, statuses)
    return c.attest_release(pkg_key)


# ── Registration tests ────────────────────────────────────────────────────────

def test_register_and_read(direct_deploy):
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    p = J(c.get_package(pkg_key))
    assert p["state"] == "DRAFT"
    assert p["package_name"] == PKG_NAME
    assert p["ecosystem"] == ECOSYSTEM_NPM
    assert p["version"] == VERSION
    assert p["commit_sha"] == COMMIT_SHA
    assert p["generation"] == 0


def test_duplicate_registration_rejected(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    _register(c)
    with direct_vm.expect_revert("package version already registered"):
        _register(c)


@pytest.mark.parametrize("name", ["", "x" * 215, "bad name!"])
def test_invalid_package_name(direct_vm, direct_deploy, name):
    c = direct_deploy(CONTRACT)
    with direct_vm.expect_revert("package name invalid"):
        c.register_package(name, ECOSYSTEM_NPM, VERSION, COMMIT_SHA, REPO_URL, REVIEW_WINDOW)


@pytest.mark.parametrize("eco", ["", "rubygems", "cargo", "maven"])
def test_invalid_ecosystem(direct_vm, direct_deploy, eco):
    c = direct_deploy(CONTRACT)
    with direct_vm.expect_revert("ecosystem invalid"):
        c.register_package(PKG_NAME, eco, VERSION, COMMIT_SHA, REPO_URL, REVIEW_WINDOW)


@pytest.mark.parametrize("ver", ["", "1", "a.b.c", "1.2"])
def test_invalid_version(direct_vm, direct_deploy, ver):
    c = direct_deploy(CONTRACT)
    with direct_vm.expect_revert("version must be semver"):
        c.register_package(PKG_NAME, ECOSYSTEM_NPM, ver, COMMIT_SHA, REPO_URL, REVIEW_WINDOW)


@pytest.mark.parametrize("sha", ["", "zzzz", "a" * 39, "a" * 41])
def test_invalid_commit_sha(direct_vm, direct_deploy, sha):
    c = direct_deploy(CONTRACT)
    with direct_vm.expect_revert("commit sha must be 40-char hex"):
        c.register_package(PKG_NAME, ECOSYSTEM_NPM, VERSION, sha, REPO_URL, REVIEW_WINDOW)


@pytest.mark.parametrize("url", [
    "http://github.com/x/y", "https://notgithub.com/x/y", "ftp://github.com/x/y",
    # providers whose commit endpoint is not implemented
    "https://gitlab.com/x/y", "https://bitbucket.org/x/y",
    # malformed github inputs
    "https://github.com/x", "https://github.com/x/y/", "https://github.com/x/y.git",
    "https://github.com/x/y/tree/main", "https://github.com/x/y?a=b", "https://github.com/x/y#frag",
    "https://github.com/x/..", "https://github.com/-x/y", "https://github.com.evil.io/x/y",
    "https://github.com/x/y z",
])
def test_invalid_repo_url(direct_vm, direct_deploy, url):
    c = direct_deploy(CONTRACT)
    with direct_vm.expect_revert("repository url must be github/gitlab/bitbucket https"):
        c.register_package(PKG_NAME, ECOSYSTEM_NPM, VERSION, COMMIT_SHA, url, REVIEW_WINDOW)


@pytest.mark.parametrize("window", [0, 299, 604801, 9999999])
def test_review_window_bounds(direct_vm, direct_deploy, window):
    c = direct_deploy(CONTRACT)
    with direct_vm.expect_revert("review window out of bounds"):
        c.register_package(PKG_NAME, ECOSYSTEM_NPM, VERSION, COMMIT_SHA, REPO_URL, window)


# ── Snapshot submission tests ─────────────────────────────────────────────────

def test_submit_snapshot_success(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    snap, digest = _submit_snapshot(direct_vm, c, pkg_key)
    p = J(c.get_package(pkg_key))
    assert p["state"] == "COMMIT_LOCKED"
    assert p["snapshot_digest"] == digest


def test_submit_snapshot_wrong_state(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key)
    snap = _snapshot()
    with direct_vm.expect_revert("snapshot already submitted"):
        c.submit_snapshot(pkg_key, json.dumps(snap), _digest(snap))


def test_submit_snapshot_digest_mismatch(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    snap = _snapshot()
    wrong_digest = "a" * 64
    with direct_vm.expect_revert("snapshot digest mismatch"):
        c.submit_snapshot(pkg_key, json.dumps(snap), wrong_digest)


def test_submit_snapshot_identity_mismatch_name(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    snap = _snapshot(name="other-pkg")
    with direct_vm.expect_revert("snapshot package_name mismatch"):
        c.submit_snapshot(pkg_key, json.dumps(snap), _digest(snap))


def test_submit_snapshot_identity_mismatch_commit(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    snap = _snapshot(commit_sha="b" * 40)
    with direct_vm.expect_revert("snapshot commit_sha mismatch"):
        c.submit_snapshot(pkg_key, json.dumps(snap), _digest(snap))


def test_submit_snapshot_registry_unavailable_fails(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    snap = _snapshot()
    digest = _digest(snap)
    direct_vm.mock_web(r".*registry\.npmjs\.org.*", {"status": 503, "body": "error"})
    _mock_llm_faithful(direct_vm)
    with direct_vm.expect_revert("snapshot authentication failed"):
        c.submit_snapshot(pkg_key, json.dumps(snap), digest)


def test_submit_snapshot_registry_identity_mismatch_fails(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    snap = _snapshot()
    digest = _digest(snap)
    wrong_record = _npm_registry_record(name="totally-different-pkg")
    direct_vm.mock_web(r".*registry\.npmjs\.org.*", {"status": 200, "body": json.dumps(wrong_record)})
    _mock_llm_faithful(direct_vm)
    with direct_vm.expect_revert("snapshot authentication failed"):
        c.submit_snapshot(pkg_key, json.dumps(snap), digest)


def test_submit_snapshot_not_faithful_fails(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    snap = _snapshot()
    digest = _digest(snap)
    _mock_registry(direct_vm)
    _mock_llm_faithful(direct_vm, faithful=False)
    with direct_vm.expect_revert("snapshot authentication failed"):
        c.submit_snapshot(pkg_key, json.dumps(snap), digest)


def test_submit_snapshot_only_owner(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    pkg_key = _register(c)
    snap = _snapshot()
    digest = _digest(snap)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("not package owner"):
        c.submit_snapshot(pkg_key, json.dumps(snap), digest)


# ── Attestation tests ─────────────────────────────────────────────────────────

def test_attest_verified(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key)
    result = _attest(direct_vm, c, pkg_key)
    assert result == "VERIFIED"
    p = J(c.get_package(pkg_key))
    assert p["state"] == "VERIFIED"
    assert p["generation"] == 1


def test_attest_blocked_when_inconsistent(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key)
    _mock_registry(direct_vm)
    _mock_diff(direct_vm)
    _mock_llm_attest(direct_vm, statuses=("PRESERVED", "INCONSISTENT", "CONSISTENT"))
    result = c.attest_release(pkg_key)
    assert result == "BLOCKED"
    p = J(c.get_package(pkg_key))
    assert p["state"] == "BLOCKED"


def test_attest_inconclusive_on_registry_unavailable(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key)
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*registry\.npmjs\.org.*", {"status": 503, "body": "err"})
    _mock_diff(direct_vm)
    _mock_llm_attest(direct_vm)
    result = c.attest_release(pkg_key)
    assert result == "INCONCLUSIVE"


def test_attest_inconclusive_on_dist_hash_mismatch(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    # Snapshot has different dist hash than registry record
    snap = _snapshot(dist_hashes=["sha512:aaaa"])
    digest = _digest(snap)
    _mock_registry(direct_vm)
    _mock_llm_faithful(direct_vm)
    c.submit_snapshot(pkg_key, json.dumps(snap), digest)
    # Registry record has different dist hash
    record = _npm_registry_record(dist_sha="sha512:bbbb_different")
    direct_vm.mock_web(r".*registry\.npmjs\.org.*", {"status": 200, "body": json.dumps(record)})
    _mock_diff(direct_vm)
    _mock_llm_attest(direct_vm)
    result = c.attest_release(pkg_key)
    assert result == "INCONCLUSIVE"


def test_attest_inconclusive_on_malformed_llm(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key)
    _mock_registry(direct_vm)
    _mock_diff(direct_vm)
    direct_vm.mock_llm(r".*PacketProof release integrity attestation.*", json.dumps({"wrong": []}))
    result = c.attest_release(pkg_key)
    assert result == "INCONCLUSIVE"


def test_attest_only_owner(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("not package owner"):
        c.attest_release(pkg_key)


def test_attest_requires_snapshot(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    with direct_vm.expect_revert("attestation not allowed in state DRAFT"):
        c.attest_release(pkg_key)


def test_attest_attempt_limit_ordinary(direct_vm, direct_deploy):
    """Regression: the retry limit used to be a per-generation count that was always 0."""
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key)
    for _ in range(3):
        direct_vm.clear_mocks()
        direct_vm.mock_web(r".*registry\.npmjs\.org.*", {"status": 503, "body": "err"})
        assert c.attest_release(pkg_key) == "INCONCLUSIVE"
    direct_vm.clear_mocks()
    _mock_registry(direct_vm)
    _mock_diff(direct_vm)
    _mock_llm_attest(direct_vm)
    with direct_vm.expect_revert("ordinary retry limit"):
        c.attest_release(pkg_key)


# ── Attestation digest binding ────────────────────────────────────────────────

def test_attestation_digest_commits_findings(direct_vm, direct_deploy):
    """The attestation_digest must change if findings change."""
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key)
    _attest(direct_vm, c, pkg_key)
    a = J(c.get_attestation(pkg_key, 1))
    assert a.get("attestation_digest") != ""
    # Recompute independently
    fields = (
        "generation", "package_name", "ecosystem", "version", "commit_sha",
        "registry_url", "registry_match", "dist_hash_match", "evidence_available",
        "commit_evidence_available", "commit_patch_digest", "evidence_code",
        "registry_record_digest", "locked_snapshot_digest",
        "findings", "route_result", "attempt", "attempt_kind", "challenge"
    )
    import hashlib
    recomputed = hashlib.sha256(
        json.dumps({k: a.get(k) for k in fields}, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    ).hexdigest()
    assert a["attestation_digest"] == recomputed


# ── Certify tests ─────────────────────────────────────────────────────────────

def test_certify_after_window(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key)
    _attest(direct_vm, c, pkg_key)
    # Warp past review window
    _advance(direct_vm, REVIEW_WINDOW + 1)
    cert_digest = c.certify(pkg_key)
    assert cert_digest != ""
    p = J(c.get_package(pkg_key))
    assert p["state"] == "CERTIFIED"
    cert = J(c.get_certification(pkg_key))
    assert cert["certification_digest"] == cert_digest
    assert cert["version"] == VERSION


def test_certify_blocked_by_open_window(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key)
    _attest(direct_vm, c, pkg_key)
    with direct_vm.expect_revert("review window still open"):
        c.certify(pkg_key)


def test_certify_requires_verified_state(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key)
    # Force BLOCKED
    _mock_registry(direct_vm)
    _mock_diff(direct_vm)
    _mock_llm_attest(direct_vm, statuses=("PRESERVED", "INCONSISTENT", "CONSISTENT"))
    c.attest_release(pkg_key)
    _advance(direct_vm, REVIEW_WINDOW + 1)
    with direct_vm.expect_revert("release not verified"):
        c.certify(pkg_key)


def test_certify_only_owner(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key)
    _attest(direct_vm, c, pkg_key)
    _advance(direct_vm, REVIEW_WINDOW + 1)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("not package owner"):
        c.certify(pkg_key)


def test_certified_is_terminal(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key)
    _attest(direct_vm, c, pkg_key)
    _advance(direct_vm, REVIEW_WINDOW + 1)
    c.certify(pkg_key)
    with direct_vm.expect_revert("release is terminal"):
        c.revoke(pkg_key)


# ── Challenge tests ───────────────────────────────────────────────────────────

EVIDENCE_URL = "https://evidence.example/proof-of-issue.txt"


def _mock_challenge_evidence(vm, text="Package bytes differ from commit", status=200, relevant=True):
    vm.mock_web(r".*evidence\.example.*", {"status": status, "body": text})
    _mock_llm_challenge_admission(vm, relevant=relevant)


def _open_challenge(direct_vm, c, pkg_key, alice, bob):
    direct_vm.sender = alice
    pkg_key_new = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key_new)
    _attest(direct_vm, c, pkg_key_new)
    direct_vm.sender = bob
    _mock_challenge_evidence(direct_vm)
    cid = c.open_challenge(pkg_key_new, EVIDENCE_URL)
    return pkg_key_new, cid


def test_challenge_lifecycle(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key)
    _attest(direct_vm, c, pkg_key)
    # Bob challenges
    direct_vm.sender = direct_bob
    _mock_challenge_evidence(direct_vm)
    cid = c.open_challenge(pkg_key, EVIDENCE_URL)
    assert cid == 1
    p = J(c.get_package(pkg_key))
    assert p["state"] == "CHALLENGED"
    assert p["challenge_open"] is True
    # Reassess
    direct_vm.sender = direct_alice
    _mock_registry(direct_vm)
    _mock_diff(direct_vm)
    _mock_llm_attest(direct_vm)
    result = c.reassess_challenge(pkg_key)
    assert result in ("VERIFIED", "INCONCLUSIVE", "BLOCKED")
    ch = J(c.get_challenge(pkg_key))
    assert ch["resolved"] is True
    assert ch["route_result"] == result


def test_challenge_owner_cannot_challenge_own(direct_vm, direct_deploy, direct_alice):
    c = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key)
    _attest(direct_vm, c, pkg_key)
    _mock_challenge_evidence(direct_vm)
    with direct_vm.expect_revert("owner cannot challenge own release"):
        c.open_challenge(pkg_key, EVIDENCE_URL)


def test_challenge_irrelevant_evidence_rejected(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key)
    _attest(direct_vm, c, pkg_key)
    direct_vm.sender = direct_bob
    _mock_challenge_evidence(direct_vm, relevant=False)
    with direct_vm.expect_revert("challenge evidence rejected"):
        c.open_challenge(pkg_key, EVIDENCE_URL)


def test_challenge_unavailable_evidence_rejected(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key)
    _attest(direct_vm, c, pkg_key)
    direct_vm.sender = direct_bob
    direct_vm.mock_web(r".*evidence\.example.*", {"status": 404, "body": ""})
    _mock_llm_challenge_admission(direct_vm)
    with direct_vm.expect_revert("challenge evidence rejected"):
        c.open_challenge(pkg_key, EVIDENCE_URL)


def test_challenge_blocks_certify(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key)
    _attest(direct_vm, c, pkg_key)
    direct_vm.sender = direct_bob
    _mock_challenge_evidence(direct_vm)
    c.open_challenge(pkg_key, EVIDENCE_URL)
    _advance(direct_vm, REVIEW_WINDOW + 1)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("challenge unresolved"):
        c.certify(pkg_key)


def test_challenge_after_window_rejected(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key)
    _attest(direct_vm, c, pkg_key)
    _advance(direct_vm, REVIEW_WINDOW + 1)
    direct_vm.sender = direct_bob
    _mock_challenge_evidence(direct_vm)
    with direct_vm.expect_revert("review window closed"):
        c.open_challenge(pkg_key, EVIDENCE_URL)


def test_challenge_limit_per_generation(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key)
    _attest(direct_vm, c, pkg_key)
    # Open 3 challenges (each: open, reassess stays VERIFIED, can open again)
    for _ in range(3):
        direct_vm.sender = direct_bob
        _mock_challenge_evidence(direct_vm)
        c.open_challenge(pkg_key, EVIDENCE_URL)
        # Reassess as VERIFIED so challenge resolves and another can open
        direct_vm.sender = direct_alice
        _mock_registry(direct_vm)
        _mock_diff(direct_vm)
        _mock_llm_attest(direct_vm, statuses=("PRESERVED", "CONSISTENT", "CONSISTENT"))
        c.reassess_challenge(pkg_key)
    # 4th challenge exceeds limit
    direct_vm.sender = direct_bob
    _mock_challenge_evidence(direct_vm)
    with direct_vm.expect_revert("challenge limit reached"):
        c.open_challenge(pkg_key, EVIDENCE_URL)


# ── Revoke tests ──────────────────────────────────────────────────────────────

def test_revoke_from_draft(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    c.revoke(pkg_key)
    p = J(c.get_package(pkg_key))
    assert p["state"] == "REVOKED"


def test_revoke_from_verified(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key)
    _attest(direct_vm, c, pkg_key)
    c.revoke(pkg_key)
    p = J(c.get_package(pkg_key))
    assert p["state"] == "REVOKED"


def test_revoke_only_owner(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    pkg_key = _register(c)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("not package owner"):
        c.revoke(pkg_key)


# ── View / query tests ────────────────────────────────────────────────────────

def test_packages_of(direct_vm, direct_deploy, direct_alice):
    c = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    addr = "0x" + bytes(direct_alice).hex()  # direct_alice is raw bytes
    # mixed-case input must resolve to the same ledger key (Bug 10)
    addr = addr[:10] + addr[10:].upper()
    key1 = c.register_package("pkg-alpha", ECOSYSTEM_NPM, "1.0.0", "a" * 40, REPO_URL, REVIEW_WINDOW)
    key2 = c.register_package("pkg-beta",  ECOSYSTEM_NPM, "2.0.0", "b" * 40, REPO_URL, REVIEW_WINDOW)
    result = J(c.packages_of(addr, 0, 10))
    assert key1 in result
    assert key2 in result


def test_get_config(direct_deploy):
    c = direct_deploy(CONTRACT)
    cfg = J(c.get_config())
    assert cfg["network"] == "studionet"
    assert cfg["chain_id"] == 61999
    assert "npm" in cfg["supported_ecosystems"]
    assert "pypi" in cfg["supported_ecosystems"]


def test_get_stats(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    _register(c)
    stats = J(c.get_stats())
    assert stats["packages"] == 1
    assert stats["events_total"] >= 1


def test_get_events(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    _register(c)
    events = J(c.get_events(0, 10))
    assert len(events) >= 1
    assert events[0]["kind"] == "PACKAGE_REGISTERED"


# ── Validator disagreement (run_validator cheatcode) ─────────────────────────

def test_validator_agrees_with_honest_snapshot_leader(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key)
    assert direct_vm.run_validator() is True


def test_validator_rejects_altered_registry_record_digest(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    snap, digest = _submit_snapshot(direct_vm, c, pkg_key)
    tampered = {
        "ok": True, "code": "FAITHFUL", "snapshot_digest": digest,
        "registry_record_digest": "a" * 64,
        "registry_match": True, "explanation": "snapshot matches registry",
    }
    assert direct_vm.run_validator(leader_result=tampered) is False


def test_validator_rejects_leader_error(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key)
    assert direct_vm.run_validator(leader_error=Exception("boom")) is False


def test_validator_agrees_with_honest_attestation_leader(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key)
    _attest(direct_vm, c, pkg_key)
    assert direct_vm.run_validator() is True


def test_validator_rejects_altered_findings(direct_vm, direct_deploy):
    """A leader that flips one rule status must be rejected."""
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key)
    _attest(direct_vm, c, pkg_key)
    honest = J(c.get_attestation(pkg_key, 1))
    leader = {k: honest[k] for k in (
        "ok", "evidence_available", "package_name", "ecosystem", "version",
        "commit_sha", "registry_url", "registry_match", "dist_hash_match",
        "registry_record_digest", "locked_snapshot_digest", "findings",
        "route_result", "challenge", "attempt", "attempt_kind") if k in honest}
    leader["leader_explanations"] = [
        {"rule_id": f["rule_id"], "text": "ok"} for f in honest["findings"]]
    leader["attempt"] = 0
    leader["findings"] = [dict(f) for f in honest["findings"]]
    leader["findings"][1]["status"] = "INCONSISTENT"
    leader["route_result"] = "BLOCKED"
    assert direct_vm.run_validator(leader_result=leader) is False


# ── PyPI ecosystem ────────────────────────────────────────────────────────────

def test_register_pypi(direct_deploy):
    c = direct_deploy(CONTRACT)
    pkg_key = c.register_package(
        "requests", ECOSYSTEM_PY, "2.31.0", "c" * 40,
        "https://github.com/psf/requests", REVIEW_WINDOW
    )
    p = J(c.get_package(pkg_key))
    assert p["ecosystem"] == ECOSYSTEM_PY
    assert p["state"] == "DRAFT"


def test_submit_snapshot_pypi(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    pkg_key = c.register_package(
        "requests", ECOSYSTEM_PY, "2.31.0", "c" * 40,
        "https://github.com/psf/requests", REVIEW_WINDOW
    )
    snap = _snapshot(
        name="requests", ecosystem=ECOSYSTEM_PY, version="2.31.0",
        commit_sha="c" * 40, repo_url="https://github.com/psf/requests",
        dist_hashes=["sha256:mydigest"]
    )
    digest = _digest(snap)
    pypi_record = {
        "info": {"name": "requests", "version": "2.31.0", "description": "HTTP library"},
        "urls": [{"digests": {"sha256": "mydigest"}}]
    }
    direct_vm.mock_web(r".*pypi\.org.*", {"status": 200, "body": json.dumps(pypi_record)})
    _mock_llm_faithful(direct_vm)
    c.submit_snapshot(pkg_key, json.dumps(snap), digest)
    p = J(c.get_package(pkg_key))
    assert p["state"] == "COMMIT_LOCKED"


# ── Regression + coverage added in the second audit ──────────────────────────

def _verified_and_challenged(direct_vm, c, alice, bob):
    direct_vm.sender = alice
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key)
    _attest(direct_vm, c, pkg_key)
    direct_vm.sender = bob
    _mock_challenge_evidence(direct_vm)
    c.open_challenge(pkg_key, EVIDENCE_URL)
    direct_vm.sender = alice
    return pkg_key


def test_reassess_downgrades_to_blocked(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    pkg_key = _verified_and_challenged(direct_vm, c, direct_alice, direct_bob)
    direct_vm.clear_mocks()  # first-registered mock wins, so drop the honest one
    _mock_registry(direct_vm)
    _mock_diff(direct_vm)
    _mock_llm_attest(direct_vm, statuses=("PRESERVED", "INCONSISTENT", "CONSISTENT"))
    assert c.reassess_challenge(pkg_key) == "BLOCKED"
    p = J(c.get_package(pkg_key))
    assert p["state"] == "BLOCKED" and p["challenge_open"] is False
    assert p["review_deadline"] == 0


def test_reassess_stays_verified_and_keeps_window(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    pkg_key = _verified_and_challenged(direct_vm, c, direct_alice, direct_bob)
    _mock_registry(direct_vm)
    _mock_diff(direct_vm)
    _mock_llm_attest(direct_vm)
    assert c.reassess_challenge(pkg_key) == "VERIFIED"
    assert J(c.get_package(pkg_key))["state"] == "VERIFIED"


def test_reassess_without_open_challenge_reverts(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    with direct_vm.expect_revert("no challenge open"):
        c.reassess_challenge(pkg_key)


def test_revoke_from_challenged_clears_challenge(direct_vm, direct_deploy, direct_alice, direct_bob):
    """Bounded exit: an owner can always leave a stuck CHALLENGED state."""
    c = direct_deploy(CONTRACT)
    pkg_key = _verified_and_challenged(direct_vm, c, direct_alice, direct_bob)
    c.revoke(pkg_key)
    p = J(c.get_package(pkg_key))
    assert p["state"] == "REVOKED" and p["challenge_open"] is False


def test_revoke_certified_reverts(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key)
    _attest(direct_vm, c, pkg_key)
    _advance(direct_vm, REVIEW_WINDOW + 1)
    c.certify(pkg_key)
    with direct_vm.expect_revert("release is terminal"):
        c.revoke(pkg_key)


def test_attest_in_draft_state_reverts(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    with direct_vm.expect_revert("attestation not allowed in state DRAFT"):
        c.attest_release(pkg_key)


def test_unknown_records_read_as_empty(direct_deploy):
    c = direct_deploy(CONTRACT)
    assert J(c.get_package("npm:nope:1.0.0")) == {}
    assert J(c.get_attestation("npm:nope:1.0.0", 1)) == {}
    assert J(c.get_certification("npm:nope:1.0.0")) == {}
    assert J(c.get_challenge("npm:nope:1.0.0")) == {}


def test_list_packages_survives_event_ring_rollover(direct_vm, direct_deploy):
    """Regression: list_packages used to be rebuilt from a 300-slot event ring."""
    c = direct_deploy(CONTRACT)
    first = _register(c)
    _submit_snapshot(direct_vm, c, first)
    for _ in range(3):  # many events, no new packages
        direct_vm.clear_mocks()
        direct_vm.mock_web(r".*registry\.npmjs\.org.*", {"status": 503, "body": "err"})
        c.attest_release(first)
    for i in range(2, 12):
        c.register_package(f"pkg-{i}", ECOSYSTEM_NPM, "1.0.0", "d" * 40, REPO_URL, REVIEW_WINDOW)
    listed = J(c.list_packages(0, 50))
    assert listed[0] == first and len(listed) == 11
    assert J(c.list_packages(10, 5)) == listed[10:11]


def test_registry_reply_that_is_not_a_json_object_is_inconclusive(direct_vm, direct_deploy):
    """Regression: a JSON array from the registry crashed leader_fn (consensus never settled)."""
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key)
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*registry\.npmjs\.org.*", {"status": 200, "body": "[1, 2, 3]"})
    assert c.attest_release(pkg_key) == "INCONCLUSIVE"


@pytest.mark.parametrize("hashes", [["abc123"], ["shasum:abc123"]])
def test_snapshot_with_registry_hash_in_bare_or_keyed_form_verifies(direct_vm, direct_deploy, hashes):
    """Regression: only 'key:value' matched, but the UI tells users to paste the bare value."""
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key, _snapshot(dist_hashes=hashes))
    assert _attest(direct_vm, c, pkg_key) == "VERIFIED"


def test_snapshot_hash_not_in_registry_is_inconclusive(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key, _snapshot(dist_hashes=["sha512-deadbeef"]))
    assert _attest(direct_vm, c, pkg_key) == "INCONCLUSIVE"


def test_pkg_key_is_case_normalised(direct_deploy):
    c = direct_deploy(CONTRACT)
    key = c.register_package("Acme-Utils", ECOSYSTEM_NPM, VERSION, COMMIT_SHA, REPO_URL, REVIEW_WINDOW)
    assert key == f"npm:acme-utils:{VERSION}"
    with pytest.raises(Exception):
        c.register_package("ACME-UTILS", ECOSYSTEM_NPM, VERSION, COMMIT_SHA, REPO_URL, REVIEW_WINDOW)


def test_no_storage_object_crosses_into_the_nondet_closures(direct_vm, direct_deploy, direct_alice, direct_bob):
    direct_vm.check_pickling = True
    c = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key)
    _attest(direct_vm, c, pkg_key)
    direct_vm.sender = direct_bob
    _mock_challenge_evidence(direct_vm)
    c.open_challenge(pkg_key, EVIDENCE_URL)
    assert direct_vm.run_validator() is True


# ── Steward-review corrections (Oct 2026) ────────────────────────────────────

def _verified(direct_vm, c, alice=None):
    if alice is not None:
        direct_vm.sender = alice
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key)
    assert _attest(direct_vm, c, pkg_key) == "VERIFIED"
    return pkg_key


def _attest_with_patch(direct_vm, c, pkg_key, **diff_kwargs):
    _mock_registry(direct_vm)
    _mock_diff(direct_vm, **diff_kwargs)
    _mock_llm_attest(direct_vm)  # model would happily say everything is consistent
    return c.attest_release(pkg_key)


def test_verified_attestation_records_bound_commit_evidence(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    pkg_key = _verified(direct_vm, c)
    a = J(c.get_attestation(pkg_key, 1))
    assert a["evidence_code"] == "OK" and a["commit_evidence_available"] is True
    assert a["commit_patch_digest"] == hashlib.sha256(_patch_body().encode()).hexdigest()


@pytest.mark.parametrize("status", [403, 404, 500])
def test_unavailable_commit_evidence_cannot_verify(direct_vm, direct_deploy, status):
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key)
    assert _attest_with_patch(direct_vm, c, pkg_key, body="gone", status=status) == "INCONCLUSIVE"
    a = J(c.get_attestation(pkg_key, 1))
    assert a["evidence_code"] == "COMMIT_UNAVAILABLE" and a["commit_evidence_available"] is False
    assert J(c.get_package(pkg_key))["state"] == "INCONCLUSIVE"


def test_html_commit_page_is_never_used_as_a_diff(direct_vm, direct_deploy):
    """Regression: the old code fell back to the plain commit page (an HTML shell)."""
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key)
    assert _attest_with_patch(direct_vm, c, pkg_key, body="x", status=404) == "INCONCLUSIVE"
    assert J(c.get_attestation(pkg_key, 1))["evidence_code"] == "COMMIT_UNAVAILABLE"


@pytest.mark.parametrize("body", [
    "<html><body>commit page</body></html>",
    "+ added helper\n- removed fn\n",
    _patch_body(sha="b" * 40),
])
def test_commit_evidence_must_echo_the_locked_sha(direct_vm, direct_deploy, body):
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key)
    assert _attest_with_patch(direct_vm, c, pkg_key, body=body) == "INCONCLUSIVE"
    assert J(c.get_attestation(pkg_key, 1))["evidence_code"] == "COMMIT_UNBOUND"


def test_oversized_commit_patch_is_inconclusive_not_truncated(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key)
    big = _patch_body(body="+ line\n" * 3000)
    assert _attest_with_patch(direct_vm, c, pkg_key, body=big) == "INCONCLUSIVE"
    assert J(c.get_attestation(pkg_key, 1))["evidence_code"] == "COMMIT_TOO_LARGE"


def test_patch_url_is_derived_from_locked_repo_and_sha(direct_vm, direct_deploy):
    """Only github.com/acme/acme-utils/commit/<locked sha>.patch is mocked; any other URL would fail."""
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key)
    _mock_registry(direct_vm)
    direct_vm.mock_web(
        rf"^https://github\.com/acme/acme-utils/commit/{COMMIT_SHA}\.patch$",
        {"status": 200, "body": _patch_body()},
    )
    _mock_llm_attest(direct_vm)
    assert c.attest_release(pkg_key) == "VERIFIED"


def test_all_committed_dist_hashes_must_match_registry(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    pkg_key = _register(c)
    _submit_snapshot(direct_vm, c, pkg_key, _snapshot(dist_hashes=["abc123", "not-in-registry"]))
    assert _attest(direct_vm, c, pkg_key) == "INCONCLUSIVE"
    assert J(c.get_attestation(pkg_key, 1))["evidence_code"] == "DIST_HASH_MISMATCH"


def test_certify_still_works_with_bound_commit_evidence(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    pkg_key = _verified(direct_vm, c)
    _advance(direct_vm, REVIEW_WINDOW + 1)
    digest = c.certify(pkg_key)
    cert = J(c.get_certification(pkg_key))
    assert cert["certification_digest"] == digest
    assert cert["evidence_set"]["commit_patch_digest"]


# ── challenge evidence reaches the validators and changes the verdict ─────────

SMOKING_GUN = "Tarball contains postinstall script absent from the commit, see diff line 42"


def _challenged(direct_vm, c, alice, bob, text=SMOKING_GUN):
    pkg_key = _verified(direct_vm, c, alice)
    direct_vm.sender = bob
    _mock_challenge_evidence(direct_vm, text=text)
    c.open_challenge(pkg_key, EVIDENCE_URL)
    direct_vm.sender = alice
    direct_vm.clear_mocks()
    _mock_registry(direct_vm)
    _mock_diff(direct_vm)
    return pkg_key


def _llm_when_evidence_in_prompt(vm, evidence_status):
    """Model answers BLOCKED-worthy only if the admitted evidence text is literally in the prompt."""
    vm.mock_llm(
        r"(?s).*PacketProof release integrity attestation.*CHALLENGE_EVIDENCE.*postinstall script absent.*",
        _findings(("PRESERVED", "CONSISTENT", "CONSISTENT"), evidence_status),
    )
    vm.mock_llm(
        r"(?s).*PacketProof release integrity attestation.*",
        _findings(("PRESERVED", "CONSISTENT", "CONSISTENT"), "CONSISTENT"),
    )


def test_admitted_challenge_evidence_is_in_the_reassessment_prompt_and_can_block(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    pkg_key = _challenged(direct_vm, c, direct_alice, direct_bob)
    _llm_when_evidence_in_prompt(direct_vm, "INCONSISTENT")
    assert c.reassess_challenge(pkg_key) == "BLOCKED"
    p = J(c.get_package(pkg_key))
    assert p["state"] == "BLOCKED" and p["review_deadline"] == 0
    a = J(c.get_attestation(pkg_key, 1))
    assert a["attempt_kind"] == "CHALLENGE"
    by_rule = {f["rule_id"]: f["status"] for f in a["findings"]}
    assert by_rule[CHALLENGE_RULE] == "INCONSISTENT"
    assert a["challenge"]["evidence_digest"] == hashlib.sha256(SMOKING_GUN.encode()).hexdigest()


def test_challenge_evidence_that_does_not_hold_up_keeps_release_verified(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    pkg_key = _challenged(direct_vm, c, direct_alice, direct_bob)
    _llm_when_evidence_in_prompt(direct_vm, "CONSISTENT")
    assert c.reassess_challenge(pkg_key) == "VERIFIED"
    assert J(c.get_package(pkg_key))["state"] == "VERIFIED"


@pytest.mark.parametrize("status", ["MISSING", "UNREADABLE", "CONFLICTING"])
def test_uncertain_challenge_evidence_downgrades_to_inconclusive(direct_vm, direct_deploy, direct_alice, direct_bob, status):
    c = direct_deploy(CONTRACT)
    pkg_key = _challenged(direct_vm, c, direct_alice, direct_bob)
    _llm_when_evidence_in_prompt(direct_vm, status)
    assert c.reassess_challenge(pkg_key) == "INCONCLUSIVE"


def test_reassessment_without_the_challenge_rule_finding_is_malformed(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    pkg_key = _challenged(direct_vm, c, direct_alice, direct_bob)
    direct_vm.mock_llm(r"(?s).*PacketProof release integrity attestation.*", _findings(("PRESERVED", "CONSISTENT", "CONSISTENT")))
    assert c.reassess_challenge(pkg_key) == "INCONCLUSIVE"
    assert J(c.get_attestation(pkg_key, 1))["evidence_code"] == "MALFORMED_OUTPUT"


def test_reassessment_with_unavailable_commit_cannot_stay_verified(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    pkg_key = _challenged(direct_vm, c, direct_alice, direct_bob)
    direct_vm.clear_mocks()
    _mock_registry(direct_vm)
    _mock_diff(direct_vm, body="gone", status=404)
    _llm_when_evidence_in_prompt(direct_vm, "CONSISTENT")
    assert c.reassess_challenge(pkg_key) == "INCONCLUSIVE"


def test_validator_agrees_on_challenge_reassessment_and_rejects_a_flipped_challenge_status(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    pkg_key = _challenged(direct_vm, c, direct_alice, direct_bob)
    _llm_when_evidence_in_prompt(direct_vm, "INCONSISTENT")
    c.reassess_challenge(pkg_key)
    assert direct_vm.run_validator() is True
    a = J(c.get_attestation(pkg_key, 1))
    # leader claims the challenge rule was CONSISTENT while validators independently see INCONSISTENT
    forged = {k: a[k] for k in a if k not in ("generation", "attestation_digest")}
    forged["findings"] = [dict(f, status="CONSISTENT") if f["rule_id"] == CHALLENGE_RULE else f for f in a["findings"]]
    forged["route_result"] = "VERIFIED"
    forged["leader_explanations"] = [{"rule_id": f["rule_id"], "text": "ok"} for f in a["findings"]]
    forged["attempt"] = 0
    assert direct_vm.run_validator(leader_result=forged) is False


def test_validator_rejects_a_verified_claim_when_commit_patch_is_unavailable(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    pkg_key = _verified(direct_vm, c)
    a = J(c.get_attestation(pkg_key, 1))
    direct_vm.clear_mocks()
    _mock_registry(direct_vm)
    _mock_diff(direct_vm, body="gone", status=404)
    _mock_llm_attest(direct_vm)
    forged = {k: a[k] for k in a if k not in ("generation", "attestation_digest")}
    forged["attempt"] = 0
    assert direct_vm.run_validator(leader_result=forged) is False


# ── repository input restriction ──────────────────────────────────────────────

@pytest.mark.parametrize("url", ["https://github.com/a/b", "https://github.com/Acme-Org/acme.utils_x"])
def test_valid_github_repo_urls_register(direct_deploy, url):
    c = direct_deploy(CONTRACT)
    assert c.register_package(PKG_NAME, ECOSYSTEM_NPM, VERSION, COMMIT_SHA, url, REVIEW_WINDOW)


def test_config_advertises_only_github(direct_deploy):
    c = direct_deploy(CONTRACT)
    cfg = J(c.get_config())
    assert cfg["supported_repository_hosts"] == ["github.com"]
