// =============================================================
// MESS DISH MACROS — per-serving energy and macros for the dishes on
// the campus charts (data/mess-menus.js), and the builder that turns
// the charts into the app's weekly menus.
//
// A serving is what a hostel mess puts on the plate: one katori of dal
// (~150 ml), a ladle of sabzi, 3 idlis, 2 vadas, 3 fulkas, 2 parathas,
// a scoop of rice (~180 g cooked). Values are rounded estimates built
// from IFCT / INDB / USDA composition data and standard Indian recipes.
// They are good enough to plan a plate, not to weigh one: every mess
// cooks differently, and committees can publish corrected numbers.
//
// Rules are tried in order, first match wins, so specific dishes
// ("egg dosa", "paneer biryani") come before generic ones ("dosa",
// "biryani"). "A + B" adds up its parts; "A / B" uses A.
// Pure: no DOM, no network.
// =============================================================
import { round } from '../util.js';

const R = (re, cal, p, c, f) => ({ re, m: { cal, p, c, f } });

export const RULES = [
  // ---- non-veg ----
  R(/egg white/, 110, 12, 6, 4),
  R(/boiled egg/, 156, 12, 1, 10),
  R(/omelet/, 200, 13, 2, 15),
  R(/egg dosa/, 260, 12, 32, 9),
  R(/egg puff/, 300, 10, 26, 17),
  R(/\begg\b/, 200, 13, 6, 14),                                 // egg curry / kosha / roast / masala / tadka / gojju (2 eggs)
  R(/chicken biryani/, 520, 24, 64, 19),
  R(/mutton biryani/, 550, 24, 62, 22),
  R(/chicken tikka/, 250, 30, 5, 12),
  R(/chicken pakoda/, 280, 16, 14, 18),
  R(/chicken momo/, 280, 16, 30, 9),
  R(/chicken butter masala/, 320, 24, 10, 20),
  R(/chicken/, 280, 26, 8, 16),
  R(/mutton/, 320, 25, 6, 22),
  R(/prawn/, 220, 22, 6, 12),
  R(/muri ghonto/, 330, 14, 40, 13),
  R(/fish|rohu|katla|bhetki/, 240, 22, 6, 14),

  // ---- paneer, soya, tofu ----
  R(/paneer biryani/, 440, 14, 58, 17),
  R(/paneer paratha/, 420, 16, 46, 19),
  R(/paneer dosa/, 330, 13, 38, 14),
  R(/paneer pakoda/, 280, 12, 16, 19),
  R(/paneer tikka/, 280, 16, 8, 20),
  R(/palak paneer/, 240, 12, 10, 17),
  R(/mix veg with paneer/, 200, 9, 14, 12),
  R(/paneer/, 280, 14, 10, 20),
  R(/matar tofu|tofu/, 200, 12, 14, 10),
  R(/soya biryani/, 420, 16, 60, 12),
  R(/soya chaap/, 250, 15, 12, 15),
  R(/soya|soyabean/, 200, 17, 14, 8),

  // ---- names that would otherwise hit a broader rule below ----
  R(/halwa|kada prashad/, 280, 4, 36, 13),
  R(/aloo tikki/, 260, 5, 32, 12),
  R(/aloo sandwich/, 260, 7, 38, 9),
  R(/peanut cha+t|masala peanut|roasted peanut/, 220, 10, 14, 15),
  R(/fruit cha+t/, 120, 2, 28, 1),
  R(/momos? chutney|pachadi|pickle|achar/, 30, 0, 2, 3),
  R(/fryums|sandige|potato chips|papad|pappadam/, 60, 2, 7, 3),
  R(/^bhujia$|namkeen/, 160, 4, 14, 10),

  // ---- rice dishes ----
  R(/dum biryani|biryani/, 420, 10, 60, 15),
  R(/curd rice/, 250, 7, 38, 8),
  R(/khichdi/, 300, 10, 46, 8),
  R(/bisibele/, 330, 9, 52, 10),
  R(/ghee rice/, 360, 5, 54, 13),
  R(/fried rice|chef's bath/, 350, 7, 56, 11),
  R(/rice pongal/, 300, 8, 44, 10),
  R(/plain rice|matta rice|^rice$/, 260, 5, 57, 1),
  R(/pulao|pulav|jeera rice|tomato rice|lemon rice|coconut rice|pudina rice|tamarind rice|puliyogare|pulihora|pulikachal|sweet rice|mandi rice|tomato bath|sweet pulao/, 330, 6, 54, 10),

  // ---- breads ----
  R(/aloo paratha/, 400, 9, 56, 16),
  R(/gobi paratha/, 360, 8, 50, 14),
  R(/paratha|parantha|thepla/, 300, 7, 40, 13),
  R(/bhatura|bhature/, 480, 9, 52, 26),
  R(/kochuri|kachori/, 380, 8, 44, 19),
  R(/poori|puri\b|luchi/, 400, 7, 46, 21),
  R(/akki roti/, 280, 5, 52, 6),
  R(/ragi roti|ragi mudde/, 240, 6, 48, 2),
  R(/methi chapathi|methi roti/, 300, 9, 48, 8),
  R(/batti/, 330, 8, 48, 12),
  R(/chapati|chapathi|fulka|roti|ruti/, 270, 9, 48, 5),
  R(/garlic bread/, 300, 7, 38, 13),
  R(/bread/, 150, 5, 28, 2),
  R(/^jam$/, 50, 0, 13, 0),
  R(/rusk/, 120, 3, 22, 2),

  // ---- South Indian tiffin ----
  R(/idl[iy]/, 180, 6, 36, 1),
  R(/dahi vada/, 240, 9, 28, 10),
  R(/vada pav/, 300, 6, 40, 13),
  R(/vada|vadai/, 280, 8, 24, 17),
  R(/masala dosa|aloo dosa/, 330, 7, 50, 12),
  R(/ghee dosa/, 300, 5, 40, 13),
  R(/wheat dosa/, 220, 6, 38, 5),
  R(/ut+h?ap+am/, 270, 7, 44, 7),
  R(/\bdosa\b/, 240, 5, 40, 7),
  R(/appam/, 240, 4, 48, 3),
  R(/pongal/, 300, 8, 42, 11),
  R(/upma/, 250, 6, 38, 8),
  R(/poha|avalakki/, 250, 5, 42, 7),
  R(/paddu/, 220, 5, 34, 7),
  R(/uggani|mandakki/, 250, 5, 40, 8),
  R(/bonda|bajji/, 250, 5, 28, 13),
  R(/chila/, 240, 12, 26, 9),
  R(/dalia/, 180, 6, 32, 3),
  R(/muesli/, 200, 6, 34, 5),
  R(/cornflakes/, 200, 7, 34, 4),
  R(/\boats\b/, 150, 5, 27, 3),
  R(/ragi (ganji|malt)/, 130, 4, 24, 2),

  // ---- dals, legumes ----
  R(/dal makhani/, 220, 10, 22, 10),
  R(/dal shorba/, 110, 6, 15, 3),
  R(/sprouts dal/, 170, 11, 24, 3),
  R(/rajma/, 200, 11, 28, 5),
  R(/lobia|cowpea/, 180, 10, 26, 4),
  R(/horsegram/, 160, 9, 22, 4),
  R(/kala chana|black channa/, 180, 9, 26, 5),
  R(/chole|chana|channa|ghughni|chholar|kabuli/, 220, 10, 28, 8),
  R(/mataki usal|misal/, 190, 10, 26, 5),
  R(/four ?bean chaat/, 160, 9, 24, 3),
  R(/green gram|sundal/, 180, 9, 22, 6),
  R(/\b(dal|daal|pappu|lentil)\b/, 160, 9, 22, 4),
  R(/sambar|sambhar/, 100, 5, 14, 3),
  R(/kadhi/, 220, 7, 18, 13),
  R(/rasam|saaru/, 50, 1, 7, 2),
  R(/majjige huli|kuzhambu|kozhambu/, 120, 4, 12, 6),

  // ---- vegetables ----
  R(/malai kofta/, 300, 6, 20, 22),
  R(/kofta/, 220, 5, 16, 15),
  R(/dum aloo|aloor dum/, 220, 4, 26, 11),
  R(/aloo chokha|aloo bhaja|mashed potato/, 160, 3, 24, 6),
  R(/aloo|potato curry|bombay saagu|aloor chop/, 180, 3, 24, 8),
  R(/honey chill?i potato/, 320, 4, 46, 14),
  R(/mushroom/, 150, 6, 10, 10),
  R(/jackfruit/, 150, 3, 18, 7),
  R(/kurma|avial|aviyal|erissery/, 170, 4, 14, 11),
  R(/manchurian|kolhapuri/, 220, 5, 22, 12),
  R(/gutti vankaya|baingan|baigan|brinjal/, 140, 3, 12, 9),
  R(/sev tamatar/, 200, 5, 18, 12),
  R(/palya|poriyal|thoran|sabzi|sabji|curry|gravy|fry|bhujia|bhindi|arbi|matar|dalna|potol|posto|shukto|saag|adraki|bharwan|kundri|cabbage|mix(ed)? veg|masala$/, 130, 3, 14, 7),
  R(/kosambari/, 80, 4, 10, 2),

  // ---- dairy and drinks ----
  R(/dry ?fruit lassi/, 220, 7, 28, 9),
  R(/lassi/, 180, 6, 26, 6),
  R(/boondi raita/, 130, 4, 12, 7),
  R(/raita/, 80, 3, 8, 4),
  R(/curd/, 60, 3, 5, 3),
  R(/buttermilk|butter milk|chaas|chaach|majjiga/, 40, 2, 4, 1),
  R(/badam milk/, 200, 8, 24, 8),
  R(/boost|bournvita/, 180, 7, 28, 5),
  R(/cold coffee/, 200, 6, 30, 6),
  R(/milkshake|banana shake|shake/, 260, 8, 38, 8),
  R(/milk/, 150, 8, 12, 8),
  R(/\b(tea|chai|coffee)\b/, 80, 2, 10, 3),
  R(/shikanji|jaljeera|basil lime|lemon juice/, 60, 0, 15, 0),
  R(/juice/, 100, 1, 24, 0),

  // ---- snacks ----
  R(/maggi|noodles/, 350, 8, 50, 13),
  R(/pizza/, 450, 18, 52, 18),
  R(/burger/, 380, 10, 48, 16),
  R(/dabeli|pav bhaji/, 380, 9, 52, 15),
  R(/cheese sandwich/, 320, 12, 34, 15),
  R(/sandwich/, 260, 8, 36, 9),
  R(/french fries|fries/, 320, 4, 40, 16),
  R(/samosa/, 400, 8, 44, 22),
  R(/aloo tikki/, 260, 5, 32, 12),
  R(/papdi chat|pani puri|bhel|jhalmuri|chaat|chat\b/, 250, 6, 36, 9),
  R(/peanut chat|peanut chaat|masala peanut|roasted peanut/, 220, 10, 14, 15),
  R(/momo/, 240, 7, 34, 8),
  R(/bombay puff|veg puff|puff/, 280, 5, 28, 17),
  R(/bread roll/, 260, 5, 30, 13),
  R(/donut/, 260, 4, 32, 13),
  R(/brownie/, 250, 3, 32, 13),
  R(/cake/, 280, 4, 38, 13),
  R(/pazhampori/, 180, 2, 26, 8),
  R(/phool makhana/, 120, 4, 20, 3),
  R(/\bcorn\b/, 140, 5, 28, 2),
  R(/soup/, 80, 3, 10, 3),
  R(/mixture|namkeen|sev mix|bhujia|khara boondi|^boondi$/, 160, 4, 14, 10),
  R(/potato chips|chips|fryums|sandige|papad|pappadam/, 60, 2, 7, 3),

  // ---- sweets ----
  R(/gulab ?jamun/, 300, 4, 44, 12),
  R(/rasagol+a|rasgul+a/, 190, 4, 38, 2),
  R(/rasmalai/, 220, 7, 26, 10),
  R(/jalebi rabdi|rabdi jalebi/, 320, 6, 46, 13),
  R(/jalebi/, 150, 1, 26, 5),
  R(/halwa|kada prashad|kesari/, 280, 4, 36, 13),
  R(/mysore pak/, 250, 2, 22, 17),
  R(/ladoo|laddoo/, 190, 3, 24, 9),
  R(/barfi/, 180, 2, 22, 10),
  R(/shahi tukda/, 300, 5, 36, 15),
  R(/custard/, 170, 4, 26, 5),
  R(/ice ?cream/, 180, 3, 24, 8),
  R(/choorma/, 300, 5, 40, 14),
  R(/banana rasayana/, 180, 3, 30, 6),
  R(/payasa|payasam|payesh|kheer|seviyan|shavige/, 200, 5, 32, 6),
  R(/sweet$/, 180, 3, 28, 6),

  // ---- fruit, nuts, small things ----
  R(/banana/, 105, 1, 27, 0),
  R(/fruit|papaya|muskmelon/, 70, 1, 17, 0),
  R(/sprouts/, 90, 7, 12, 1),
  R(/almonds|pistachio|dry fruits/, 60, 2, 2, 5),
  R(/\bdates\b/, 70, 1, 18, 0),
  R(/peanut butter/, 95, 4, 3, 8),
  R(/salad|cucumber|onion|vinegar/, 25, 1, 5, 0),
  R(/chutney powder|gun powder|podi|powder/, 40, 2, 4, 2),
  R(/peanut chutney|groundnut chutney/, 110, 4, 5, 9),
  R(/coconut|chutney/, 70, 1, 5, 5),
  R(/pickle|achar|pachadi/, 30, 0, 2, 3),
  R(/ghee|butter|gingelly oil/, 45, 0, 0, 5),
  R(/mayonnaise|special dip/, 90, 0, 2, 9),
  R(/syrup|ketchup|khajur|khajoor|sweet chutney/, 50, 0, 12, 0),
];

const clean = s => s.toLowerCase().replace(/\(.*?\)/g, ' ').replace(/^nv:\s*/, '').replace(/\s+/g, ' ').trim();

/** The first rule that matches one plain dish name, or null. */
export function ruleFor(name) {
  const n = clean(name);
  return RULES.find(r => r.re.test(n)) || null;
}

/**
 * Macros for one chart entry. "A / B" → A; "A + B" → A and B added up.
 * @returns { cal, p, c, f } or null when some part has no rule.
 */
export function macrosFor(entry) {
  const first = entry.replace(/\(([^)]*)\)/g, (m, inner) => (inner.includes('/') ? '' : m)).split(' / ')[0];
  const parts = first.split(/\s\+\s/).map(s => s.trim()).filter(Boolean);
  const out = { cal: 0, p: 0, c: 0, f: 0 };
  for (const p of parts) {
    const r = ruleFor(p);
    if (!r) return null;
    for (const k of Object.keys(out)) out[k] += r.m[k];
  }
  return { cal: Math.round(out.cal), p: round(out.p, 1), c: round(out.c, 1), f: round(out.f, 1) };
}

