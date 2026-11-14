import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("network_policy", Path(__file__).parents[1] / "host-network.py")
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)


class NetworkAccounting(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.value = {"operation": "register", "namespace": "fixture", "bridge": "rpx" + policy.digest("fixture"),
                      "key": "11111111-1111-4111-8111-111111111111", "spaceId": "space-one", "ip": "172.20.0.2",
                      "rate": 65536, "burst": 65536, "transfer": 262144, "spaceDaily": 196608,
                      "chunk": 65536, "connections": 8}
        self.current = policy.Policy(self.directory.name, self.value)

    def tearDown(self):
        self.directory.cleanup()

    def record(self):
        result = {k: self.value[k] for k in ("ip", "rate", "burst", "transfer", "spaceDaily", "chunk", "connections")}
        result.update(space=policy.digest(self.value["spaceId"]), granted=0, used=0, allowance=0, day=self.current.today)
        self.current.state["computers"][self.value["key"]] = result
        return result

    def test_reservation_is_durable_before_packets_and_survives_unknown_restart(self):
        record = self.record()
        self.assertIsNone(self.current.grant(record, 0))
        restarted = policy.Policy(self.directory.name, self.value)
        saved = restarted.state["computers"][self.value["key"]]
        self.assertEqual(saved["granted"], 65536)
        self.assertEqual(restarted.state["spaces"][saved["space"]]["reserved"], 65536)
        self.assertIsNone(restarted.grant(saved, 0))
        self.assertEqual(saved["granted"], 131072)

    def test_space_budget_is_shared_and_unused_reservations_are_not_refunded_on_stop(self):
        record = self.record()
        self.current.grant(record, 0)
        with patch.object(policy, "ipt", return_value=SimpleNamespace(returncode=1, stdout=b"")):
            self.current.remove(self.value["key"])
        other = self.record()
        self.current.grant(other, 0)
        self.current.grant(other, 0)
        self.assertEqual(self.current.grant(other, 0), "SPACE_DAILY_TRANSFER_LIMIT")
        self.assertEqual(self.current.state["spaces"][other["space"]]["reserved"], 196608)

    def test_per_start_limit_stays_frozen_when_allowance_is_exhausted(self):
        record = self.record()
        record.update(transfer=65536)
        self.current.grant(record, 0)
        with patch.object(self.current, "quota", return_value=(4, 0)), \
                patch.object(self.current, "freeze") as freeze, patch.object(self.current, "thaw") as thaw, \
                patch.object(policy, "ipt", return_value=SimpleNamespace(returncode=0, stdout=b"")):
            result = self.current.sample()
        self.assertEqual(result["reason"], "COMPUTER_TRANSFER_LIMIT")
        self.assertEqual(result["bytes"], 65536)
        freeze.assert_called_once()
        thaw.assert_not_called()

    def test_day_rollover_discards_old_allowance_and_uses_utc_kernel_cutoff(self):
        record = self.record()
        self.current.grant(record, 0)
        self.current.today = "2099-01-02"
        with patch.object(self.current, "quota", return_value=(4, 12345)), \
                patch.object(self.current, "freeze"), patch.object(self.current, "thaw"), \
                patch.object(policy, "ipt", return_value=SimpleNamespace(returncode=0, stdout=b"")) as ipt:
            result = self.current.sample()
        self.assertIsNone(result["reason"])
        self.assertEqual(record["allowance"], 65536)
        self.assertEqual(record["granted"], 131072)
        self.assertEqual(self.current.state["spaces"][record["space"]], {"day": "2099-01-02", "reserved": 65536})
        rule = next(call.args for call in ipt.call_args_list if call.args[0] == "-R")
        self.assertIn("2099-01-02T23:59:59", rule)
        self.assertNotIn("--kerneltz", rule)

    def test_missing_hook_refuses_instead_of_claiming_enforcement(self):
        self.record()
        with patch.object(self.current, "quota", return_value=(4, 65536)), \
                patch.object(policy, "ipt", side_effect=policy.Refusal("CAPACITY_UNAVAILABLE")):
            with self.assertRaises(policy.Refusal):
                self.current.sample()

    def test_flood_policing_precedes_conntrack_and_only_hooks_the_owned_source(self):
        record = self.record()
        def ipt(*args, **kwargs):
            return SimpleNamespace(returncode=1 if "-S" in args else 0, stdout=b"")
        with patch.object(policy, "ipt", side_effect=ipt) as calls, \
                patch.object(policy, "run", return_value=SimpleNamespace(returncode=1, stdout=b"")) as ipv6:
            self.current.raw_policy(self.value["key"], record)
        rules = [call.args for call in calls.call_args_list]
        self.assertTrue(all(rule[:2] == ("-t", "raw") for rule in rules))
        syn = next(rule for rule in rules if "--syn" in rule)
        self.assertIn("16/second", syn)
        self.assertIn("32", syn)
        udp = next(rule for rule in rules if "64/second" in rule)
        self.assertIn("64", udp)
        hook = next(rule for rule in rules if "PREROUTING" in rule)
        self.assertIn(self.current.bridge, hook)
        self.assertIn(record["ip"], hook)
        self.assertIn(self.current.raw_chain(self.value["key"]), hook)
        self.assertEqual(ipv6.call_args.args[:6], ("ip6tables", "-w", "1", "-t", "raw", "-I"))

    def test_reads_admitted_byte_counters_instead_of_static_nft_quota_options(self):
        record = self.record()
        self.current.grant(record, 0)
        def ipt(*args, **kwargs):
            output = b'-A owned -m quota --quota 65536 -j RETURN\n'
            if "--line-numbers" in args:
                output = b'1 20 16384 RETURN all -- * * 0.0.0.0/0 0.0.0.0/0\n'
            return SimpleNamespace(stdout=output, returncode=0)
        with patch.object(policy, "ipt", side_effect=ipt):
            self.assertEqual(self.current.quota("owned"), (1, 49152))
            record["counter"] = 20000
            with self.assertRaises(policy.Refusal):
                self.current.quota("owned")

    def test_clock_rollback_fails_closed(self):
        self.current.state["latestDay"] = "2099-01-02"
        self.current.save()
        with self.assertRaises(policy.Refusal):
            policy.Policy(self.directory.name, self.value)

    def test_rejects_unsupported_state_and_arbitrary_namespaces_or_arguments(self):
        Path(self.current.path).write_text(json.dumps({"version": 2, "bridge": self.current.bridge}))
        with self.assertRaises(policy.Refusal):
            policy.Policy(self.directory.name, self.value)
        for patch_values in ({"bridge": "eth0"}, {"namespace": "x;true"}, {"ip": "not-an-address"},
                             {"connections": 0}, {"burst": 12}, {"key": "../escape"}):
            with self.assertRaises((policy.Refusal, ValueError)):
                policy.validate({**self.value, **patch_values})


if __name__ == "__main__":
    unittest.main()
