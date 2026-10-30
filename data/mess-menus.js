// =============================================================
// CAMPUS MESS MENUS (2026), transcribed from the committees' charts:
//   A Mess Revised menu · B Mess Menu (Sept 2026) · C Mess Updated Menu (Oct 2026)
//   D Mess Menu (from 6 Oct 2026) · E Mess Menu (from 22 Sept 2026)
//
// One string per meal, dishes separated by ';'. "X / Y" means the chart
// alternates them (by week or by day); macros come from the first option.
// "NV:" marks a non-veg (or egg) dish, which the veg menus of B and C leave out.
// DAILY lists what each mess puts out at every meal (tea, bread, rice, curd…);
// only the items that matter for nutrition are kept, not condiments.
// Macros per serving are attached in js/engine/dishes.js.
// =============================================================

export const MENU_INFO = {
  A: { title: 'A Mess', file: 'A Mess Revised menu', effective: '2026-09' },
  B: { title: 'B Mess', file: 'B Mess Menu (Sept 2026)', effective: '2026-09' },
  C: { title: 'C Mess', file: 'C Mess Updated Menu (Oct 2026)', effective: '2026-10' },
  D: { title: 'D Mess', file: 'D Mess Menu (from 6 Oct 2026)', effective: '2026-10-06' },
  E: { title: 'E Mess', file: 'E Mess Menu (from 22 Sept 2026)', effective: '2026-09-22' },
};

export const DAILY = {
  A: { breakfast: '', lunch: '', snacks: '', dinner: '' },
  B: {
    breakfast: 'Soaked almonds (4); Milk / Tea / Coffee; Sprouts; Banana; Bread + jam',
    lunch: 'Plain rice; Chapati; Salad',
    snacks: 'Tea / Coffee / Milk',
    dinner: 'Plain rice; Chapati; Buttermilk',
  },
  C: {
    breakfast: 'Milk / Tea / Coffee; Ragi malt; Bread + jam; Sprouts; Banana',
    lunch: 'Salad; Buttermilk',
    snacks: 'Tea / Coffee / Milk',
    dinner: 'Plain rice; Rasam; Buttermilk',
  },
  D: {
    breakfast: 'Milk / Tea / Coffee; Bread + jam; Cornflakes; Sprouts',
    lunch: 'Fulka roti; Plain rice; Salad',
    snacks: 'Tea / Coffee / Milk',
    dinner: 'Fulka roti; Plain rice; Salad',
  },
  E: {
    breakfast: 'Milk / Tea / Coffee; Bread + jam; Sprouts; Soaked almonds (4)',
    lunch: 'Fulka roti; Plain rice; Salad',
    snacks: 'Milk / Coffee; Rusk',
    dinner: 'Fulka roti; Plain rice; Salad',
  },
};