/** The chart strings → { n, cal, p, c, f, diet } items. Unmatched dishes are reported, never invented. */
export function parseMeal(text, { nonVeg = true } = {}) {
  const items = [], missing = [];
  for (const raw of String(text || '').split(';').map(s => s.trim()).filter(Boolean)) {
    const nv = /^nv:/i.test(raw);
    if (nv && !nonVeg) continue;
    const n = raw.replace(/^nv:\s*/i, '').trim();
    const m = macrosFor(n);
    if (!m) { missing.push(n); continue; }
    const diet = nv ? (/egg|omelet/i.test(n) ? 'e' : 'n') : 'v';
    items.push({ n: n.charAt(0).toUpperCase() + n.slice(1), ...m, diet });
  }
  return { items, missing };
}

/** Build one mess's weekly menu: chart dishes, then that mess's daily items. */
export function buildWeek(raw, daily = {}, { nonVeg = true } = {}) {
  const week = {}, missing = [];
  for (const [day, meals] of Object.entries(raw)) {
    week[day] = {};
    for (const meal of ['breakfast', 'lunch', 'snacks', 'dinner']) {
      const a = parseMeal(meals[meal], { nonVeg }), b = parseMeal(daily[meal], { nonVeg });
      week[day][meal] = [...a.items, ...b.items.filter(x => !a.items.some(y => y.n.toLowerCase() === x.n.toLowerCase()))];
      missing.push(...a.missing.map(m => `${day} ${meal}: ${m}`), ...b.missing.map(m => `daily ${meal}: ${m}`));
    }
  }
  return { week, missing: [...new Set(missing)] };
}
