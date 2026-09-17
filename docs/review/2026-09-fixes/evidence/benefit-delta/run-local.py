import pathlib,subprocess,json,time,sys
root=pathlib.Path('/private/tmp/kd-review49-benefit-audit-20260917')
out=pathlib.Path(__file__).parent
results=[]
for script in sys.argv[1:]:
    t=time.monotonic()
    r=subprocess.run(['node',script],cwd=root,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=150)
    (out/(pathlib.Path(script).stem+'.log')).write_text(r.stdout)
    item={'script':script,'exit':r.returncode,'seconds':round(time.monotonic()-t,2)}
    results.append(item);print(json.dumps(item),flush=True)
(out/('runs-'+str(time.time_ns())+'.json')).write_text(json.dumps(results,indent=2)+'\n')
