import sys, json, re
src, dst = sys.argv[1], sys.argv[2]
t = open(src).read()
# file may be JSON wrapper {"result": "..."} or a list of content blocks
try:
    o = json.loads(t)
    if isinstance(o, list): t = ''.join(b.get('text','') for b in o)
    elif isinstance(o, dict): t = o.get('result', t)
except Exception: pass
m = re.search(r'<untrusted-data-[0-9a-f-]+>\s*(\[.*\])\s*</untrusted-data-', t, re.S)
s = m.group(1)
data = json.loads(s)
json.dump(data, open(dst,'w'))
print(len(data), 'rows ->', dst)
