import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const resourcesDir = join(__dirname, '..', 'resources');
const svgPath = join(resourcesDir, 'icon.svg');
const svgBuffer = readFileSync(svgPath);

// Generate PNGs at various sizes
const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

async function generate() {
  // Generate PNG files
  for (const size of sizes) {
    await sharp(svgBuffer, { density: 300 })
      .resize(size, size)
      .png()
      .toFile(join(resourcesDir, `icon-${size}.png`));
    console.log(`Generated icon-${size}.png`);
  }

  // Main icon.png (256x256 — standard for Electron)
  await sharp(svgBuffer, { density: 300 })
    .resize(256, 256)
    .png()
    .toFile(join(resourcesDir, 'icon.png'));
  console.log('Generated icon.png (256x256)');

  // Tray icon (24x24 for tray, but provide 32x32 for HiDPI)
  await sharp(svgBuffer, { density: 300 })
    .resize(32, 32)
    .png()
    .toFile(join(resourcesDir, 'tray-icon.png'));
  console.log('Generated tray-icon.png (32x32)');

  // Generate ICO (Windows) — manually build ICO from PNG buffers
  const icoSizes = [16, 32, 48, 256];
  const pngBuffers = [];
  for (const size of icoSizes) {
    const buf = await sharp(svgBuffer, { density: 300 })
      .resize(size, size)
      .png()
      .toBuffer();
    pngBuffers.push({ size, buf });
  }

  // Build ICO file manually
  // ICO format: header (6 bytes) + directory entries (16 bytes each) + image data
  const numImages = pngBuffers.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  const dirSize = dirEntrySize * numImages;
  let dataOffset = headerSize + dirSize;

  const totalDataSize = pngBuffers.reduce((acc, p) => acc + p.buf.length, 0);
  const ico = Buffer.alloc(headerSize + dirSize + totalDataSize);

  // Header: reserved(2) + type(2, 1=ICO) + count(2)
  ico.writeUInt16LE(0, 0);
  ico.writeUInt16LE(1, 2);
  ico.writeUInt16LE(numImages, 4);

  let offset = dataOffset;
  for (let i = 0; i < numImages; i++) {
    const { size, buf } = pngBuffers[i];
    const dirOffset = headerSize + i * dirEntrySize;

    ico.writeUInt8(size < 256 ? size : 0, dirOffset);      // width
    ico.writeUInt8(size < 256 ? size : 0, dirOffset + 1);   // height
    ico.writeUInt8(0, dirOffset + 2);                        // color palette
    ico.writeUInt8(0, dirOffset + 3);                        // reserved
    ico.writeUInt16LE(1, dirOffset + 4);                     // color planes
    ico.writeUInt16LE(32, dirOffset + 6);                    // bits per pixel
    ico.writeUInt32LE(buf.length, dirOffset + 8);            // image size
    ico.writeUInt32LE(offset, dirOffset + 12);               // image offset

    buf.copy(ico, offset);
    offset += buf.length;
  }

  writeFileSync(join(resourcesDir, 'icon.ico'), ico);
  console.log('Generated icon.ico');

  console.log('\nAll icons generated successfully!');
}

generate().catch(console.error);
