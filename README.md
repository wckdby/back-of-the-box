# Back of the Box

A searchable guide to frozen foods from grocery stores (Safeway, Vons, Whole Foods, Sprouts), Costco and drugstores (CVS, Walgreens).

- Search by product or brand name
- Enter how much you're making and the cooking times scale to that amount
- Pick a cooking method (microwave, oven, air fryer, stovetop, grill, Instant Pot and more) or see every method that works

Times are typical ranges for each type of product. If your package gives different directions, follow the package.

## Brand-name products update themselves

About 11,000 brand-name frozen products, and the stores that carry them, come from [Open Food Facts](https://world.openfoodfacts.org).
Every Monday a GitHub Action ([update-products.yml](.github/workflows/update-products.yml)) downloads the Open Food Facts daily export,
keeps US frozen foods, matches each product to one of the app's product types for cooking times, and commits `data/products.json` if anything changed.

- The website and phone app pick up the new list automatically.
- The Windows app downloads the latest list each time it starts, and falls back to its built-in copy when offline.
- To update right away: GitHub → **Actions** → **Update brand-name products** → **Run workflow**, or run `npm run update-products` locally.

Product data is © Open Food Facts contributors, licensed under the ODbL (see [data/LICENSE.md](data/LICENSE.md)).

## Use it

- **Web / phone:** https://wckdby.github.io/back-of-the-box/
  - iPhone: open in Safari → Share → **Add to Home Screen**
  - Android: open in Chrome → menu → **Install app**
  - Works offline after the first visit.
- **Windows 11:** download `BackOfTheBox-<version>-portable.exe` from [Releases](https://github.com/wckdby/back-of-the-box/releases) and double-click it. No install needed. Windows SmartScreen may warn because the app isn't code-signed: click **More info** → **Run anyway**.

## Build the Windows app

Requires Node.js.

```
npm install
npm start          # run it
npm run build:win  # creates dist/BackOfTheBox-<version>-portable.exe
```

When you change files, bump `VERSION` in `sw.js` so installed phone apps pick up the update.
