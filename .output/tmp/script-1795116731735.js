import subprocess, shutil, sys
# Prefer rsvg-convert / inkscape / cairosvg; fallback to qlmanage? Try python cairosvg first.
svg = '''<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="185" fill="#1e3a26"/>
  <circle cx="512" cy="512" r="330" fill="none" stroke="#ffffff" stroke-width="46"/>
  <line x1="512" y1="842" x2="512" y2="430" stroke="#ffffff" stroke-width="42" stroke-linecap="round"/>
  <!-- leaves: teardrops branching from top of stem -->
  <path d="M 512 470
           C 512 330, 430 260, 300 270
           C 300 400, 400 480, 512 470 Z" fill="#9ccc65"/>
  <path d="M 512 470
           C 512 330, 594 260, 724 270
           C 724 400, 624 480, 512 470 Z" fill="#9ccc65"/>
</svg>'''
open('/tmp/icon.svg','w').write(svg)

def try_cmds():
    for cmd in [['rsvg-convert','-w','1024','-h','1024','/tmp/icon.svg','-o','/tmp/icon_out.png'],
                ['inkscape','/tmp/icon.svg','-w','1024','-o','/tmp/icon_out.png'],
                ['qlmanage','-t','-s','1024','-o','/tmp','/tmp/icon.svg']]:
        if shutil.which(cmd[0]):
            r = subprocess.run(cmd, capture_output=True, text=True)
            print(cmd[0], r.returncode, r.stderr[:300])
            if r.returncode == 0: return cmd[0]
    return None
w = try_cmds()
print("used:", w)
try:
    import cairosvg
    cairosvg.svg2png(url='/tmp/icon.svg', write_to='/tmp/icon_out.png', output_width=1024, output_height=1024)
    print("used: cairosvg")
except Exception as e:
    print("cairosvg:", e)
