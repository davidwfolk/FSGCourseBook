import fs from 'fs';

const content = fs.readFileSync('tour_yardage_book_studio.html', 'utf8');
const splitIdx = content.indexOf('<script>');
if (splitIdx === -1) {
  throw new Error('<script> tag not found in tour_yardage_book_studio.html');
}

const htmlPart = content.slice(0, splitIdx);
const indexHtml = htmlPart + '  <script type="module" src="/src/main.ts"></script>\n</body>\n</html>\n';

fs.writeFileSync('index.html', indexHtml, 'utf8');
console.log('Successfully created index.html. Total length:', indexHtml.length);
