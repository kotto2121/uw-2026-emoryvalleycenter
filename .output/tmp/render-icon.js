// Renders the Greenhouse logo SVG to PNG icons using headless Electron.
const { app } = require("electron");
const path = require("path");
const fs = require("fs");

const BRAND = { ring: "#1f5c4a", leaf1: "#7cb342", leaf2: "#1f5c4a" };

const svg = (bg) => `
<svg width="1024" height="1024" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  ${bg ? `<rect width="100" height="100" rx="18" fill="${bg}"/>` : ""}
  <circle cx="50" cy="50" r="45" fill="none" stroke="${BRAND.ring}" strokeWidth="6"/>
  <path d="M50 78 V44" stroke="${BRAND.ring}" strokeWidth="6" strokeLinecap="round"/>
  <path d="M49 52 C36 52 26 44 25 30 C38 30 48 38 49 52 Z" fill="${BRAND.leaf1}"/>
  <path d="M51 46 C52 31 62 22 77 22 C76 37 66 46 51 46 Z" fill="${BRAND.leaf2}"/>
</svg>`;

app.whenReady().then(async () => {
  const { nativeImage } = require("electron");
  const ROOT = "/Users/haseebqureshi/Code/emoryvalley";
  const targets = [
    { file: path.join(ROOT, "build", "icon.png"), bg: "#f6f5f0" },
    { file: path.join(ROOT, "electron", "assets", "icon.png"), bg: null },
  ];
  const { BrowserWindow } = require("electron");
  const win = new BrowserWindow({ show: false, width: 1024, height: 1024 });
  const html = `<!doctype html><body style="margin:0">
    <img id="i" width="1024" height="1024">
  </body>`;
  await win.loadFile(path.join(__dirname, "icon-blank.html"));
  for (const t of targets) {
    const dataUrl = await win.webContents.executeJavaScript(`new Promise((res) => {
      const img = document.getElementById('i');
      img.src = 'data:image/svg+xml;base64,${Buffer.from(svg(t.bg)).toString("base64")}';
      img.decode().then(() => {
        const c = document.createElement('canvas'); c.width = 1024; c.height = 1024;
        c.getContext('2d').drawImage(img, 0, 0, 1024, 1024);
        res(c.toDataURL('image/png'));
      });
    })`);
    const png = nativeImage.createFromDataURL(dataUrl);
    fs.writeFileSync(t.file, png.toPNG());
    console.log("wrote", t.file, png.getSize().width + "x" + png.getSize().height);
  }
  win.destroy();
  app.exit(0);
});
