"""운영 설정 도구의 거절·SQL 인용·자격 증명 보관 경계를 검사한다. 외부 DB에는 접속하지 않는다."""
import contextlib
import io
import json
from pathlib import Path
import runpy
import stat
import tempfile
import unittest
from unittest.mock import patch

module = runpy.run_path(str(Path(__file__).with_name("workout-setup.py")))
validate = module["validate_config"]
config_sql = module["config_sql"]


def config():
    seed = (Path(__file__).resolve().parents[2] / "supabase/seeds/mvp-workout-20261110.sql").read_text()
    policy = json.loads(seed.split("$json$")[1])
    return {"exercises": [{"id": k, "name": "테스트 운동", "body_parts": ["하체"], "internal_focus_instruction": "테스트 안내", "enabled": True}
                           for k in ["squat", "push_up", "lunge"]],
            "policies": {"generation_validation": policy, "workout_start": {"allow_reuse": True}}}


class WorkoutSetupTest(unittest.TestCase):
    def test_supplied_policy_passes_without_replacing_false_summary_policy(self):
        value = validate(config())
        self.assertIs(value["policies"]["generation_validation"]["include_generated_summary"], False)

    def test_missing_or_malformed_limits_and_policies_fail(self):
        for part in [None, [], {}, {"workout_start": {"allow_reuse": "true"}}, {"generation_validation": []}]:
            value = config()
            value["policies"] = part
            with self.assertRaises(ValueError):
                validate(value)
        for limits in [None, [], {"squat": {"min": True, "max": 20}}, {"squat": {"min": 20, "max": 5}}]:
            value = config()
            value["policies"]["generation_validation"]["repetition_limits"] = limits
            with self.assertRaises(ValueError):
                validate(value)

    def test_invalid_exercise_and_schema_fail(self):
        for change in [{"id": ""}, {"body_parts": ["기타"]}, {"body_parts": ["하체", "하체"]}, {"enabled": "true"}]:
            value = config()
            value["exercises"][0].update(change)
            with self.assertRaises(ValueError):
                validate(value)
        value = config()
        value["policies"]["generation_validation"]["summary_schema"]["required"] = None
        with self.assertRaises(ValueError):
            validate(value)

    def test_sql_quotes_data_and_uses_one_transaction(self):
        value = config()
        value["exercises"][0]["name"] = "literal'); DROP TABLE example; --"
        sql = config_sql(validate(value))
        self.assertIn("literal''); DROP TABLE example; --", sql)
        self.assertTrue(sql.startswith("BEGIN;"))
        self.assertTrue(sql.endswith("COMMIT;"))
        self.assertIn("enabled exercise missing limits", sql)

    def test_worker_credentials_are_distinct_private_and_never_printed(self):
        prepare = module["prepare_worker"]
        statements = []
        with tempfile.TemporaryDirectory() as directory:
            env = Path(directory) / ".env"
            env.write_text("R2DBC_URL=r2dbc:postgresql://db/test\nR2DBC_USERNAME=healthmith_app.project\nR2DBC_PASSWORD=original-app-secret\nGENERATION_WORKER_ENABLED=false\n")
            output = io.StringIO()
            with patch.dict(prepare.__globals__, {"database": lambda _: lambda sql: statements.append(sql)}), contextlib.redirect_stdout(output):
                prepare(env, Path(directory) / ".env.admin")
            result = module["settings"](env)
            self.assertEqual("healthmith_worker.project", result["WORKER_R2DBC_USERNAME"])
            self.assertNotEqual(result["R2DBC_PASSWORD"], result["WORKER_R2DBC_PASSWORD"])
            self.assertEqual("false", result["GENERATION_WORKER_ENABLED"])
            self.assertEqual(0o600, stat.S_IMODE(env.stat().st_mode))
            self.assertNotIn(result["WORKER_R2DBC_PASSWORD"], output.getvalue())
            self.assertNotIn(result["R2DBC_PASSWORD"], output.getvalue())
            self.assertIn("rolcanlogin", statements[0])
            with self.assertRaises(ValueError):
                prepare(env, Path(directory) / ".env.admin")

    def test_failed_database_does_not_write_worker_credentials(self):
        prepare = module["prepare_worker"]
        with tempfile.TemporaryDirectory() as directory:
            env = Path(directory) / ".env"
            original = "R2DBC_URL=r2dbc:postgresql://db/test\nR2DBC_USERNAME=healthmith_app\n"
            env.write_text(original)
            def fail(_):
                raise ValueError("연결 실패")
            with patch.dict(prepare.__globals__, {"database": lambda _: fail}), self.assertRaises(ValueError):
                prepare(env, Path(directory) / ".env.admin")
            self.assertEqual(original, env.read_text())


if __name__ == "__main__":
    unittest.main()
