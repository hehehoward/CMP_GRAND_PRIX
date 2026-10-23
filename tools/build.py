"""Build the two single-file pages from src/.  Run:  python tools/build.py
Outputs index.html (players) and host.html (host screen) at the repo root."""
import pathlib
R=pathlib.Path(__file__).resolve().parent.parent; S=R/'src'
def js(p): return '<script>\n'+p.read_text(encoding='utf-8')+'\n</script>'
sim=js(S/'sim.js')+'\n'+js(S/'sfx.js')+'\n'+js(S/'cloud.js')
three=js(R/'vendor/three.min.js')+'\n'+js(S/'car3d.js')
qr=js(R/'vendor/qrcode.js')
for a,w in [('garage.html','index.html'),('racecontrol.html','host.html')]:
    t=(S/a).read_text(encoding='utf-8').replace('/*__THREE__*/',three).replace('/*__QR__*/',qr).replace('/*__SIM__*/',sim)
    t=t.replace('var NOID=false;','var NOID=true;')
    (R/w).write_text(t,encoding='utf-8'); print('built',w)
