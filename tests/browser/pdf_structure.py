import sys
from pypdf import PdfReader
r = PdfReader(sys.argv[1])
root = r.trailer['/Root']
tree = root['/StructTreeRoot'].get_object()
doc = tree['/K'].get_object()
order = []
for kid in doc['/K']:
    e = kid.get_object()
    s = e['/S']
    alt = e.get('/Alt')
    order.append(s[1:] + (':ALT' if alt else ''))
print(' '.join(order))
print('LANG', root.get('/Lang'), 'MARKED', root['/MarkInfo']['/Marked'], 'OUTLINES', len(r.outline))
