import json
import urllib.request
import urllib.parse
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

search_queries = [
    "Posidonia oceanica underwater",
    "seagrass meadow underwater",
    "Cymodocea nodosa"
]

for sq in search_queries:
    print(f"\n=== Query: {sq} ===")
    search_url = f"https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch={urllib.parse.quote(sq)}&srnamespace=6&format=json"
    req = urllib.request.Request(search_url, headers=headers)
    with urllib.request.urlopen(req, context=ctx) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        results = data.get('query', {}).get('search', [])
        for r in results[:4]:
            title = r['title']
            if not title.lower().endswith(('.jpg', '.jpeg', '.png')):
                continue
            info_url = f"https://commons.wikimedia.org/w/api.php?action=query&titles={urllib.parse.quote(title)}&prop=imageinfo&iiprop=url|size|mime&format=json"
            req2 = urllib.request.Request(info_url, headers=headers)
            with urllib.request.urlopen(req2, context=ctx) as resp2:
                data2 = json.loads(resp2.read().decode('utf-8'))
                pages = data2.get('query', {}).get('pages', {})
                for pid, pdata in pages.items():
                    ii = pdata.get('imageinfo', [{}])[0]
                    url = ii.get('url')
                    width = ii.get('width', 0)
                    height = ii.get('height', 0)
                    print(f"{title} -> {url} ({width}x{height})")
