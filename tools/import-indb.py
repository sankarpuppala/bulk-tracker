"""Builds data/india-foods.json from the Indian Nutrient Databank (INDB).

    python tools/import-indb.py <folder with INDB.xlsx, recipes.xlsx, recipes_servingsize.xlsx> [out.json]
    Source: https://github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-
    Paper:  Vijayakumar, Dubasi, Awasthi & Jaacks, Current Developments in Nutrition (2024), CC BY 4.0.

About 1,000 cooked Indian recipes (tea to biryani) with energy, macros, fibre, free sugar, sodium,
saturated fat, iron, calcium and vitamin D per 100 g and per serving. The recipe ingredient lists
decide the veg / egg / non-veg tag, allergens and vegan / Jain tags: nothing is guessed from the name.
INDB has no vitamin B12 column, so B12 is left empty. Standard library only (see tools/xlsx.py).
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
from xlsx import read_rows  # noqa: E402

src = sys.argv[1] if len(sys.argv) > 1 else None
out = sys.argv[2] if len(sys.argv) > 2 else 'data/india-foods.json'
if not src:
    sys.exit('usage: python tools/import-indb.py <INDB folder> [out.json]')

MEAT = re.compile(r'\b(jhinga|salami|pepperoni|machli|machhi|murg|murgh|gosht|kheema|chicken|mutton|goat|lamb|beef|pork|meat|fish|prawn|shrimp|crab|lobster|squid|liver|kidney(?! bean)|brain|mince|keema|sardine|mackerel|pomfret|rohu|hilsa|catla|seer|tuna|salmon|anchov|bombay duck|ham|bacon|sausage|gelatin|duck|turkey|quail|clam|mussel|oyster)\b', re.I)
EGG = re.compile(r'\b(egg|eggs|anda|ande|omelette|omelet)\b', re.I)
ALLERGENS = {
    'peanut': re.compile(r'\b(groundnut|peanut)', re.I),
    'treenut': re.compile(r'\b(almond|cashew|walnut|pistachio|hazelnut|chironji|pecan)', re.I),
    'lactose': re.compile(r'\b(milk|curd|yoghurt|yogurt|butter|ghee|paneer|cheese|cream|khoa|khoya|whey|lassi|buttermilk|condensed)\b', re.I),
    'gluten': re.compile(r'\b(wheat|maida|atta|semolina|rava|suji|sooji|bread|barley|rye|vermicelli|noodle|pasta|refined flour|biscuit)', re.I),
    'egg': EGG,
    'soy': re.compile(r'\b(soya|soy|soybean|tofu)', re.I),
    'shellfish': re.compile(r'\b(fish|prawn|shrimp|crab|lobster|squid|clam|mussel|oyster|sardine|mackerel|pomfret|rohu|hilsa|tuna|salmon|anchov)', re.I),
    'sesame': re.compile(r'\b(sesame|gingelly|til)\b', re.I),
}
ANIMAL = re.compile(r'\b(milk|curd|yoghurt|yogurt|butter|ghee|paneer|cheese|cream|khoa|khoya|whey|honey|lassi|buttermilk|condensed)\b', re.I)
NOT_BUTTER = re.compile(r'\b(peanut butter|cocoa butter|butter beans?)\b', re.I)
FAT_OK = re.compile(r'\b(ghee|butter|oil|mayonnaise|dressing|chocolate|almond|cashew|walnut|peanut|groundnut|sesame|til|chikki)\b', re.I)
ROOT = re.compile(r'\b(onion|garlic|potato|carrot|beet|beetroot|radish|ginger|sweet potato|yam|colocasia|arbi|turnip|leek|shallot|spring onion|elephant foot)\b', re.I)


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def r1(v):
    return None if v is None else round(v, 1)


ingredients = {}
for row in read_rows(os.path.join(src, 'recipes.xlsx'))[1:]:
    code = row[1]
    name = ' '.join(str(x) for x in (row[4], row[10]) if x)
    ingredients.setdefault(code, []).append(name)

units = {}
for row in read_rows(os.path.join(src, 'recipes_servingsize.xlsx'))[1:]:
    units[row[1]] = (row[10] or 'serving', num(row[8]) or 1)

rows = read_rows(os.path.join(src, 'INDB.xlsx'))
head = rows[0]
col = {h: i for i, h in enumerate(head)}
out_rows = []
skipped = 0
dropped = {'frying oil counted in full': [], 'energy does not match macros': []}
for r in rows[1:]:
    g = lambda k: num(r[col[k]]) if col.get(k) is not None and col[k] < len(r) else None  # noqa: E731
    code, name = r[col['food_code']], str(r[col['food_name']]).strip()
    kcal, p, c, f = g('energy_kcal'), g('protein_g'), g('carb_g'), g('fat_g')
    if None in (kcal, p, c, f) or kcal <= 0:
        skipped += 1
        continue
    # plausibility: INDB counts all deep-frying oil as eaten (boondi raita at 74 g fat / 100 g),
    # and some soups' energy doesn't match their macros. Drop those rather than ship wrong numbers.
    if f > 35 and not FAT_OK.search(name):
        dropped['frying oil counted in full'].append(name)
        continue
    if kcal > 20 and abs(4 * p + 4 * c + 9 * f - kcal) > 0.15 * kcal:
        dropped['energy does not match macros'].append(name)
        continue
    ings = ingredients.get(code, [])
    text = ' | '.join(ings)
    animal_text = NOT_BUTTER.sub(' ', text)
    # ingredients decide; the dish name can only make it stricter (a prawn curry whose prawns are listed as 'jhinga')
    diet = 'n' if MEAT.search(text) or MEAT.search(name) else 'e' if EGG.search(text) or EGG.search(name) else 'v'
    al = sorted(a for a, rx in ALLERGENS.items() if rx.search(animal_text if a == 'lactose' else text))
    tags = []
    if diet == 'v' and not ANIMAL.search(animal_text):
        tags.append('vegan')
    if diet == 'v' and not ROOT.search(text):
        tags.append('jain')
    # one serving in grams, from the per-serving and per-100 g energy
    serve_kcal = g('unit_serving_energy_kcal')
    unit = str(r[col['servings_unit']] or units.get(code, ('serving', 1))[0]).strip()
    portions = []
    if serve_kcal and kcal:
        grams = round(serve_kcal / kcal * 100, 1)
        if 5 <= grams <= 2000:
            portions.append(['1 ' + unit, grams])
    sat = g('sfa_mg')
    out_rows.append([code, name, 0, diet, round(kcal), r1(p), r1(c), r1(f), r1(g('fibre_g')), r1(g('freesugar_g')),
                     None if g('sodium_mg') is None else round(g('sodium_mg')), None if sat is None else r1(sat / 1000),
                     r1(g('iron_mg')), None, None if g('calcium_mg') is None else round(g('calcium_mg')), None, portions, al, tags])

out_rows.sort(key=lambda x: x[1].lower())
doc = {
    'v': 1,
    'source': 'Indian Nutrient Databank (INDB), Vijayakumar, Dubasi, Awasthi & Jaacks 2024',
    'license': 'Published open access (CC BY 4.0 paper); data from https://github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB- . Attribution required.',
    'note': 'Values per 100 g of the cooked recipe. Diet, allergens and vegan/Jain tags come from each recipe\'s ingredient list. No vitamin B12 data.',
    'cols': ['id', 'name', 'group', 'diet', 'kcal', 'p', 'c', 'f', 'fib', 'sug', 'na', 'sat', 'fe', 'b12', 'ca', 'd', 'portions', 'al', 'tags'],
    'groups': ['Indian recipes'],
    'rows': out_rows,
}
with open(out, 'w', encoding='utf8') as fh:
    json.dump(doc, fh, ensure_ascii=False, separators=(',', ':'))
print(f'{len(out_rows)} recipes written to {out} ({os.path.getsize(out) // 1024} KB), {skipped} skipped')
for k, v in dropped.items():
    print(f'  dropped {len(v)}: {k} (e.g. {", ".join(v[:4])})')
