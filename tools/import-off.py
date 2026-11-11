"""Builds data/packaged-foods.json from the Open Food Facts CSV export (ODbL).

    python tools/import-off.py                     # streams the dump, keeps India-sold products
    python tools/import-off.py --file dump.csv.gz  # or use a copy you already downloaded
    python tools/import-off.py --out data/packaged-foods.json --limit 20000

The export is ~1.5 GB gzipped, so it is streamed and filtered line by line and never stored.
Kept: products tagged as sold in India that have a name, energy, all three macros, and enough
evidence to state veg / non-veg — an ingredient list or an explicit vegetarian label. These are
the packs students actually buy (Lay's, Haldiram's, Parle, Britannia, Amul, Maggi), which neither
IFCT nor USDA covers, and each keeps its barcode so the scanner works offline.

Matching on brand name alone was tried and dropped: it pulled in a Croatian "Bingo" and an
American juice called "Yoga", and a wrong brand guess is worse than a missing product.

Open Food Facts data is crowd-sourced, so values are only as good as the pack someone photographed:
entries whose macros cannot add up to their stated energy are dropped, and a `src` tag marks
the rest so the app can show where a number came from.

Output: the same compact shape as data/world-foods.json (see js/fooddb.js).
Licence: Open Database License (ODbL) 1.0 — https://opendatacommons.org/licenses/odbl/1-0/
Attribution and share-alike are required; the app credits Open Food Facts on every such food.
"""
import argparse
import gzip
import io
import json
import os
import re
import subprocess
import sys

URL = 'https://openfoodfacts-ds.s3.eu-west-3.amazonaws.com/en.openfoodfacts.org.products.csv.gz'

COL = {
    'code': 0, 'name': 10, 'brands': 18, 'quantity': 13, 'categories': 22, 'labels': 30,
    'countries': 40, 'ingredients': 42, 'allergens': 46, 'traces': 49,
    'serving_size': 50, 'serving_quantity': 51, 'nova': 59,
    'kcal': 89, 'fat': 92, 'sat': 93, 'carbs': 129, 'sugars': 130,
    'fiber': 146, 'proteins': 150, 'salt': 154, 'sodium': 156, 'calcium': 177, 'iron': 179,
}
NEED = max(COL.values()) + 1

# Indian brands worth keeping even when the countries field is empty or wrong
INDIAN_BRANDS = re.compile(r'\b(haldiram|britannia|parle|amul|mother dairy|nestle india|maggi|bingo|kurkure|lays|lay-s|uncle chipps|balaji|too yumm|cornitos|act ii|mtr|gits|everest|mdh|catch|tata|aashirvaad|fortune|saffola|patanjali|dabur|himalaya|paper boat|frooti|appy|thums up|limca|maaza|slice|sting|bisleri|kinley|real|tropicana|epigamia|go cheese|verka|nandini|heritage|dodla|vadilal|kwality|cremica|sunfeast|dark fantasy|bourbon|hide & seek|hide and seek|monaco|krackjack|marie gold|good day|nutrichoice|milk bikis|jim jam|little hearts|unibic|anmol|priyagold|ramdev|24 mantra|organic india|yoga ?bar|ritebite|max protein|the whole truth|muscleblaze|optimum nutrition|bigmuscles|as-it-is|nutrabay|avvatar|prolite|horlicks|boost|bournvita|complan|pediasure|protinex|ensure|cadbury|ferrero|mondelez|perfetti|alpenliebe|center fresh|happydent|mentos|chupa chups|pulse|parle agro|dukes|karachi bakery|bikanervala|bikaji|lehar|peppy|diamond|garden|chitale|lijjat|id fresh|iD |eastern|melam|nirapara|double horse|brahmins|pillsbury|annapurna|rajdhani|tata sampann|24 ?mantra)\b', re.I)

# obvious junk names in the crowd-sourced data
BAD_NAME = re.compile(r'^(test|xxx+|aaa+|\?+|n/?a|unknown|produit|product)$', re.I)
UNIT_IN_NAME = re.compile(r'^\s*[\d.,]+\s*(g|kg|ml|l|oz)\s*$', re.I)

