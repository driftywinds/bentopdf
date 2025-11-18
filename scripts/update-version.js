#!/usr/bin/env node

/**
 * Script to update version numbers in HTML files from package.json
 * Run this script whenever you need to sync HTML versions with package.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read version from package.json
const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
);
const version = packageJson.version;

// HTML files to update
const htmlFiles = [
  'index.html',
  'about.html',
  'contact.html',
  'faq.html',
  'privacy.html',
  'terms.html',
  'src/pages/add-stamps.html',
  'src/pages/bookmark.html',
  'src/pages/json-to-pdf.html',
  'src/pages/pdf-multi-tool.html',
  'src/pages/pdf-to-json.html',
  'src/pages/table-of-contents.html',
];

console.log(`Updating version to ${version} in HTML files...`);

let updatedCount = 0;

htmlFiles.forEach((file) => {
  const filePath = path.join(__dirname, '..', file);
  
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  Skipping ${file} (not found)`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace version in <span id="app-version">X.X.X</span>
  const regex = /(<span id="app-version">)[^<]+(<\/span>)/g;
  const newContent = content.replace(regex, `$1${version}$2`);
  
  if (content !== newContent) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log(`✓ Updated ${file}`);
    updatedCount++;
  } else {
    console.log(`- ${file} (already up to date)`);
  }
});

console.log(`\nDone! Updated ${updatedCount} file(s) to version ${version}`);
