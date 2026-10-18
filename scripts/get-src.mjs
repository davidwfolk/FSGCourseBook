async function getSrc() {
  const res = await fetch('https://api.github.com/repos/davidwfolk/FSG-Greens-Book/contents/src', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const data = await res.json();
  console.log(data.map(f => ({ name: f.name, download_url: f.download_url })));
}
getSrc();