ALLERGEN_MAP = [
    ('peanut', re.compile(r'peanut|groundnut', re.I)),
    ('treenut', re.compile(r'\bnuts?\b|almond|cashew|walnut|pistachio|hazelnut|pecan', re.I)),
    ('lactose', re.compile(r'milk|lactose|dairy|cheese|butter|cream|whey|casein', re.I)),
    ('gluten', re.compile(r'gluten|wheat|barley|rye|oats|maida|atta', re.I)),
    ('egg', re.compile(r'\begg', re.I)),
    ('soy', re.compile(r'\bsoy|soja', re.I)),
    ('shellfish', re.compile(r'fish|shellfish|crustacean|prawn|shrimp|crab|mollusc', re.I)),
    ('sesame', re.compile(r'sesame|gingelly|\btil\b', re.I)),
]
# the FSSAI green dot is not in the data, so diet comes from the ingredients
MEAT = re.compile(r'\b(chicken|mutton|beef|pork|lamb|turkey|duck|fish|tuna|salmon|prawn|shrimp|crab|anchov|gelatin(e)?|lard|tallow|meat extract|bacon|ham|sausage|pepperoni|squid|oyster|mussel)\b', re.I)
EGG_ING = re.compile(r'\begg\b|albumen|egg white|egg powder', re.I)
VEG_LABEL = re.compile(r'\b(vegan|vegetarian|veg)\b', re.I)


def num(v):
    try:
        f = float(v)
        return f if f == f and abs(f) != float('inf') else None
    except (TypeError, ValueError):
        return None


def r1(v):
    return None if v is None else round(v, 1)


def clean_name(name, brands):
    n = re.sub(r'\s+', ' ', (name or '').strip())
    n = re.sub(r'\d{8,14}', ' ', n)                       # barcodes typed into the name field
    n = re.sub(r'^\s*[\d.,]+\s*(rs|rupees?|g|gm|kg|ml|l|%)?\s*[-:·|]?\s*', '', n, flags=re.I)   # "20rs ...", "137 ..."
    n = re.sub(r'\s+', ' ', n).strip(' -,·|')
    b = (brands or '').split(',')[0].strip()
    key = lambda s: re.sub(r'[^a-z0-9]', '', (s or '').lower())  # noqa: E731
    if re.fullmatch(r'[\d\s.,]+', b or ''):
        b = ''                                                  # a purely numeric "brand" is junk data
    bk = key(b)
    if bk:
        # "Haldiram Haldiram Bhujia" -> "Haldiram Bhujia": drop a repeat of the brand at the front
        words = n.split()
        while len(words) > 1 and key(words[0]) and bk.startswith(key(words[0])) and key(' '.join(words[:2])).startswith(bk) and key(words[1]) and bk.startswith(key(words[1])):
            words.pop(0)
        n = ' '.join(words)
    if not n or (bk and key(n) == bk):
        return ''                                               # just the brand: no product to name
    if b and not key(n).startswith(bk) and bk not in key(n):
        n = f'{b} {n}'
    return n[:70] if re.search(r'[A-Za-z]{3}', n) else ''


def diet_of(row):
    ing = row[COL['ingredients']] or ''
    labels = row[COL['labels']] or ''
    cats = row[COL['categories']] or ''
    if MEAT.search(ing) or MEAT.search(cats):
        return 'n'
    if EGG_ING.search(ing):
        return 'e'
    if VEG_LABEL.search(labels) or 'en:vegan' in labels:
        return 'v'
    return 'v'      # reached only when an ingredient list or a veg label exists (see rows_from)


def allergens_of(row):
    text = ' '.join([row[COL['allergens']] or '', row[COL['traces']] or '', row[COL['ingredients']] or ''])
    return sorted({k for k, rx in ALLERGEN_MAP if rx.search(text)})


def portions(row, name):
    out = []
    sq = num(row[COL['serving_quantity']])
    ss = (row[COL['serving_size']] or '').strip()[:28]
    if sq and 1 <= sq <= 1500:
        out.append([f'1 serving ({ss})' if ss else '1 serving', round(sq, 1)])
    q = (row[COL['quantity']] or '').strip()
    m = re.match(r'^\s*([\d.,]+)\s*(g|ml|kg|l)\b', q, re.I)
    if m:
        v = num(m.group(1).replace(',', '.'))
        if v:
            unit = m.group(2).lower()
            grams = v * (1000 if unit in ('kg', 'l') else 1)
            if 5 <= grams <= 2000 and not any(abs(grams - p[1]) < 1 for p in out):
                out.append([f'Whole pack ({q[:18]})', round(grams, 1)])
    return out[:2]


