import subprocess,json,time,pathlib,sys
root=pathlib.Path('/private/tmp/kd-review49-benefit-audit-20260917')
ev=pathlib.Path(__file__).parent
results=[]
for script in sys.argv[1:]:
 t=time.monotonic()
 r=subprocess.run(['node',script],cwd=root,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=120)
 (ev/(pathlib.Path(script).stem+'.log')).write_text(r.stdout)
 rec={'script':script,'exit':r.returncode,'seconds':round(time.monotonic()-t,2)}
 results.append(rec);print(json.dumps(rec),flush=True)
(ev/('runs-'+str(time.time_ns())+'.json')).write_text(json.dumps(results,indent=2))
