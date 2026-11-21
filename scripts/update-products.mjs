// Builds data/products.json: brand-name frozen products sold in US stores, each matched to one of the
// app's product types so it can reuse that type's cooking instructions.
//
// Source: the Open Food Facts daily export (https://world.openfoodfacts.org/data), ODbL licensed.
// Run: node scripts/update-products.mjs            (downloads ~1.5 GB, streamed, nothing saved to disk)
//      node scripts/update-products.mjs file.csv.gz (use a local copy instead)

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import readline from "node:readline";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPORT_URL = "https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz";
const IMG_PREFIX = "https://images.openfoodfacts.org/images/products/";
const MIN_STORE_PRODUCTS = 8; // stores tagged on fewer frozen products than this are treated as noise

/* ---------- product types the app knows (validated against index.html) ---------- */
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const TYPES = new Set([...html.matchAll(/\bn: "([^"]+)"/g), ...html.matchAll(/veg\("([^"]+)"/g)].map((m) => m[1]));

/* ---------- matching rules: first match wins, so specific patterns come before general ones ---------- */
const PLANT = /plant.based|meatless|vegan|veggie (burger|patt|nugget|crumble|sausage)|meat.?free|chik.?n|impossible|beyond (meat|burger|chicken|sausage)|morningstar|gardein|boca|quorn|incogmeato|dr\.? praeger/;
const DINNER_BRANDS = /lean cuisine|healthy choice|banquet|stouffer|marie callender|smart ones|hungry.man|michelina|evol|saffron road|sweet earth|amy.?s|devour|kevin.?s|real good|tattooed chef|luvo|life cuisine|on cor|boston market|p\.?f\.? chang/;

