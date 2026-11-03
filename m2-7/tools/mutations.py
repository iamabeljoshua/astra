# Breaks each behavior in turn, runs the web tests, prints the failing tests and their assertion diffs, and restores the file.
import json, subprocess, sys, pathlib
REPO = pathlib.Path('/Users/abel/startup/astra-worktrees/m2-7')
MUTATIONS = [
  ('limit back to 10 seconds', 'apps/web/src/api/requestTimeout.ts', 'DEFAULT_REQUEST_TIMEOUT_MS = 30_000', 'DEFAULT_REQUEST_TIMEOUT_MS = 10_000'),
  ('timeout retried', 'apps/web/src/api/queryClient.ts', "timeout: false", "timeout: true"),
  ('Home sets its own 4 second limit', 'apps/web/src/home/useHomeScreen.ts', "api.get('/home', { signal })", "api.get('/home', { signal, timeoutMs: 4_000 })"),
  ('caller abort no longer retried', 'apps/web/src/api/queryClient.ts', "aborted: true", "aborted: false"),
  ('quick server failure no longer retried', 'apps/web/src/api/queryClient.ts', "server: true", "server: false"),
  ('quick network failure no longer retried', 'apps/web/src/api/queryClient.ts', "network: true", "network: false"),
  ('limit reads as aborted, as on trunk', 'apps/web/src/api/apiError.ts', "signal.reason === REQUEST_TIME_LIMIT_REACHED ? 'timeout' : 'aborted'", "'aborted'"),
  ('timeout told apart by the name TimeoutError', 'apps/web/src/api/apiError.ts', "signal.reason === REQUEST_TIME_LIMIT_REACHED ?", "(signal.reason as Error)?.name === 'TimeoutError' ?"),
]
def run_tests():
    out = pathlib.Path(sys.argv[1])
    subprocess.run(['pnpm','--filter','./apps/web','exec','vitest','run','src/api','src/home/HomeScreen.test.tsx','--reporter=json',f'--outputFile={out}'],cwd=REPO,capture_output=True,text=True)
    return json.loads(out.read_text())
for name, file, old, new in MUTATIONS:
    path = REPO/file
    original = path.read_text()
    assert original.count(old)==1, name
    path.write_text(original.replace(old,new))
    try:
        report = run_tests()
    finally:
        path.write_text(original)
    failed = [a for t in report['testResults'] for a in t['assertionResults'] if a['status']=='failed']
    print(f"\n== {name}: {len(failed)} failed of {report['numTotalTests']}")
    for test in failed:
        message = (test.get('failureMessages') or [''])[0].split('\n')[0]
        print(f"  - {test['title']}\n      {message[:170]}")
