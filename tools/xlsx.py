"""Read the first worksheet of an .xlsx file with the standard library only (no openpyxl).

    from xlsx import read_rows
    rows = read_rows('INDB.xlsx')      # list of lists, header first; numbers as float, text as str
"""
import re
import zipfile
import xml.etree.ElementTree as ET

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def _col(ref):
    n = 0
    for ch in re.match(r'[A-Z]+', ref).group(0):
        n = n * 26 + ord(ch) - 64
    return n - 1


def read_rows(path, sheet=1):
    z = zipfile.ZipFile(path)
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS):
            shared.append(''.join(t.text or '' for t in si.iter('{%s}t' % NS['m'])))
    root = ET.fromstring(z.read('xl/worksheets/sheet%d.xml' % sheet))
    out = []
    for row in root.iter('{%s}row' % NS['m']):
        cells = {}
        for c in row.findall('m:c', NS):
            v = c.find('m:v', NS)
            t = c.get('t')
            if t == 'inlineStr':
                val = ''.join(x.text or '' for x in c.iter('{%s}t' % NS['m']))
            elif v is None:
                val = None
            elif t == 's':
                val = shared[int(v.text)]
            elif t in ('str', 'e'):
                val = v.text
            elif t == 'b':
                val = v.text == '1'
            else:
                try:
                    val = float(v.text)
                except ValueError:
                    val = v.text
            cells[_col(c.get('r'))] = val
        if cells:
            out.append([cells.get(i) for i in range(max(cells) + 1)])
    return out
