import json,re,sys
def load(path):
    t=json.load(open(path))['result']
    a=t.index('\n[{'); b=t.rindex('}]')+2
    rows=json.loads(t[a:b])
    if len(rows)==1 and 'j' in rows[0]: rows=json.loads(rows[0]['j'])
    return rows
