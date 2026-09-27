import urllib.request
import re
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
url = "https://wallpapercave.com/frutiger-aqua-wallpapers"

req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req, context=ctx) as resp:
        html = resp.read().decode('utf-8')
        matches = re.findall(r'src="(https://wallpapercave\.com/wp/[^"]+)"', html)
        print("Found wallpapers:")
        for m in matches[:10]:
            print(" ->", m)
except Exception as e:
    print("Error:", e)
