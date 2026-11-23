// Vercel entry point (Express zero-config detects `index.js` + its `require('express')`).
//
// It loads the JavaScript compiled by `npm run build` (tsc → dist/) so Vercel does not
// re-compile the TypeScript sources itself. Local development uses `npm run dev` (src/main.ts).
require('express');

module.exports = require('./dist/serverless').default;
