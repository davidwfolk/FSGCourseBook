async function getRepo() {
  const res = await fetch('https://api.github.com/repos/davidwfolk/FSG-Greens-Book/contents', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const data = await res.json();
  console.log(data.map(f => ({ name: f.name, type: f.type, download_url: f.download_url })));
}
getRepo();
