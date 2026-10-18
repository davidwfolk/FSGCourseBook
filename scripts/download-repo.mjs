import fs from 'fs';

async function downloadFiles() {
  const files = ['src/plotter.py', 'implementation_plan.md', 'backup_plotter.py', 'main.py'];
  for (const f of files) {
    const url = `https://raw.githubusercontent.com/davidwfolk/FSG-Greens-Book/main/${f}`;
    const res = await fetch(url);
    const text = await res.text();
    const localPath = `scripts/${f.replace(/\//g, '_')}`;
    fs.writeFileSync(localPath, text);
    console.log(`Downloaded ${f} -> ${localPath} (${text.length} chars)`);
  }
}

downloadFiles();
