#!/usr/bin/env node
/**
 * Kiem tra syntax JSX/JS cua App React Native bang @babel/parser.
 * Dung cho CI: node scripts/checkSyntax.js
 */
const fs = require("fs");
const path = require("path");
const { parse } = require("@babel/parser");

const files = [
  "src/App.js",
  "src/api.js",
  "src/parkingMqtt.js",
  "src/constants.js",
  "src/utils.js",
  "src/hooks/useParking.js",
  "src/components/Tabs.js",
];
let failed = 0;

for (const rel of files) {
  const full = path.join(__dirname, "..", rel);
  try {
    const code = fs.readFileSync(full, "utf8");
    parse(code, {
      sourceType: "module",
      plugins: ["jsx", "classProperties", "optionalChaining", "nullishCoalescingOperator"],
    });
    console.log(`[OK] ${rel}`);
  } catch (e) {
    failed += 1;
    console.error(`[FAIL] ${rel}: ${e.message}`);
  }
}

if (failed) {
  console.error(`\n${failed}/${files.length} file co loi syntax`);
  process.exit(1);
}
console.log(`\n${files.length}/${files.length} file syntax OK`);
