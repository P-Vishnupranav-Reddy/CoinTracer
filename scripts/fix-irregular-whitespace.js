#!/usr/bin/env node
/**
 * Fix irregular whitespace in exchange.controller.js
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'exchange-connections-service', 'controllers', 'exchange.controller.js');

console.log('Reading file...');
let content = fs.readFileSync(filePath, 'utf8');

// Replace irregular whitespace: non-breaking space, zero-width, BOM, etc.
const irregularWhitespaceRegex = /[\u00A0\u1680\u180E\u2000-\u200B\u2028\u2029\u202F\u205F\u3000\uFEFF]/g;
content = content.replace(irregularWhitespaceRegex, ' ');

// Replace tabs inside comment-only lines
content = content.replace(/^([ \t]*(?:\/\/|\/\*|\*))/gm, (match) => {
  return match.replace(/\t/g, '  ');
});

console.log('Writing fixed file...');
fs.writeFileSync(filePath, content, 'utf8');
console.log('Done! Irregular whitespace fixed.');