const RULES = [
  // Frozen desserts first, so "ice cream sandwich" or "Amy's non-dairy dessert" never land in a meal type
  [/dessert sandwich|cookie sandwich|ice cream sandwich|ice cream bars?|popsicle|\bpops\b|ice pops?|freez(er|e) pops?|\bbars?\b|cones?\b|drumstick|klondike|novelt|push.?ups?/, "Ice cream bars & sandwiches", null, /granola|protein bar/],
  [/mochi/, "Mochi ice cream"],
  [/ice cream|gelato|frozen yogh?urt|sorbet|sherbet|banana split|ices?|italian ice|frozen (dairy )?dessert|non.dairy dessert|frozen custard|cool scoops/, "Ice cream (to soften)"],
  [/cheesecake/, "Cheesecake"],
  [/whipped topping|cool whip|whip topping/, "Whipped topping"],
  [/cookie dough/, "Cookie dough (pre-portioned)"],
  [/lava cake|molten/, "Molten lava cakes"],

  // Pizza
  [/hot pocket|lean pocket|stuffed sandwich|calzone|stromboli|croissant crust|pizza pocket/, "Stuffed sandwich pocket"],
  [/pizza (rolls?|bites|snacks)/, "Pizza rolls"],
  [/bagel bites?|mini bagel/, "Mini bagel pizzas"],
  [/french bread pizza/, "French bread pizza"],
  [/take.?(and|&|n).?bake/, "Take-and-bake pizza (18 in.)"],
  [/cauliflower.*(crust|pizza)|pizza.*cauliflower/, "Cauliflower-crust pizza"],
  [/gluten.free.*pizza|pizza.*gluten.free/, "Gluten-free pizza"],
  [/(flatbread|naan).*pizza|pizza.*flatbread/, "Flatbread pizza"],
  [/(personal|single.serve|for one|mini|singles|snack).*pizza|pizza.*(for one|single)/, "Personal pan pizza (6–8 in.)"],
  [/(rising|deep dish|thick crust|pan pizza|stuffed crust|pizzeria style|detroit|sicilian)/, "Rising-crust pizza (12 in.)", /pizza/],
  [/pizza/, "Rising-crust pizza (12 in.)", /digiorno/, /thin/],
  [/pizza/, "Thin-crust pizza (12 in.)", null, /dough|sauce|seasoning|crust only|pizza crusts?$/],

  // Handhelds
  [/breakfast burrito/, "Breakfast burrito"],
  [/chimichanga/, "Chimichanga"],
  [/burrito/, "Bean & cheese burrito"],
  [/taquito|rolled tacos?/, "Taquitos"],
  [/mini corn ?dogs?|corn ?dog (bites|nuggets)/, "Mini corn dogs"],
  [/corn ?dogs?/, "Corn dogs"],
  [/pigs? in (a )?blankets?|franks in/, "Pigs in a blanket"],
  [/empanada|jamaican (beef )?patt/, "Empanadas"],
  [/tamale/, "Tamales"],
  [/quesadilla/, "Quesadillas"],
  [/uncrustable|crustless sandwich/, "PB&J crustless sandwich"],
  [/chicken bake/, "Chicken bakes"],
  [/pupusa/, "Pupusas"],
  [/sliders?|cheeseburgers?\b/, "Microwave cheeseburgers", null, /patt/],

  // Breakfast
  [/waffle (fries|fry|cut)/, "Waffle fries"],
  [/waffle/, "Frozen waffles"],
  [/pancake/, "Frozen pancakes"],
  [/french toast/, "French toast sticks"],
  [/breakfast (sandwich|biscuit|croissant|muffin)|egg.*(muffin|sandwich)|(croissant|biscuit|muffin) sandwich/, "Breakfast sandwich"],
  [/breakfast bowl|scramble/, "Breakfast bowl"],
  [/egg bites?/, "Egg bites"],
  [/(sausage|breakfast) patt/, "Sausage patties (fully cooked)"],
  [/sausage links?|breakfast sausage|brown .?n.? serve/, "Sausage links (fully cooked)"],
  [/shredded (hash|potato)/, "Shredded hash browns (bag)"],
  [/hash ?browns?/, "Hash brown patties"],
  [/toaster (strudel|pastr)/, "Toaster pastries (frozen)"],
  [/croissant/, "Croissants (frozen, unbaked)"],
  [/biscuit/, "Biscuits (frozen, unbaked)"],
  [/bagel/, "Bagels (frozen)"],
  // Heat-and-eat sandwiches on a bun
  [/sandwich|on a .*bun/, "Microwave cheeseburgers"],

  // Specific meals
  [/pot pie/, "Chicken pot pie (10 oz)"],
  [/shepherd|cottage pie/, "Shepherd's pie"],
  [/lasagn/, "LASAGNA"],
  [/mac(aroni)?\s*(&|and|n'?|'n'?)\s*cheese|mac.?n.?cheese/, "MAC"],
  [/enchilada/, "Enchiladas (tray)"],
  [/stuffed peppers?/, "Stuffed peppers"],
  [/skillet|voila|for two/, "Skillet meal (24 oz bag)"],
  [/orange chicken|general tso|sesame chicken|mandarin chicken|kung pao|honey walnut|teriyaki chicken|sweet (&|and) sour chicken/, "Orange chicken"],
  [/fried rice/, "Fried rice (bag)"],
  [/lo mein|yakisoba|chow mein|noodles?.*stir|stir.?fry noodle|ramen|udon|pad thai|japchae/, "Lo mein / stir-fry noodles (bag)"],
  [/tikka|masala|curry|korma|vindaloo|paneer|biryani|\bdal\b|saag|chana/, "Indian curry meal"],
  [/\bsoup\b|\bstew\b|bisque|chowder/, "Frozen soup"],
  [/bulgogi/, "Korean beef bulgogi"],

  // Plant-based (checked before meat and chicken)
  [/nugget|tender|strip|bites|patty|patties|burger|crumble|grounds|falafel/, "PLANT", PLANT],
  [/falafel/, "Falafel"],

  // Breaded chicken
  [/kiev|cordon bleu|stuffed chicken|chicken.*stuffed|stuffed.*chicken breast/, "Stuffed chicken breast (raw)"],
  [/popcorn chicken/, "Popcorn chicken"],
  [/boneless (wings?|bites)|wing bites/, "Boneless wings (breaded)"],
  [/\bwings?\b|drumettes?|wingettes?/, "Chicken wings (fully cooked, sauced)", /chicken|wing/],
  [/nuggets?/, "Chicken nuggets (breaded)"],
  [/grilled.*(strips|chicken)|fajita chicken|chicken breast strips|diced chicken|chicken breast chunks/, "Grilled chicken strips (fully cooked)"],
  [/chicken patt/, "Breaded chicken patties"],
  [/tenders?|strips?|fingers?|chicken fries|(breaded|crispy|battered).*chicken breast/, "Chicken tenders / strips (breaded)", /chicken/],
  [/chicken patt/, "Breaded chicken patties"],

  // Breaded seafood
  [/fish sticks?|fish fingers?/, "Fish sticks"],
  [/(battered|breaded|crispy|crunchy|beer.?batter|panko).*(fish|cod|pollock|haddock|tilapia|fillet)|fish fillets?/, "Breaded fish fillets"],
  [/coconut shrimp/, "Coconut shrimp"],
  [/tempura/, "Shrimp tempura", /shrimp/],
  [/(popcorn|breaded|butterfl|crispy|crunchy|panko|battered).*shrimp/, "Breaded shrimp"],

  // Single-serve dinners from the big frozen-meal brands
  [/bowl/, "Rice or noodle bowl", DINNER_BRANDS],
  [/./, "Single-serve frozen dinner", DINNER_BRANDS],
  [/bowl/, "Rice or noodle bowl"],

  // Plain chicken, meat, seafood
  [/chicken breasts?|chicken thighs?|chicken tenderloins?/, "Chicken breasts (raw, boneless)"],
  [/turkey burger/, "Turkey burgers (raw)"],
  [/burger|hamburger|beef patt/, "Beef burger patties (raw, ¼ lb)"],
  [/meatballs?/, "Meatballs (fully cooked)"],
  [/\bribs?\b|baby back/, "BBQ ribs (fully cooked)"],
  [/ground beef/, "Ground beef (1 lb, frozen)"],
  [/cooked shrimp|shrimp ring|cocktail shrimp|shrimp cocktail/, "Shrimp (cooked, cocktail)"],
  [/shrimp|prawns?/, "Shrimp (raw, peeled)"],
  [/salmon/, "Salmon fillets (raw)"],
  [/\bahi\b|tuna steak|yellowfin/, "Ahi tuna steaks"],
  [/lobster/, "Lobster tails (raw)"],
  [/crab cakes?/, "Crab cakes"],
  [/crab/, "Crab legs (pre-cooked)"],
  [/scallops?/, "Sea scallops (raw)"],
  [/\bcod\b|tilapia|pollock|haddock|swai|mahi|halibut|white ?fish|flounder|\bsole\b|catfish|basa|branzino|trout/, "White fish fillets (raw)"],

  // Appetizers
  [/mozzarella sticks?|cheese sticks?/, "Mozzarella sticks"],
  [/poppers?|stuffed jalape/, "Jalapeño poppers"],
  [/onion rings?/, "Onion rings"],
  [/egg rolls?/, "Egg rolls"],
  [/spring rolls?/, "Mini spring rolls"],
  [/soup dumplings?|xiao long|\bxlb\b/, "Soup dumplings"],
  [/shu.?mai|siu mai/, "Shumai"],
  [/potstickers?|gyoza|dumplings?|mandu|wontons?/, "Potstickers / gyoza"],
  [/\bbao\b|steamed buns?/, "Bao buns (filled)"],
  [/samosa/, "Samosas"],
  [/pretzel/, "Soft pretzels"],
  [/quiche/, "Mini quiches"],
  [/spanakopita|spinach.*(feta|pie|triangles)/, "Spanakopita"],
  [/(mini|snack|street) tacos?/, "Mini tacos"],
  [/potato skins?/, "Potato skins"],
  [/\bdip\b/, "Spinach artichoke dip", /spinach|artichoke/],

  // Potatoes
  [/sweet potato (fries|fry|cut)/, "Sweet potato fries"],
  [/curly/, "Curly fries", /fries|fry|potato/],
  [/crinkle/, "Crinkle-cut fries", /fries|fry|potato/],
  [/shoestring|thin.cut fr|skinny fr/, "Shoestring fries"],
  [/steak fries|wedges?/, "Steak fries / potato wedges"],
  [/\btots?\b|tater|potato puffs|crowns/, "Tater tots"],
  [/fries|french fried|potato (sticks|strips)|straight cut/, "French fries (straight cut)"],
  [/mashed/, "Mashed potatoes"],
  [/twice baked|stuffed potato/, "Twice-baked potatoes"],

  // Baked desserts
  [/cream pie|meringue pie|silk pie/, "Cream pie"],
  [/\bpies?\b|cobbler/, "Fruit pie (unbaked, 9 in.)"],
  [/cookies?\b/, "Cookie dough (pre-portioned)"],
  [/churros?/, "Churros"],

  // Breads
  [/garlic (bread|toast|knots)/, "Garlic bread (loaf halves)"],
  [/texas toast/, "Texas toast"],
  [/rolls?\b.*dough|dinner rolls?|yeast rolls?/, "Dinner rolls (frozen dough)"],
  [/puff pastry/, "Puff pastry sheets"],
  [/pie (crust|shell)/, "Pie crust shells"],
  [/\bnaan\b/, "Naan"],

  // Vegetables
  [/steam(able|fresh|ers?|.in)/, "Steam-in-bag vegetables", /veg|broccoli|beans|peas|corn|carrot|cauliflower|medley|blend|asparagus|spinach|squash|edamame|sprouts/],
  [/riced (cauliflower|broccoli|veg)|cauliflower rice/, "Riced cauliflower"],
  [/broccoli/, "Broccoli florets"],
  [/cauliflower/, "Cauliflower florets"],
  [/green beans?|haricots?|string beans/, "Green beans"],
  [/\bpeas\b|lima beans/, "Peas", null, /chick ?peas/],
  [/corn on the cob|cobs?\b|cobbettes?/, "Corn on the cob"],
  [/\bcorn\b/, "Corn kernels"],
  [/stir.?fry/, "Stir-fry vegetable blend"],
  [/mixed vegetables|vegetable medley|mixed veg|vegetable blend|california blend|normandy|winter blend/, "Mixed vegetables"],
  [/brussels/, "Brussels sprouts"],
  [/spinach|kale|collard/, "Chopped spinach (10 oz box)"],
  [/edamame|soybeans/, "Edamame (in pods)"],
  [/butternut|squash|zucchini|sweet potato/, "Butternut squash cubes"],
  [/peppers?.*onions?|fajita veg|pepper strips|chopped onions?|diced onions?|seasoning blend/, "Pepper & onion strips"],
  [/carrots?/, "Carrots (sliced)"],
  [/asparagus/, "Asparagus spears"],
  [/okra/, "Breaded okra"],

  // Fruit
  [/acai|pitaya|dragon ?fruit/, "Acai or pitaya packs"],
  [/mango|pineapple|tropical|papaya/, "Mango or pineapple chunks"],
  [/berr|cherr|peach|fruit|grapes?|banana|smoothie/, "Mixed berries", null, /juice|concentrate|lemonade|punch/]
];

function sizeOz(q) {
  if (!q) return 0;
  const s = q.toLowerCase();
  let m = s.match(/([\d.]+)\s*oz/); if (m) return +m[1];
  m = s.match(/([\d.]+)\s*lbs?/); if (m) return +m[1] * 16;
  m = s.match(/([\d.]+)\s*kg/); if (m) return +m[1] * 35.27;
  m = s.match(/([\d.]+)\s*g\b/); if (m) return +m[1] / 28.35;
  return 0;
}

function matchType(name, brand, qty) {
  const text = (name + " " + brand).toLowerCase();
  if (/uncrustables/.test(text)) return "PB&J crustless sandwich";
  const nm = name.toLowerCase();
  for (const [re, type, also, not] of RULES) {
    if (!re.test(nm)) continue;
    if (also && !also.test(text)) continue;
    if (not && not.test(nm)) continue;
    if (type === "LASAGNA") return sizeOz(qty) >= 24 ? "Lasagna, family size (38–40 oz)" : "Lasagna, single serve (10 oz)";
    if (type === "MAC") return sizeOz(qty) >= 24 ? "Macaroni & cheese, family size" : "Macaroni & cheese, single serve";
    if (type === "PLANT") {
      if (/burger|patt/.test(nm)) return "Veggie burger patties";
      if (/crumble|grounds/.test(nm)) return "Meatless crumbles";
      if (/falafel/.test(nm)) return "Falafel";
      return "Plant-based nuggets";
    }
    return type;
  }
  return null;
}

/* ---------- store names: merge spellings of the same chain ---------- */
const STORE_ALIASES = [
  [/^whole ?foods/, "Whole Foods"], [/^trader ?joe/, "Trader Joe's"], [/^wal.?mart/, "Walmart"], [/^target/, "Target"],
  [/^costco/, "Costco"], [/^sam.?s( club)?$/, "Sam's Club"], [/^bj.?s/, "BJ's"], [/^cvs/, "CVS"], [/^walgreen/, "Walgreens"],
  [/^rite ?aid/, "Rite Aid"], [/^duane reade/, "Duane Reade"], [/^safeway/, "Safeway"], [/^vons/, "Vons"], [/^albertson/, "Albertsons"],
  [/^sprouts/, "Sprouts"], [/^kroger/, "Kroger"], [/^ralphs/, "Ralphs"], [/^fred meyer/, "Fred Meyer"], [/^king soopers/, "King Soopers"],
  [/^smith.?s/, "Smith's"], [/^fry.?s/, "Fry's"], [/^harris teeter/, "Harris Teeter"], [/^publix/, "Publix"], [/^h.?e.?b\b/, "H-E-B"],
  [/^aldi/, "Aldi"], [/^lidl/, "Lidl"], [/^meijer/, "Meijer"], [/^hy.?vee/, "Hy-Vee"], [/^wegmans/, "Wegmans"], [/^giant eagle/, "Giant Eagle"],
  [/^giant\b/, "Giant"], [/^food lion/, "Food Lion"], [/^stop ?(&|and) ?shop/, "Stop & Shop"], [/^shop ?rite/, "ShopRite"],
  [/^jewel/, "Jewel-Osco"], [/^winco/, "WinCo"], [/^smart ?(&|and) ?final/, "Smart & Final"], [/^save mart/, "Save Mart"],
  [/^food ?4 ?less/, "Food 4 Less"], [/^winn.?dixie/, "Winn-Dixie"], [/^piggly/, "Piggly Wiggly"], [/^market basket/, "Market Basket"],
  [/^hannaford/, "Hannaford"], [/^acme/, "Acme"], [/^shaw.?s/, "Shaw's"], [/^tom thumb/, "Tom Thumb"], [/^randalls/, "Randalls"],
  [/^pavilions/, "Pavilions"], [/^dollar general/, "Dollar General"], [/^dollar tree/, "Dollar Tree"], [/^family dollar/, "Family Dollar"],
  [/^7.?eleven/, "7-Eleven"], [/^natural grocers/, "Natural Grocers"], [/^the fresh market/, "The Fresh Market"], [/^fresh thyme/, "Fresh Thyme"],
  [/^amazon fresh/, "Amazon Fresh"], [/^amazon/, "Amazon"], [/^instacart/, "Instacart"], [/^grocery outlet/, "Grocery Outlet"],
  [/^99 ranch/, "99 Ranch"], [/^h ?mart/, "H Mart"], [/^weis/, "Weis"], [/^schnucks/, "Schnucks"], [/^raley/, "Raley's"],
  [/^stater bros/, "Stater Bros."], [/^food city/, "Food City"], [/^ingles/, "Ingles"], [/^lowes foods/, "Lowes Foods"]
];
const KIND = {
  "Costco": "Warehouse clubs", "Sam's Club": "Warehouse clubs", "BJ's": "Warehouse clubs",
  "CVS": "Drugstores & convenience", "Walgreens": "Drugstores & convenience", "Rite Aid": "Drugstores & convenience",
  "Duane Reade": "Drugstores & convenience", "7-Eleven": "Drugstores & convenience", "Dollar General": "Drugstores & convenience",
  "Dollar Tree": "Drugstores & convenience", "Family Dollar": "Drugstores & convenience",
  "Amazon": "Online", "Amazon Fresh": "Online", "Instacart": "Online"
};
// Store brands only sell at their own chain, so the brand tells us the store even when nobody recorded one.
const STORE_BRANDS = [
  [/^kirkland/, ["Costco"]],
  [/^365|whole foods/, ["Whole Foods"]],
  [/^signature (select|cafe|kitchens)|^o organics|^open nature|^waterfront bistro|^lucerne|^safeway|^value corner/, ["Safeway", "Vons", "Albertsons"]],
  [/^sprouts/, ["Sprouts"]],
  [/^simple truth|^private selection|^kroger/, ["Kroger", "Ralphs", "Fred Meyer", "King Soopers"]],
  [/^great value|^sam'?s choice|^marketside/, ["Walmart"]],
  [/^member'?s mark/, ["Sam's Club"]],
  [/^good (&|and) gather|^market pantry|^favorite day|^archer farms/, ["Target"]],
  [/^trader joe/, ["Trader Joe's"]],
  [/^cvs|^gold emblem/, ["CVS"]],
  [/^nice!?$|^walgreens/, ["Walgreens"]],
  [/^publix/, ["Publix"]],
  [/^h-?e-?b|^hill country fare|^central market/, ["H-E-B"]],
  [/^wegmans/, ["Wegmans"]],
  [/^meijer|^true goodness/, ["Meijer"]],
  [/^market basket/, ["Market Basket"]],
  [/^season'?s choice|^mama cozzi|^bremer|^kirkwood|^specially selected|^simply nature|^never any|^sundae shoppe|^northern catch|^fremont fish/, ["Aldi"]],
  [/^hy-?vee/, ["Hy-Vee"]],
  [/^giant eagle|^market district/, ["Giant Eagle"]],
  [/^food lion/, ["Food Lion"]],
  [/^harris teeter/, ["Harris Teeter"]],
  [/^wild harvest|^shoprite|^bowl (&|and) basket/, ["ShopRite"]],
  [/^stop (&|and) shop|^nature'?s promise/, ["Stop & Shop", "Giant"]]
];
function storesFromBrand(brand) {
  const b = brand.toLowerCase();
  for (const [re, list] of STORE_BRANDS) if (re.test(b)) return list;
  return [];
}
const NOT_STORES =/^(none|unknown|n\/?a|-|\d+|usa|united states|us|online|supermarket|grocery|store)$/;

function titleCase(s) { return s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/'S\b/g, "'s"); }
function canonStore(raw) {
  const s = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!s || NOT_STORES.test(s) || s.length > 40) return null;
  for (const [re, name] of STORE_ALIASES) if (re.test(s)) return name;
  return titleCase(s);
}
function tidy(s) {
  s = (s || "").replace(/\s+/g, " ").trim();
  if (s && s === s.toUpperCase() && /[A-Z]/.test(s)) s = titleCase(s);
  return s;
}

/* ---------- read the export ---------- */
async function openExport() {
  const local = process.argv[2];
  if (local) return fs.createReadStream(local).pipe(zlib.createGunzip());
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(EXPORT_URL, { headers: { "User-Agent": "BackOfTheBox/1.0 (github.com/wckdby/back-of-the-box)" } });
    if (res.ok) return Readable.fromWeb(res.body).pipe(zlib.createGunzip());
    console.error(`Download failed (HTTP ${res.status}), attempt ${attempt}`);
    await new Promise((r) => setTimeout(r, 30000 * attempt));
  }
  throw new Error("Could not download the Open Food Facts export");
}

const t0 = Date.now();
const rl = readline.createInterface({ input: await openExport(), crlfDelay: Infinity });
let col = null, rows = 0, frozen = 0;
const byKey = new Map();
const unmatched = new Map();

for await (const line of rl) {
  if (!col) { col = Object.fromEntries(line.split("\t").map((h, i) => [h, i])); continue; }
  rows++;
  if (!line.includes("en:frozen-foods") || !line.includes("en:united-states")) continue;
  const f = line.split("\t");
  if (!f[col.categories_tags].split(",").includes("en:frozen-foods")) continue;
  if (!f[col.countries_tags].split(",").includes("en:united-states")) continue;
  frozen++;
  const name = tidy(f[col.product_name]);
  const brand = tidy((f[col.brands] || "").split(",")[0]);
  if (!name || !brand || name.length < 3) continue;
  const qty = tidy(f[col.quantity]).slice(0, 40);
  const type = matchType(name, brand, qty);
  if (!type) { const k = name.toLowerCase(); unmatched.set(k, (unmatched.get(k) || 0) + 1); continue; }
  if (!TYPES.has(type)) throw new Error(`Rule points at unknown product type: ${type}`);
  const stores = [...new Set([...(f[col.stores] || "").split(",").map(canonStore).filter(Boolean), ...storesFromBrand(brand)])];
  const img = (f[col.image_small_url] || "").startsWith(IMG_PREFIX) ? f[col.image_small_url].slice(IMG_PREFIX.length) : "";
  const modified = +f[col.last_modified_t] || 0;
  const key = (brand + "|" + name).toLowerCase().replace(/[^a-z0-9|]+/g, " ").trim();
  const prev = byKey.get(key);
  if (!prev) byKey.set(key, { code: f[col.code], brand, name, type, stores, qty, img, modified });
  else {
    prev.stores = [...new Set([...prev.stores, ...stores])];
    if (modified > prev.modified) Object.assign(prev, { code: f[col.code], qty: qty || prev.qty, img: img || prev.img, modified, type });
  }
}

/* ---------- stores: keep chains that show up on enough frozen products ---------- */
const storeCount = new Map();
for (const p of byKey.values()) for (const s of p.stores) storeCount.set(s, (storeCount.get(s) || 0) + 1);
const stores = [...storeCount].filter(([, n]) => n >= MIN_STORE_PRODUCTS).sort((a, b) => b[1] - a[1])
  .map(([name, count]) => ({ name, kind: KIND[name] || "Grocery", count }));
const storeIdx = new Map(stores.map((s, i) => [s.name, i]));

const types = [...new Set([...byKey.values()].map((p) => p.type))].sort();
const typeIdx = new Map(types.map((t, i) => [t, i]));
const items = [...byKey.values()]
  .sort((a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name))
  .map((p) => [p.code, p.brand, p.name, typeIdx.get(p.type), p.stores.map((s) => storeIdx.get(s)).filter((i) => i !== undefined), p.qty, p.img]);

/* ---------- write only when the product list actually changed ---------- */
const outPath = path.join(ROOT, "data", "products.json");
const body = { source: "Open Food Facts (openfoodfacts.org), ODbL 1.0", stores, types, items };
let old = null;
try { old = JSON.parse(fs.readFileSync(outPath, "utf8")); } catch {}
const changed = !old || JSON.stringify({ ...old, updated: undefined }) !== JSON.stringify({ ...body, updated: undefined });

console.log(`Scanned ${rows.toLocaleString()} products, ${frozen.toLocaleString()} US frozen, kept ${items.length.toLocaleString()} brand-name items in ${types.length} types, ${stores.length} stores. ${Math.round((Date.now() - t0) / 1000)}s`);
console.log("Most common unmatched names:", [...unmatched].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, n]) => `${k} (${n})`).join(", "));

if (!changed) { console.log("No changes."); process.exit(0); }
const out = { updated: new Date().toISOString(), ...body };
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out));
// Same data as a script, so the desktop app has a built-in copy when it starts offline.
fs.writeFileSync(path.join(ROOT, "data", "products.js"), "window.BOTB_PRODUCTS=" + JSON.stringify(out) + ";\n");
console.log(`Wrote ${outPath} (${Math.round(fs.statSync(outPath).size / 1024)} KB)`);
