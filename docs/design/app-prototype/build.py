import base64, json, sys
from pathlib import Path
folder = Path(sys.argv[1])
def uri(path):
    return 'data:image/jpeg;base64,' + base64.b64encode(path.read_bytes()).decode()
images = {name: {'thumb': uri(folder / 'img' / f'{name}-thumb.jpg'), 'board': uri(folder / 'img' / f'{name}-board.jpg')} for name in ['wave', 'saturn', 'athens']}
template = (folder / 'template.html').read_text()
assert template.count('__IMAGES__') == 1
page = template.replace('__IMAGES__', json.dumps(images))
(folder / 'astra-app.html').write_text(page)
(folder / 'preview.html').write_text('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}</style></head><body>' + page + '</body></html>')
print('built', len(page))
