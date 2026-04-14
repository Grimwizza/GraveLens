const fs = require('fs');
const glob = require('glob');

const mapping = {
  '#1a1917': 'var(--t-stone-900)',
  '#121110': 'var(--t-stone-950)',
  '#242220': 'var(--t-stone-800)',
  '#2e2b28': 'var(--t-stone-700)',
  '#8a8580': 'var(--t-stone-500)',
  '#f5f2ed': 'var(--t-stone-50)'
};

const regex = new RegExp(Object.keys(mapping).join('|'), 'gi');

glob.sync('src/**/*.{ts,tsx,css}').forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;
  
  // Tailwind overrides
  content = content.replace(/bg-\[#121110\]/gi, "bg-stone-950");
  content = content.replace(/bg-\[#1a1917\]/gi, "bg-stone-900");
  content = content.replace(/bg-\[#242220\]/gi, "bg-stone-800");
  content = content.replace(/bg-\[#2e2b28\]/gi, "bg-stone-700");
  content = content.replace(/text-\[#f5f2ed\]/gi, "text-stone-50");
  content = content.replace(/text-\[#8a8580\]/gi, "text-stone-500");
  content = content.replace(/border-\[#2e2b28\]/gi, "border-stone-700");
  
  // Replace direct hex strings but ignore exact tailwind css variable definitions in globals.css
  if (!file.includes('globals.css')) {
      content = content.replace(regex, (match) => mapping[match.toLowerCase()]);
  }
  
  if (content !== original) {
    fs.writeFileSync(file, content);
    console.log('Updated ' + file);
  }
});
