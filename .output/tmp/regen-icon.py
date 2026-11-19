import subprocess, shutil
svg = '''<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="185" fill="#1e3a26"/>
  <circle cx="512" cy="512" r="330" fill="none" stroke="#ffffff" stroke-width="46"/>
  <line x1="512" y1="880" x2="512" y2="430" stroke="#ffffff" stroke-width="42" stroke-linecap="round"/>
  <path d="M 512 470
           C 512 330, 430 260, 300 270
           C 300 400, 400 480, 512 470 Z" fill="#9ccc65"/>
  <path d="M 512 470
           C 512 330, 594 260, 724 270
           C 724 400, 624 480, 512 470 Z" fill="#9ccc65"/>
</svg>'''
open('/tmp/icon.svg','w').write(svg)
r = subprocess.run(['rsvg-convert','-w','1024','-h','1024','/tmp/icon.svg','-o','/tmp/icon_out.png'], capture_output=True, text=True)
print(r.returncode, r.stderr[:300])
for dest in ['/Users/haseebqureshi/Code/emoryvalley/electron/assets/icon.png','/Users/haseebqureshi/Code/emoryvalley/build/icon.png']:
    shutil.copy('/tmp/icon_out.png', dest)
    print('wrote', dest)
