"""Stream processed trials through the dashboard's existing JS signal definitions."""
from pathlib import Path
import sys,json,subprocess,os
LIVE=Path('/Volumes/Elements/biomech/dashboard')
sys.path.insert(0,str(LIVE))
from data_store import DataStore,TABLES,EVENT_LABELS,_read_signal,_clean_row
source=Path(__file__).resolve().parent
store=DataStore()
proc=subprocess.Popen(['node','--max-old-space-size=2048',str(source/'build_cohorts.mjs'),str(source/'data')],stdin=subprocess.PIPE,text=True)
try:
 for record in store.entries.values():
  entry=record['public']
  if not entry.get('has_processed'):continue
  kind=entry['discipline'];key=entry['processed_key']
  signals={name:data for name in TABLES[kind] if (data:=_read_signal(kind,name,key,store.index)) is not None}
  events={}
  for data in signals.values():
   for column,label in EVENT_LABELS.items():
    if column in data['series'] and column not in events:
     value=next((v for v in data['series'][column] if v is not None),None)
     if value is not None:events[column]={'label':label,'time':value}
  trial={'entry':entry,'metadata':_clean_row(store.metadata[kind].get(key)),'poi':_clean_row(store.poi[kind].get(key)),'events':events,'signals':signals,'motion':None,'duration':max(max(g['time'],default=0) for g in signals.values())}
  proc.stdin.write(json.dumps(trial,separators=(',',':'),allow_nan=False)+'\n')
finally:proc.stdin.close()
raise SystemExit(proc.wait())
