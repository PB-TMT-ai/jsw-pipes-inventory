import sys
def page(title, body, script, extra_head=''):
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="shared.css">{extra_head}
</head><body>
{body}
<script src="core.js"></script>
<script src="week.js"></script>
<script>
{script}
</script>
</body></html>
'''
for name in sys.argv[1:]:
    src=open(f'src/{name}.html').read()
    title=src.split('\n',1)[0].strip()
    rest=src.split('\n',1)[1]
    body,script=rest.split('<!--SCRIPT-->')
    extra=''
    if '<!--STYLE-->' in body:
        st,body=body.split('<!--STYLE-->')
        extra='\n<style>'+st+'</style>'
    open(f'{name}.html','w').write(page(title,body,script,extra))
    print('built',name)
