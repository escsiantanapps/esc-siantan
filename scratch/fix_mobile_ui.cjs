const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../src/pages/admin');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsx'));

let changedCount = 0;

for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // We want to turn <div className="grid grid-cols-2 gap-3"> into <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
  const original = content;
  content = content.replace(/(className="[^"]*\bgrid\b[^"]*)\bgrid-cols-2\b/g, '$1grid-cols-1 sm:grid-cols-2');
  content = content.replace(/(className="[^"]*\bgrid\b[^"]*)\bgrid-cols-3\b/g, '$1grid-cols-1 sm:grid-cols-3');
  content = content.replace(/(className="[^"]*\bgrid\b[^"]*)\bgrid-cols-4\b/g, '$1grid-cols-2 sm:grid-cols-4');
  
  if (original !== content) {
    fs.writeFileSync(filePath, content, 'utf8');
    changedCount++;
    console.log(`Updated ${file}`);
  }
}

console.log(`Finished updating ${changedCount} files for mobile responsiveness.`);
