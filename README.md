# Back of the Box

A searchable guide to frozen foods from grocery stores (Safeway, Vons, Whole Foods, Sprouts), Costco and drugstores (CVS, Walgreens).

- Search by product or brand name
- Enter how much you're making and the cooking times scale to that amount
- Pick a cooking method (microwave, oven, air fryer, stovetop, grill, Instant Pot and more) or see every method that works

Times are typical ranges for each type of product. If your package gives different directions, follow the package.

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
