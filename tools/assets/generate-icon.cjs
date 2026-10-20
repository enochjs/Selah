const path = require("node:path");
const sharp = require("sharp");
(async () => {
  await sharp(path.resolve(__dirname, "../../apps/app/assets/icon.svg"))
    .resize(1024, 1024)
    .png()
    .toFile(path.resolve(__dirname, "../../apps/app/assets/icon.png"));
  await sharp(path.resolve(__dirname, "../../apps/app/assets/icon.svg"))
    .resize(64, 64)
    .png()
    .toFile(path.resolve(__dirname, "../../apps/app/assets/favicon.png"));
  console.log("Generated Selah icon and favicon from the source SVG.");
})();
