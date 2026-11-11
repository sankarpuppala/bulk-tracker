"""Builds data/ifct-foods.json from IFCT 2017 — India's official food composition tables.

    npm pack @ifct2017/compositions && tar xzf ifct2017-compositions-*.tgz
    python tools/import-ifct.py package/index.csv data/ifct-foods.json

Source: Longvah, Ananthan, Bhaskarachary & Venkaiah (2017), *Indian Food Composition Tables*,
National Institute of Nutrition, ICMR, Hyderabad — packaged as @ifct2017/compositions (MIT)
by Subhajit Sahu. 542 foods analysed across Indian regions.

Why this one matters most of the three imports:
  * the **food group is authoritative**, so veg / egg / non-veg is read, never guessed;
  * every row carries **local names in ~16 Indian languages** (H. Bajra, Kan. Sajje, Ta. Kambu),
    which become search aliases — typing "sajje" or "kambu" finds pearl millet;
  * full micronutrients (iron, calcium, B12, vitamin D, zinc) measured in Indian conditions,
    which the micronutrient watch needs and USDA cannot speak for.

Units: the package stores energy in kJ and every mineral in grams (spinach = 0.00295 g iron),
so this converts to the kcal / mg / microgram the app uses. IFCT has no vitamin B12 column
(only cobalt), so B12 is left empty for these foods; the USDA set covers it. Standard library only.
"""
import csv
import json
import os
import re
import sys

src = sys.argv[1] if len(sys.argv) > 1 else None
out = sys.argv[2] if len(sys.argv) > 2 else 'data/ifct-foods.json'
if not src:
    sys.exit(__doc__)

KJ_PER_KCAL = 4.184

# "Food Name; name" -> short key
def col(rows, key):
    for c in rows[0].keys():
        if c.endswith('; ' + key):
            return c
    return None


# the food group decides the diet tag; nothing here is inferred from a name
# vitamin D is only credible for animal foods; IFCT reports non-zero D for leaves, which no
# plant actually provides, so it is dropped for everything else rather than shown as fact
VITD_GROUPS = {'Animal Meat', 'Poultry', 'Marine Fish', 'Fresh Water Fish and Shellfish', 'Marine Shellfish', 'Marine Mollusks', 'Egg and Egg Products', 'Milk and Milk Products'}
NONVEG_GROUPS = {'Animal Meat', 'Poultry', 'Marine Fish', 'Fresh Water Fish and Shellfish', 'Marine Shellfish', 'Marine Mollusks'}
EGG_GROUPS = {'Egg and Egg Products'}

# language prefixes used by IFCT's local-name column
LANG = re.compile(r'^(A|B|E|G|H|Kan|Kash|Kh|Mal|M|Mar|N|O|P|S|Ta|Te|U|Tel|Tam|Guj|Ben|Hin|Ori|Pun|Urd|San|Kon|Nep|Mani|Miz|Ass)\.?$', re.I)
BAD_ALIAS = re.compile(r'^(do|same|as above|\-|–|n/?a)$', re.I)

ALLERGENS = [
    ('peanut', re.compile(r'groundnut|peanut', re.I)),
    ('treenut', re.compile(r'almond|cashew|walnut|pistachio|hazelnut|pine nut|chironji', re.I)),
    ('lactose', re.compile(r'milk|curd|paneer|cheese|butter|ghee|khoa|whey|cream', re.I)),
    ('gluten', re.compile(r'wheat|barley|rye|semolina|vermicelli|maida', re.I)),
    ('egg', re.compile(r'\begg', re.I)),
    ('soy', re.compile(r'soya|soybean|\bsoy\b|tofu', re.I)),
    ('shellfish', re.compile(r'fish|prawn|shrimp|crab|lobster|clam|mussel|oyster|squid', re.I)),
    ('sesame', re.compile(r'sesame|gingelly', re.I)),
]


def num(v):
    try:
        f = float(str(v).strip())
        return f if f == f else None
    except (TypeError, ValueError):
        return None


def r1(v, nd=1):
    return None if v is None else round(v, nd)


def mg(v, nd=1):
    """grams -> milligrams."""
    if v is None:
        return None
    x = round(v * 1000, nd)
    return int(x) if nd == 0 else x


def ug(v, nd=2):
    """grams -> micrograms."""
    return None if v is None else round(v * 1e6, nd)


def aliases(local, name):
    """"A. Moricha guti; H. Ramdana; Kan. Danthu beeja" -> ['Moricha guti', 'Ramdana', ...]"""
    out = []
    for part in re.split(r'[;|]', local or ''):
        part = part.strip()
        if not part:
            continue
        # strip one or more leading language codes: "A., Kash. Baajra"
        while True:
            m = re.match(r'^([A-Za-z]{1,4})\.\s*,?\s*', part)
            if not m or not LANG.match(m.group(1)):
                break
            part = part[m.end():]
        for alt in part.split(','):
            alt = alt.strip(' .')
            if len(alt) >= 3 and not BAD_ALIAS.match(alt) and alt.lower() != (name or '').lower():
                out.append(alt)
    seen, uniq = set(), []
    for a in out:
        if a.lower() not in seen:
            seen.add(a.lower())
            uniq.append(a)
    return uniq[:12]


