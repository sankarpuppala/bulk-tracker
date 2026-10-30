// =============================================================
// ALLERGENS — hard filters, matched on food names until the food
// database carries explicit tags (Phase 8 adds `al` to every food).
// Pure. A food that declares `al: ['peanut']` always wins over the
// name patterns, so the database can correct the guesses below.
// =============================================================

export const ALLERGENS = {
  peanut: { label: 'Peanut', re: /\b(peanut|peanuts|groundnut|groundnuts|moongphali|chikki|pintola|peanut butter)\b/i },
  treenut: { label: 'Tree nut', re: /\b(almond|almonds|cashew|cashews|walnut|walnuts|pista|pistachio|pistachios|hazelnut|badam|kaju|nutella|mixed nuts|dry fruits?)\b/i },
  lactose: { label: 'Milk / lactose', re: /\b(milk|paneer|curd|dahi|yogurt|yoghurt|cheese|butter|ghee|lassi|raita|kheer|payasam|ice cream|whey|khoa|mawa|rasmalai|cream|shake|latte|cappuccino|chai|tea|coffee|paneer)\b/i },
  gluten: { label: 'Gluten', re: /\b(wheat|chapati|roti|naan|paratha|bread|pav|bun|maggi|noodles|pasta|pizza|biscuit|biscuits|rusk|cake|puri|poori|bhatura|kulcha|samosa|burger|roll|wrap|sandwich|semolina|rava|suji|upma|atta|maida)\b/i },
  egg: { label: 'Egg', re: /\b(egg|eggs|omelette|omelet|omlet|anda|bhurji|mayo|mayonnaise)\b/i },
  soy: { label: 'Soy', re: /\b(soy|soya|tofu|edamame|soybean|nutrela)\b/i },
  shellfish: { label: 'Fish / shellfish', re: /\b(fish|prawn|prawns|crab|shrimp|seafood|tuna|salmon|lobster|squid)\b/i },
  sesame: { label: 'Sesame', re: /\b(sesame|til|tahini|gajak)\b/i },
};

export const allergenLabel = id => ALLERGENS[id]?.label || id;

/** Allergen ids in `list` that the item (name or declared `al`) contains. */
export function allergenHits(item, list = []) {
  if (!list?.length) return [];
  const declared = Array.isArray(item?.al) ? item.al : null;
  const name = `${item?.brand || ''} ${item?.n || item?.name || ''}`;
  return list.filter(a => (declared ? declared.includes(a) : ALLERGENS[a]?.re.test(name)));
}
