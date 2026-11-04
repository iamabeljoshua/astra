#!/usr/bin/env python3
import os, resource, subprocess, sys, time
name, cmd = sys.argv[1], sys.argv[2:]
os.makedirs('/tmp/probe', exist_ok=True)
start = time.time()
with open(f'/tmp/probe/{name}.log', 'wb') as out:
    code = subprocess.call(cmd, stdout=out, stderr=subprocess.STDOUT)
wall = time.time() - start
r = resource.getrusage(resource.RUSAGE_CHILDREN)
print(f'PROBE\t{name}\trc={code}\twall={wall:.1f}\tcpu={r.ru_utime + r.ru_stime:.1f}\tuser={r.ru_utime:.1f}\tsys={r.ru_stime:.1f}\trssMB={r.ru_maxrss / 1024:.0f}', flush=True)