def main():
    rows = list(csv.DictReader(open(src, encoding='utf8')))
    if not rows:
        sys.exit('no rows in ' + src)
    C = {k: col(rows, k) for k in ('code', 'name', 'lang', 'grup', 'enerc', 'protcnt', 'choavldf', 'fatce',
                                   'fibtg', 'fsugar', 'na', 'fasat', 'fe', 'vitb12', 'ca', 'vitd', 'zn')}
    missing = [k for k, v in C.items() if v is None and k not in ('vitb12', 'zn', 'vitd', 'fasat', 'fsugar')]
    if missing:
        sys.exit('columns not found: ' + ', '.join(missing))

    groups, out_rows, skipped, bad_energy = [], [], 0, []
    for r in rows:
        g = lambda k: (num(r.get(C[k])) if C.get(k) else None)  # noqa: E731
        name = (r.get(C['name']) or '').strip()
        kj = g('enerc')
        p, c, f = g('protcnt'), g('choavldf'), g('fatce')
        if not name or kj is None or None in (p, c, f):
            skipped += 1
            continue
        kcal = kj / KJ_PER_KCAL
        if kcal <= 0 or kcal > 950:
            skipped += 1
            continue
        # a few source rows state an energy their own macros cannot reach (chicken leg: 384 kcal
        # from 19 g protein and 13 g fat). Fibre adds about 2 kcal/g, so allow for that and drop
        # the rest rather than ship a calorie figure that is plainly wrong.
        fib = g('fibtg') or 0
        from_macros = 4 * p + 4 * c + 9 * f + 2 * fib
        if from_macros > 0 and kcal > 1.25 * from_macros:
            bad_energy.append(f'{name} ({round(kcal)} vs {round(from_macros)} kcal)')
            skipped += 1
            continue
        grup = (r.get(C['grup']) or '').strip()
        if grup not in groups:
            groups.append(grup)
        diet = 'n' if grup in NONVEG_GROUPS else 'e' if grup in EGG_GROUPS else 'v'
        alias = aliases(r.get(C['lang']), name)
        hay = name + ' ' + ' '.join(alias)
        al = sorted({a for a, rx in ALLERGENS if rx.search(hay)})
        if diet == 'n' and 'shellfish' not in al and re.search(r'fish|prawn|crab|shellfish|mollus', grup, re.I):
            al.append('shellfish')
        tags = []
        if diet == 'v' and grup not in ('Milk and Milk Products',) and 'lactose' not in al:
            tags.append('vegan')
        out_rows.append([
            (r.get(C['code']) or name)[:12], name, groups.index(grup), diet,
            round(kcal), r1(p), r1(c), r1(f),
            r1(g('fibtg')), r1(g('fsugar')), mg(g('na'), 0), r1(g('fasat')),
            mg(g('fe'), 2), None, mg(g('ca'), 0), ug(g('vitd'), 2) if grup in VITD_GROUPS else None,
            [['100 g', 100]], sorted(set(al)), tags, alias,
        ])

    out_rows.sort(key=lambda x: x[1].lower())
    doc = {
        'v': 1,
        'source': 'IFCT 2017 — Indian Food Composition Tables, NIN/ICMR (via @ifct2017/compositions, MIT)',
        'license': 'Data from ICMR-NIN IFCT 2017; packaging MIT (c) Subhajit Sahu. Cite Longvah et al. 2017.',
        'note': 'Raw and basic Indian foods, per 100 g edible portion, measured across Indian regions. Diet tags come from the official food group. `alias` holds local names in Indian languages, which search uses.',
        'cols': ['id', 'name', 'group', 'diet', 'kcal', 'p', 'c', 'f', 'fib', 'sug', 'na', 'sat', 'fe', 'b12', 'ca', 'd', 'portions', 'al', 'tags', 'alias'],
        'groups': groups,
        'rows': out_rows,
    }
    with open(out, 'w', encoding='utf8') as fh:
        json.dump(doc, fh, ensure_ascii=False, separators=(',', ':'))
    withalias = sum(1 for r in out_rows if r[19])
    print(f'{len(out_rows)} IFCT foods written to {out} ({os.path.getsize(out)//1024} KB), {skipped} skipped')
    print(f'  {withalias} carry local names; groups: {len(groups)}')
    if bad_energy:
        print(f'  dropped {len(bad_energy)} whose stated energy its macros cannot reach: ' + '; '.join(bad_energy[:6]))


if __name__ == '__main__':
    main()