def rows_from(stream, limit=0, report=None):
    kept, seen_names, scanned = [], set(), 0
    dropped = {'no_macros': 0, 'energy_mismatch': 0, 'bad_name': 0, 'duplicate': 0, 'not_india': 0, 'diet_unknown': 0}
    header = stream.readline()
    if not header:
        return kept, scanned, dropped
    for line in stream:
        scanned += 1
        if report and scanned % 200000 == 0:
            report(scanned, len(kept))
        row = line.rstrip('\n').split('\t')
        if len(row) < NEED:
            continue
        countries = row[COL['countries']] or ''
        brands = row[COL['brands']] or ''
        if 'en:india' not in countries:
            dropped['not_india'] += 1
            continue
        name = clean_name(row[COL['name']], brands)
        if len(name) < 4 or BAD_NAME.match(name) or UNIT_IN_NAME.match(name):
            dropped['bad_name'] += 1
            continue
        kcal, p, c, f = (num(row[COL[k]]) for k in ('kcal', 'proteins', 'carbs', 'fat'))
        if None in (kcal, p, c, f) or kcal <= 0 or kcal > 950:
            dropped['no_macros'] += 1
            continue
        if min(p, c, f) < 0 or p + c + f > 101:
            dropped['no_macros'] += 1
            continue
        if abs(4 * p + 4 * c + 9 * f - kcal) > 0.25 * kcal + 25:
            dropped['energy_mismatch'] += 1
            continue
        # a veg/non-veg claim needs evidence: an ingredient list, or the pack's own label
        if not (row[COL['ingredients']] or '').strip() and not VEG_LABEL.search(row[COL['labels']] or ''):
            dropped['diet_unknown'] += 1
            continue
        key = name.lower()
        if key in seen_names:
            dropped['duplicate'] += 1
            continue
        seen_names.add(key)
        sodium = num(row[COL['sodium']])
        if sodium is None:
            salt = num(row[COL['salt']])
            sodium = salt * 400 if salt is not None else None       # salt g -> sodium mg
        else:
            sodium = sodium * 1000                                  # OFF stores sodium in g
        iron, calcium = num(row[COL['iron']]), num(row[COL['calcium']])
        kept.append([
            row[COL['code']][:20], name, 0, diet_of(row), round(kcal), r1(p), r1(c), r1(f),
            r1(num(row[COL['fiber']])), r1(num(row[COL['sugars']])),
            None if sodium is None else round(sodium), r1(num(row[COL['sat']])),
            None if iron is None else r1(iron * 1000),              # g -> mg
            None,                                                   # no B12 in the export
            None if calcium is None else round(calcium * 1000),     # g -> mg
            None,
            portions(row, name), allergens_of(row), [],
        ])
        if limit and len(kept) >= limit:
            break
    return kept, scanned, dropped


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--file', help='a downloaded en.openfoodfacts.org.products.csv.gz; omit to stream from the web')
    ap.add_argument('--out', default='data/packaged-foods.json')
    ap.add_argument('--limit', type=int, default=0)
    args = ap.parse_args()

    def report(n, k):
        print(f'  scanned {n:,} rows, kept {k:,}', file=sys.stderr, flush=True)

    if args.file:
        with gzip.open(args.file, 'rt', encoding='utf8', errors='replace', newline='') as fh:
            kept, scanned, dropped = rows_from(fh, args.limit, report)
    else:
        print(f'streaming {URL}', file=sys.stderr)
        proc = subprocess.Popen(['curl', '-sL', '--retry', '3', URL], stdout=subprocess.PIPE)
        with gzip.open(proc.stdout, 'rt', encoding='utf8', errors='replace', newline='') as fh:
            kept, scanned, dropped = rows_from(fh, args.limit, report)
        proc.stdout.close()
        proc.terminate()

    kept.sort(key=lambda r: r[1].lower())
    doc = {
        'v': 1,
        'source': 'Open Food Facts (crowd-sourced product database)',
        'license': 'Open Database License (ODbL) 1.0 — https://opendatacommons.org/licenses/odbl/1-0/ . Attribution and share-alike required.',
        'note': 'Packaged food sold in India, per 100 g/ml as printed on the pack. Crowd-sourced: trust the pack over these numbers. Diet tags are read from the ingredient list, so a product with no ingredients listed is only called vegetarian when its category is clearly meat-free.',
        'cols': ['id', 'name', 'group', 'diet', 'kcal', 'p', 'c', 'f', 'fib', 'sug', 'na', 'sat', 'fe', 'b12', 'ca', 'd', 'portions', 'al', 'tags'],
        'groups': ['Packaged (Open Food Facts)'],
        'rows': kept,
    }
    with open(args.out, 'w', encoding='utf8') as fh:
        json.dump(doc, fh, ensure_ascii=False, separators=(',', ':'))
    print(f'{len(kept):,} products written to {args.out} ({os.path.getsize(args.out)//1024} KB) from {scanned:,} scanned')
    print('  dropped: ' + ', '.join(f'{v:,} {k}' for k, v in dropped.items() if v))


if __name__ == '__main__':
    main()
