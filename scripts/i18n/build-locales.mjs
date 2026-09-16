// Converts src/locales/translations.csv (the file Arko edits directly) into
// one i18next resource JSON per language under src/locales/generated/.
// Runs before `dev` and `build` (see package.json's pre* hooks) and again
// in CI, so a bad CSV fails loudly before it ever reaches a browser.
//
// Wide CSV format - one row per key, one column per language - was chosen
// deliberately over one-file-per-language: it's the shape a non-developer
// editing in a spreadsheet or text editor actually wants (every language
// for a given string sits on the same line), and it's a single file to
// diff in git.
import { parse } from "csv-parse/sync";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CSV_PATH = path.resolve("src/locales/translations.csv");
const OUTPUT_DIR = path.resolve("src/locales/generated");
const SOURCE_LOCALE = "en";

function setDotted(target, dottedKey, value) {
  const parts = dottedKey.split(".");
  let node = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (typeof node[part] !== "object" || node[part] === null) node[part] = {};
    node = node[part];
  }
  node[parts.at(-1)] = value;
}

async function main() {
  const csv = await readFile(CSV_PATH, "utf8");
  const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: false });

  if (rows.length === 0) {
    throw new Error(`${CSV_PATH} has no rows - nothing to build.`);
  }

  const locales = Object.keys(rows[0]).filter((col) => col !== "key");
  if (!locales.includes(SOURCE_LOCALE)) {
    throw new Error(
      `${CSV_PATH} has no "${SOURCE_LOCALE}" column - it is the required source language.`,
    );
  }

  const resources = Object.fromEntries(locales.map((locale) => [locale, {}]));
  const missingSource = [];
  const missingTranslation = {}; // locale -> [key, ...]
  const seenKeys = new Set();

  for (const row of rows) {
    const key = row.key?.trim();
    if (!key) continue;
    if (seenKeys.has(key)) {
      throw new Error(`Duplicate key "${key}" in ${CSV_PATH} - every row must have a unique key.`);
    }
    seenKeys.add(key);

    const sourceValue = row[SOURCE_LOCALE]?.trim();
    if (!sourceValue) {
      missingSource.push(key);
      continue;
    }

    for (const locale of locales) {
      const value = row[locale]?.trim();
      if (value) {
        setDotted(resources[locale], key, value);
      } else if (locale !== SOURCE_LOCALE) {
        (missingTranslation[locale] ??= []).push(key);
        // No fallback baked into the JSON itself - i18next's own
        // fallbackLng (configured in src/lib/i18n.ts) resolves this at
        // runtime, so a later CSV edit that fills the cell in doesn't
        // need this script to remember which keys it had to paper over.
      }
    }
  }

  if (missingSource.length > 0) {
    throw new Error(
      `${missingSource.length} row(s) in ${CSV_PATH} have no "${SOURCE_LOCALE}" text, which is ` +
        `required (every other language falls back to it): ${missingSource.join(", ")}`,
    );
  }

  await mkdir(OUTPUT_DIR, { recursive: true });
  for (const locale of locales) {
    await writeFile(
      path.join(OUTPUT_DIR, `${locale}.json`),
      JSON.stringify(resources[locale], null, 2) + "\n",
      "utf8",
    );
  }

  console.log(
    `i18n: wrote ${locales.length} locale file(s) (${locales.join(", ")}) from ${rows.length} keys.`,
  );
  for (const [locale, keys] of Object.entries(missingTranslation)) {
    console.warn(
      `i18n: ${locale} is missing ${keys.length} translation(s), falling back to ${SOURCE_LOCALE} at ` +
        `runtime: ${keys.join(", ")}`,
    );
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
