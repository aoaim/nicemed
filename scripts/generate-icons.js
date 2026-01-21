/**
 * Generate PNG icons from SVG
 * Run: node generate-icons.js
 */

const fs = require('fs');
const path = require('path');

const ICONS_DIR = path.join(__dirname, '..', 'extension', 'icons');

// Simple 1-bit icon data (manually created pixel art)
// This creates a simple book-like icon

function createPNG(size) {
  // PNG header
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // Create a simple colored square with gradient-ish effect
  const pixels = [];
  for (let y = 0; y < size; y++) {
    const row = [];
    row.push(0); // Filter byte
    for (let x = 0; x < size; x++) {
      // Create gradient from blue to green
      const t = (x + y) / (2 * size);
      const r = Math.floor(74 + (46 - 74) * t);
      const g = Math.floor(144 + (204 - 144) * t);
      const b = Math.floor(217 + (113 - 217) * t);
      
      // Add rounded corners
      const cornerRadius = size * 0.15;
      const distFromCorner = (corner) => {
        const [cx, cy] = corner;
        return Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      };
      
      let alpha = 255;
      const corners = [
        [cornerRadius, cornerRadius],
        [size - 1 - cornerRadius, cornerRadius],
        [cornerRadius, size - 1 - cornerRadius],
        [size - 1 - cornerRadius, size - 1 - cornerRadius]
      ];
      
      if (x < cornerRadius && y < cornerRadius) {
        alpha = distFromCorner(corners[0]) <= cornerRadius ? 255 : 0;
      } else if (x >= size - cornerRadius && y < cornerRadius) {
        alpha = distFromCorner(corners[1]) <= cornerRadius ? 255 : 0;
      } else if (x < cornerRadius && y >= size - cornerRadius) {
        alpha = distFromCorner(corners[2]) <= cornerRadius ? 255 : 0;
      } else if (x >= size - cornerRadius && y >= size - cornerRadius) {
        alpha = distFromCorner(corners[3]) <= cornerRadius ? 255 : 0;
      }
      
      // Draw white book/check symbol in center
      const cx = size / 2;
      const cy = size / 2;
      const bookWidth = size * 0.5;
      const bookHeight = size * 0.55;
      
      // Simple book shape (V-shaped open book)
      const inBook = (
        y >= cy - bookHeight / 2 && 
        y <= cy + bookHeight / 2 &&
        Math.abs(x - cx) <= bookWidth / 2
      );
      
      // Book spine
      const onSpine = Math.abs(x - cx) <= 1;
      
      // Book edges
      const onEdge = (
        (Math.abs(y - (cy - bookHeight / 2)) <= 1 || Math.abs(y - (cy + bookHeight / 2)) <= 1) &&
        Math.abs(x - cx) <= bookWidth / 2
      ) || (
        (Math.abs(x - (cx - bookWidth / 2)) <= 1 || Math.abs(x - (cx + bookWidth / 2)) <= 1) &&
        y >= cy - bookHeight / 2 && y <= cy + bookHeight / 2
      );
      
      if (alpha > 0 && (onSpine || onEdge)) {
        row.push(255, 255, 255, 255); // White
      } else if (alpha > 0) {
        row.push(r, g, b, alpha);
      } else {
        row.push(0, 0, 0, 0); // Transparent
      }
    }
    pixels.push(Buffer.from(row));
  }
  
  const rawData = Buffer.concat(pixels);
  
  // Use zlib to compress (deflate)
  const zlib = require('zlib');
  const compressed = zlib.deflateSync(rawData);
  
  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); // width
  ihdr.writeUInt32BE(size, 4); // height
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // color type (RGBA)
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace
  
  const ihdrChunk = createChunk('IHDR', ihdr);
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));
  
  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  
  const typeBuffer = Buffer.from(type);
  const crc = crc32(Buffer.concat([typeBuffer, data]));
  
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);
  
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

// CRC32 implementation
function crc32(data) {
  let crc = 0xFFFFFFFF;
  const table = [];
  
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Generate icons
[16, 48, 128].forEach(size => {
  const png = createPNG(size);
  const filename = path.join(ICONS_DIR, `icon-${size}.png`);
  fs.writeFileSync(filename, png);
  console.log(`Created ${filename} (${png.length} bytes)`);
});

console.log('Done!');