export const RAW = {
  A: {
    Monday: {
      breakfast: 'Avalakki bath (Poha); Mixture; Curd; Coconut chutney; Ragi ganji; Cornflakes',
      lunch: 'Majjige huli; Ridge gourd palya / Ridge gourd gravy; Ash gourd palya; Dal makhani; Rasam; Sandige; Gongura pickle; Lemon juice',
      snacks: 'Maggi / Papdi chat; Chocolate milkshake',
      dinner: 'Aloo gobi palya; Puliyogare / Coconut rice; Matar tofu; Obbatu saaru; Dal tadka; Avakai pickle; Curd; Fruit custard',
    },
    Tuesday: {
      breakfast: 'Idly (3); Vada (2); Sambar; Peanut chutney; Banana; Ghee',
      lunch: 'Black channa palya / Bendakaya palya; Shahi tukda / Rasagulla; Tomato pappu; Dosakaya pachadi; Curd; Rasam; Papad',
      snacks: 'French fries / Brownie; Mixture; Mango milkshake',
      dinner: 'Hyderabadi paneer masala / Jackfruit curry; Hot badam milk; Middi mango pickle; Moong dal',
    },
    Wednesday: {
      breakfast: 'Vegetable upma / Semiya upma; Chutney; Kesari bath; Cornflakes; Ragi ganji',
      lunch: 'Jeera rice; Gutti vankaya / Capsicum curry; Horsegram palya; Gongura dal; Tamarind rasam; Seasonal fruit; Curd',
      snacks: 'Pizza / Veg burger; Muskmelon juice; Peanut butter',
      dinner: 'Podi masala dosa; Tiffin sambar; Chutney; Curd; Pickle',
    },
    Thursday: {
      breakfast: 'Pongal; Vada (2); Udupi sambar; Ghee; Peanut butter; Tamarind chutney; Banana',
      lunch: 'Menthi pappu / Palakura pappu; Ragi mudde; Chapathi; Mushroom gravy / Paneer gravy; Gongura pachadi; Papad; Seasonal fruit juice',
      snacks: 'Seasonal fruit cut; Peanut chat; Irani chai',
      dinner: 'Peas pulao / Bisibelebath; Boondi; Cabbage carrot palya; Arhar dal; Carrot halwa; Gongura pickle; Curd',
    },
    Friday: {
      breakfast: 'Vegetable uthappam / Wheat dosa; Tomato chutney; Pudina chutney; Banana rasayana',
      lunch: 'Akki roti / Ragi roti; Drumstick sambar; Lobia curry; Chutney; Tomato sandige; Curd; Mix veg pickle; Seasonal fruit',
      snacks: 'Bhel puri / Dabeli; Tamarind and green chutney; Banana milkshake',
      dinner: 'Pudina rice / Paneer biryani; Raita; Vegetable kurma; Curd; Mango pickle',
    },
    Saturday: {
      breakfast: 'Idly (3); Mangalore bajji; Sambar; Coconut chutney; Banana; Ragi ganji',
      lunch: 'Palak paneer / Paneer butter masala; Curd rice with fruits; Kosambari; Dal tadka; Gulab jamun; Rasam; Bitter gourd curry with tomato',
      snacks: 'Paddu / Mandakki uggani; Tomato chutney / Coconut chutney; Peanut butter',
      dinner: 'Gongura puliyogare / Khichdi; Aloo jeera / Thondekkayi palya; Sabbakki payasa / Dal payasa; Potato chips; Rasam; Gongura pickle',
    },
    Sunday: {
      breakfast: 'Crispy ghee masala dosa; Plain ghee dosa; Dal sambar; Coconut chutney; Ragi ganji; Banana',
      lunch: 'Vegetable dum biryani; Chole bhature; Gongura pachadi; Raita; Rasam; Curd; Ice cream',
      snacks: 'Sweet corn / Pani puri with curd; Peanut butter',
      dinner: 'Beetroot palya / Beans carrot palya; Potato chips; Methi chapathi; Veg chutney; Dal tadka; Obbatu saaru; Shavige payasa',
    },
  },

  B: {
    Monday: {
      breakfast: 'Poha; Coconut chutney; Mixture',
      lunch: 'Moong dal; Bhindi sabzi; Seasonal fruit; NV: Egg kosha',
      snacks: 'Jhalmuri + Aloor chop',
      dinner: 'Masoor dal; Dhokar dalna; NV: Chicken butter masala; Kesari bath',
    },
    Tuesday: {
      breakfast: 'Koraishutir kochuri + Chholar dal',
      lunch: 'Masoor dal; Soyabean curry; Nimbu shikanji; NV: Egg ghee roast',
      snacks: 'Veg momo; Soup; Sweet rusk; Elaichi tea',
      dinner: 'Moong dal; Doi potol; NV: Muri ghonto (fish head); NV: Rohu posto',
    },
    Wednesday: {
      breakfast: 'Aloo paratha / Paneer paratha; Ghughni',
      lunch: 'Moong dal; Pumpkin curry; Seasonal fruit; NV: Chicken aloo jhol',
      snacks: 'NV: Chicken tikka; Paneer tikka; Special dip',
      dinner: 'Masoor dal; Aloo chokha; Brinjal fry; NV: Egg kosha; Gulab jamun',
    },
    Thursday: {
      breakfast: 'Idli + Vada; Coconut chutney; Sambar; Gun powder',
      lunch: 'Masoor dal; Mixed veg with saag; Nimbu shikanji; NV: Egg curry',
      snacks: 'Veg noodles; Bombay puff',
      dinner: 'Fried rice; Moong dal; Paneer butter masala; NV: Schezwan chicken; Payesh',
    },
    Friday: {
      breakfast: 'Ruti + Ghughni',
      lunch: 'Masoor dal; Aloo posto; Seasonal fruit; NV: Egg white curry',
      snacks: 'Brownie / Vanilla cake; Bombay puff; Ginger tea',
      dinner: 'Pulao / Basanti pulao; Chana dal; Aloor dum; NV: Chicken biryani / Mutton kosha',
    },
    Saturday: {
      breakfast: 'Luchi + Aloor dum',
      lunch: 'Masoor dal; Shukto / Banana stem curry; NV: Katla kalia / Bhetki paturi / Goan prawn curry',
      snacks: 'Pav bhaji / Vada pav; Tandoori chai',
      dinner: 'Paratha; Moong dal; Paneer manchurian; NV: Egg tadka; Rasagolla',
    },
    Sunday: {
      breakfast: 'Plain dosa; Aloo masala; Sambar; Coconut chutney; Podi; Bru coffee',
      lunch: 'Moong dal; Sweet pulao; Bhature; Chole masala; Ice cream; NV: Chicken ghee roast',
      snacks: 'Peanut chaat; Sweet rusk; Ginger tea',
      dinner: 'Veg khichdi; Masoor dal; Ghee; Aloo bhaja; Fryums; NV: Egg omelette; Tomato chutney',
    },
  },

  C: {
    Monday: {
      breakfast: 'Poha mixture / Rava upma; Kesari bath; Coconut chutney; Oats; Dry fruits',
      lunch: 'Chapati; Matta rice; Ragi mudde; Bhindi curry; Sambar; Gongura chutney; Ghee; Cucumber; Seasonal fruit; NV: Egg roast',
      snacks: 'Masala peanut / Spicy chaat; Pazhampori',
      dinner: 'Chapati; Ghee rice; Cowpea curry; Mushroom chilli; Payasam; NV: Gongura chicken / Chef special chicken curry',
    },
    Tuesday: {
      breakfast: 'Idli (3); Vadai (2); Coconut-pudina chutney; Sambar; Powder; Gingelly oil',
      lunch: 'Chapati; Mix veg poriyal; Dhaba style dal / Thotakura pappu; Sambar; Lassi; NV: Egg masala',
      snacks: 'Pizza / Garlic bread; Milkshake / Oreo milkshake / Badam milk',
      dinner: 'Fulka; Pumpkin erissery; Aloo matar / Navarathna kurma; Veg pulao / Tomato bath; NV: Fish curry (extra); NV: Special chicken curry',
    },
    Wednesday: {
      breakfast: 'Pongal; Vadai (2); Madras sambar; Coconut chutney; Onion raita; Dry fruits',
      lunch: 'Methi roti; Poricha kuzhambu; Matta rice; Ivy-gourd thoran / Ivy-gourd fry; Grape juice; Curd; NV: Spicy egg garlic curry',
      snacks: 'French fries; Paneer pakoda; NV: Chicken pakoda',
      dinner: 'Dosa; Ragi mudde; Mashed potato; Groundnut chutney; Mixed-vegetable sambar; Powder; Fruit custard; NV: Mutton curry',
    },
    Thursday: {
      breakfast: 'Wheat dosa / Semiya upma; Tomato chutney; Groundnut chutney; Powder; Cornflakes',
      lunch: 'Chapati; Soppina palya / Beetroot poriyal; Rajma / Dal makhani; Seasonal fruit; Curd rice; NV: Boiled egg (2)',
      snacks: 'Brownie + mixture / Bhel puri',
      dinner: 'Fulka; Mandi rice; Gutti vankaya curry; Mix dal tadka; Sweet; NV: Guntur chicken dry / Chettinadu chicken curry',
    },
    Friday: {
      breakfast: 'Appam + channa curry / Uthappam dosa; Pudina-tomato chutney; Red chilli coconut chutney; Dry fruits',
      lunch: 'Methi paratha / Palak paratha; Avial / Kuzhambu; Potato curry; Matta rice; Pappadam; Pulikachal; Kosambari; Lemon juice; NV: Egg-tomato gojju',
      snacks: 'Donut + mixture / Veg puff; NV: Egg puff',
      dinner: 'Fulka; Mix veg curry; Paneer biryani / Dum biryani; Papaya; Open curry; Fried onion raita; Payasam; Pappadam; NV: Chicken biryani / Mutton biryani',
    },
    Saturday: {
      breakfast: 'Idli (3); Bonda; Groundnut chutney; Sambar; Powder; Cornflakes',
      lunch: 'Methi roti; Paneer butter masala / Palak paneer; Chow chow dal; Sweet; NV: Chicken dry',
      snacks: 'Veg momos / Hakka noodles; Momos chutney; NV: Chicken momos',
      dinner: 'Poori + Bombay saagu / Aloo paratha + curd / Paneer paratha + curd; Gongura pulihora / Melukote puliyogare / Lemon rice; Khara boondi / Chips; Carrot halwa; NV: Boiled egg (2)',
    },
    Sunday: {
      breakfast: 'Crunchy masala dosa; Sambar; Coconut chutney; Spicy chutney; Powder; NV: Egg dosa (extra)',
      lunch: 'Bhatura; Kabuli chana; Veg pulao / Veg fried rice; Onion raita; Ice cream; NV: Chicken ghee roast / Chilli chicken',
      snacks: 'Boiled corn / Groundnut sundal / Pani puri',
      dinner: "Fulka; Veg fried rice / Chef's bath; Rice pongal; Boiled green gram; Papad; Veg curry; Fryums; Boost / Bournvita; NV: Egg omelette + tomato cabbage",
    },
  },

  D: {
    Monday: {
      breakfast: 'Poha; Jalebi; Coconut chutney; Bhujia; Banana shake; Almonds',
      lunch: 'Paneer jalfrezi / Matar paneer; Dal Amritsari; Buttermilk; Seasonal fruit; Palak fulka',
      snacks: 'Pani puri / Bhel puri; Peanut butter',
      dinner: 'Aloo spring onion / Aloo capsicum; Peas pudina pulao; Chana dal; Curd; Coconut barfi / Rasmalai; Khatti tomato khajur chutney',
    },
    Tuesday: {
      breakfast: 'Paneer paratha / Gobi paratha; Curd; Achar; Green chutney; Butter; Banana; Dates',
      lunch: 'Palak matar / Fali sabzi; Basmati tawa pulao; Dal makhani; Veg raita; Onion vinegar; Jaljeera; Fryums',
      snacks: 'Walnut brownie / Bread roll; French fries / Roasted peanut; Mint mayonnaise; Chocolate milkshake',
      dinner: 'Mushroom curry; Gobi adraki; Tamarind rice / Delhi special chole + lemon rice; Mix dal; Coconut chutney; Badam milk / Hot Boost',
    },
    Wednesday: {
      breakfast: 'Uttapam / Moong dal chila; Tomato chutney / Tomato coriander chutney; Banana shake; Almonds',
      lunch: 'Kadhi pakoda; Karela bharwan / Bhujia fry; Toor dal; Buttermilk; Onion vinegar; Seasonal fruit',
      snacks: 'Veg cheese sandwich / Hakka noodles; Green and sweet chutney',
      dinner: 'Bhandara aloo sabzi; Methi poori; Sprouts dal; Jeera chaas; Mysore pak / Kheer',
    },
    Thursday: {
      breakfast: 'Idli (3); Vada (2); Sambar; Coconut chutney; Chutney powder; Ghee; Banana shake; Dates',
      lunch: 'Bhindi; Rasam; Curd rice; Jeera chaas; Dal palak; Gulab jamun; Papad',
      snacks: 'Samosa + chole + curd / Honey chilli potato; Peanut butter; Grape juice',
      dinner: 'Paneer chilli / Mushroom chilli; Fried rice; Masoor dal; Buttermilk',
    },
    Friday: {
      breakfast: 'Thepla / Ajwain poori; Aloo bhujia / Aloo chana sabzi; Curd; Muesli / Upma; Banana; Pistachio',
      lunch: 'Arbi; Rajma; Dry fruit lassi; Chota basmati ghee rice; Rasam; Fryums',
      snacks: 'Burger / Dabeli; Green and sweet chutney; Fruit chaat; Ketchup',
      dinner: 'Palak kofta / Veg kofta; Dal shorba / Lobia masala; Boondi ladoo / Rasgulla; Buttermilk',
    },
    Saturday: {
      breakfast: 'Aloo paratha; Butter; Green chutney; Curd; Achar; Banana; Almonds',
      lunch: 'Mix veg; Chota basmati dum biryani / Soya biryani; Red masoor moong dal; Pudina shikanji; Papad; Onion cucumber raita',
      snacks: 'Pizza / Garlic bread; Peanut chaat; Cold coffee',
      dinner: 'Paneer methi malai / Paneer bhurji; Triangle paratha; Masoor chhilka dal; Chaas; Moong dal halwa / Rabdi jalebi',
    },
    Sunday: {
      breakfast: 'Masala dosa; Sambar; Coconut chutney; Chutney powder; Banana shake; Pistachio',
      lunch: 'Chole (Pindi / Amritsari); Bhatura; Roti (limited); Aloo chokha; Jeera rice; Boondi raita; Onion vinegar; Ice cream; Rasam',
      snacks: 'Boiled and crispy corn / Dahi vada; Green and sweet chutney; Fruit juice',
      dinner: 'Lauki bhujia / Kundri masala / Baingan bharta; Veg khichdi / Multigrain khichdi; Potato chips; Hari dal; Chaach; Tomato garlic chutney',
    },
  },

  E: {
    Monday: {
      breakfast: 'Poha; Namkeen; Coconut chutney; Banana shake; Jalebi',
      lunch: 'Kala chana / Rajma; Curd; Arhar dal; Onion rings; Jeera rice; Basil lime; Seasonal fruit',
      snacks: 'Samosa / Phool makhana; Sweet chutney; Cucumber cuts; Peanut butter',
      dinner: 'Veg soya chunks curry / Bhindi sabji; Rasgulla / Gulab jamun; Peas pulao / Paneer biryani; Mix dal; Kheera raita',
    },
    Tuesday: {
      breakfast: 'Paneer paratha / Gobi paratha; Green chutney / Orange chutney; Curd; Banana shake',
      lunch: 'Kadhi pakora / Malai soya chaap; Aloo methi sabzi; Lal masoor dal; Lemon rice; Tomato chilli chutney; Buttermilk',
      snacks: 'Pizza / Garlic bread; Sweet corn chaat; Coconut milkshake',
      dinner: 'Matar mushroom / Paneer jalfrezi; Dum aloo; Black masoor dal; Kheer / Seviyan; Papad; Ghee rice',
    },
    Wednesday: {
      breakfast: 'Idli (3); Sambar; Vada (2); Coconut chutney; Banana shake; Groundnut chutney',
      lunch: 'Palak paneer; Dal tadka; Yellow sweet rice; Tomato khajoor khatta; Papad; Masala chaach; Fruit custard',
      snacks: 'Pav bhaji / Misal pav; Chopped onions; Four bean chaat; Peanut butter; Seasonal juice',
      dinner: 'Malai kofta / Sev tamatar; Masoor dal; Tomato rice; Cucumber raita; Hot Bournvita',
    },
    Thursday: {
      breakfast: 'Veg dalia; Onion uttappam; Tomato garlic chutney; Banana shake',
      lunch: 'Aloo chokha; Panchmel dal; Buttermilk; Sabudana papad; Batti; Choorma; Seasonal fruit',
      snacks: 'Aloo tikki / Pyaz kachori; Matar chole; Green chutney; Curd; Sweet chutney; Seasonal juice; Peanut butter',
      dinner: 'Mix veg with paneer; Dal makhani; Pudina rice; Fryums; Veg raita; Badam milk',
    },
    Friday: {
      breakfast: 'Besan chila / Moong dal chila / Ajwain poori / Palak poori; Green chutney / Kala chana sabji; Banana shake',
      lunch: 'Raw banana sabji / Loki bhujia sabji; Dry fruit lassi / Flavoured lassi; Tawa pulao; Mix dal',
      snacks: 'French fries / Brownie; Mint mayonnaise / Choco syrup; Crispy sev mix; Peanut butter; Fruit cuts',
      dinner: 'Paneer bhurji; Arhar ki dal; Triangle paratha; Lahsun chutney; Ghiya raita; Tamarind rice; Kada prashad / Mysore pak',
    },
    Saturday: {
      breakfast: 'Aloo paratha; Curd; Tomato onion pudina chutney; Mango pickle; Banana shake',
      lunch: 'Veg manchurian / Veg kolhapuri; Plain rice; Palak dal; Curd; Papad; Veg fried rice; Onion rings; Basil lime; Seasonal fruit',
      snacks: 'Aloo sandwich / Dabeli; Tomato ketchup / Peanut chaat; Seasonal juice',
      dinner: 'Mataki usal; Loki chana dal; Curd rice; Onion rings; Jalebi rabdi / Rasmalai; Jeera raita / Bathua raita',
    },
    Sunday: {
      breakfast: 'Aloo dosa / Paneer dosa; Coconut chutney / Peanut chutney; Sambar; Banana shake',
      lunch: 'Amritsari chole / Dry pinde chole; Bhature / Poori; Roti (limited); Boondi raita; Veg pulao; Arhar dal tadka; Vinegar onion; Ice cream',
      snacks: 'Papdi chat / Pani puri; Fruit cuts',
      dinner: 'Hari dal; Loki raita; Potato chips; Vegetable khichdi; Masala baigan bharta; Moong dal halwa / Carrot halwa',
    },
  },
};

/** Which chart each app mess id uses, and whether its non-veg dishes are included. */
export const MESS_SOURCES = {
  AV: { chart: 'A', nonVeg: false },
  BV: { chart: 'B', nonVeg: false },
  BNV: { chart: 'B', nonVeg: true },
  CV: { chart: 'C', nonVeg: false },
  CNV: { chart: 'C', nonVeg: true },
  DV: { chart: 'D', nonVeg: false },
  EV: { chart: 'E', nonVeg: false },
};
