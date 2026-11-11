// =============================================================
// FOOD SEARCH SYNONYMS — what students actually type.
//
// Someone looking for curd types "dahi", "thayir" or "perugu"; someone
// looking for rice types "chawal", "annam", "sadam" or "bhaat". The food
// tables are in English, so a search for the word they grew up with finds
// nothing and the app looks empty. This maps those words onto the English
// names, both ways, so either spelling works.
//
//   expand('dahi')        → ['dahi', 'curd', 'yoghurt']
//   expand('jeera rice')  → ['jeera rice', 'cumin rice']
//
// Pure: no DOM, no network. Lowercase, single words or short phrases.
// =============================================================

/** Each group is a set of words that mean the same food; typing any finds all. */
export const GROUPS = [
  // staples
  ['rice', 'chawal', 'chaval', 'bhaat', 'bhat', 'annam', 'sadam', 'soru', 'choru', 'anna'],
  ['chapati', 'chapathi', 'roti', 'ruti', 'phulka', 'fulka', 'rotli'],
  ['paratha', 'parantha', 'porotta', 'parotta'],
  ['poori', 'puri', 'luchi'],
  ['wheat', 'gehun', 'atta', 'godhuma'],
  ['bread', 'pav', 'pao', 'bun'],
  // dals and legumes
  ['dal', 'daal', 'dhal', 'pappu', 'paruppu', 'bele', 'lentil', 'lentils'],
  ['chana', 'channa', 'chickpea', 'chickpeas', 'kabuli', 'senagalu'],
  ['chole', 'chhole', 'cholay', 'chana masala'],
  ['rajma', 'rajmah', 'kidney bean', 'kidney beans'],
  ['lobia', 'cowpea', 'alasandalu', 'karamani'],
  ['soya', 'soy', 'soyabean', 'soybean'],
  // dairy
  ['curd', 'dahi', 'dahee', 'thayir', 'perugu', 'mosaru', 'yoghurt', 'yogurt'],
  ['milk', 'doodh', 'dudh', 'paal', 'palu', 'haalu'],
  ['buttermilk', 'chaas', 'chaach', 'majjiga', 'moru', 'neer mor', 'majjige'],
  ['paneer', 'panir', 'cottage cheese'],
  ['ghee', 'clarified butter', 'neyyi', 'tuppa'],
  ['khoa', 'khoya', 'mawa'],
  // protein
  ['egg', 'eggs', 'anda', 'ande', 'muttai', 'kodi guddu', 'motte'],
  ['chicken', 'murgh', 'murg', 'kodi', 'koli'],
  ['mutton', 'gosht', 'goat meat', 'lamb', 'mamsam'],
  ['fish', 'machli', 'machhi', 'meen', 'chepa', 'maasu'],
  ['prawn', 'prawns', 'shrimp', 'jhinga', 'royya', 'eral'],
  ['whey', 'whey protein', 'protein powder', 'protein shake'],
  // vegetables
  ['potato', 'aloo', 'alu', 'batata', 'urulai', 'bangaladumpa'],
  ['onion', 'pyaz', 'pyaaz', 'kanda', 'vengayam', 'ullipaya'],
  ['tomato', 'tamatar', 'thakkali'],
  ['okra', 'bhindi', 'lady finger', 'ladies finger', 'vendakkai', 'bendakaya'],
  ['brinjal', 'baingan', 'baigan', 'eggplant', 'aubergine', 'vankaya', 'kathirikai'],
  ['cauliflower', 'gobi', 'gobhi', 'phool gobi'],
  ['cabbage', 'patta gobi', 'muttaikose'],
  ['spinach', 'palak', 'palakura', 'palak saag'],
  ['bottle gourd', 'lauki', 'loki', 'ghiya', 'sorakaya', 'dudhi'],
  ['bitter gourd', 'karela', 'kakarakaya', 'pavakkai'],
  ['ridge gourd', 'turai', 'beerakaya', 'heerekai'],
  ['drumstick', 'moringa', 'munagakaya', 'murungakkai'],
  ['raw banana', 'kaccha kela', 'aratikaya', 'vazhakkai'],
  ['mushroom', 'khumb', 'kummulu'],
  ['peas', 'matar', 'mutter', 'batani'],
  ['greens', 'saag', 'soppu', 'keerai'],
  // dishes
  ['sabzi', 'sabji', 'subzi', 'curry', 'palya', 'poriyal', 'thoran', 'kura', 'bhaji'],
  ['sambar', 'sambhar', 'saambar'],
  ['rasam', 'saaru', 'chaaru', 'charu'],
  ['kadhi', 'kadi', 'majjige huli'],
  ['biryani', 'biriyani', 'briyani', 'dum biryani'],
  ['pulao', 'pulav', 'pilaf', 'palav'],
  ['khichdi', 'khichadi', 'kichdi', 'pongal'],
  ['idli', 'idly', 'iddli'],
  ['dosa', 'dosai', 'dose', 'thosai'],
  ['vada', 'vadai', 'wada', 'garelu', 'medu vada'],
  ['upma', 'uppma', 'uppittu'],
  ['poha', 'pohe', 'avalakki', 'atukulu', 'flattened rice'],
  ['uttapam', 'uthappam', 'utappam', 'oothappam'],
  ['misal', 'misal pav', 'usal'],
  ['pav bhaji', 'pao bhaji'],
  ['curd rice', 'thayir sadam', 'perugu annam', 'mosaranna', 'dahi chawal'],
  ['lemon rice', 'chitranna', 'pulihora elumichai'],
  ['tamarind rice', 'puliyogare', 'pulihora', 'puliyodarai'],
  ['sweet', 'mithai', 'sweets', 'dessert'],
  ['ragi', 'finger millet', 'nachni', 'mudde'],
  ['jaggery', 'gud', 'bella', 'bellam', 'vellam'],
  // snacks and sweets
  ['samosa', 'singara'],
  ['pakoda', 'pakora', 'bajji', 'bhajji', 'fritter'],
  ['namkeen', 'mixture', 'chivda', 'chiwda', 'farsan'],
  ['biscuit', 'biscuits', 'cookie', 'cookies', 'biskut'],
  ['chips', 'wafers', 'crisps'],
  ['laddu', 'ladoo', 'laddoo'],
  ['barfi', 'burfi', 'burfee'],
  ['halwa', 'halva', 'sheera'],
  ['kheer', 'payasam', 'payasa', 'payesh', 'firni'],
  ['jalebi', 'jilebi', 'jangiri'],
  ['gulab jamun', 'gulab jamoon'],
  ['rasgulla', 'rasagolla', 'rosogolla'],
  ['ice cream', 'icecream', 'kulfi'],
  // drinks
  ['tea', 'chai', 'chaha', 'chaya'],
  ['coffee', 'kaapi', 'filter coffee'],
  ['juice', 'ras', 'rus'],
  ['water', 'paani', 'pani'],
  ['sugarcane juice', 'ganne ka ras', 'cheruku rasam'],
  ['coconut water', 'nariyal pani', 'elaneer'],
  ['shake', 'milkshake', 'smoothie'],
  // cooking words that change the numbers
  ['fried', 'deep fried', 'tala hua'],
  ['roasted', 'bhuna', 'grilled'],
  ['boiled', 'ubla', 'uble', 'steamed'],
];

const index = new Map();
for (const group of GROUPS) {
  for (const word of group) {
    const others = group.filter(w => w !== word);
    index.set(word, [...(index.get(word) || []), ...others]);
  }
}

/** Every word this one could also mean (not including itself). */
export const synonymsOf = word => index.get(String(word).toLowerCase().trim()) || [];

const norm = s => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * The query plus the phrasings that mean the same thing, best first.
 * Matches the whole phrase before single words, so "curd rice" finds
 * "thayir sadam" rather than every rice dish and every curd.
 */
export function expand(query, { max = 6 } = {}) {
  const q = norm(query);
  if (!q) return [];
  const out = [q];
  const add = s => { if (s && !out.includes(s) && out.length < max) out.push(s); };

  for (const alt of synonymsOf(q)) add(alt);                       // the whole query is a known name

  const words = q.split(' ');
  if (words.length > 1 && out.length < max) {
    for (let i = 0; i < words.length; i++) {
      for (const alt of synonymsOf(words[i])) {
        add(words.map((w, j) => (j === i ? alt : w)).join(' '));    // swap one word at a time
      }
    }
  }
  return out;
}
