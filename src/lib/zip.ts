// Minimal ZIP (store only) builder for Node/Edge runtimes.
// Produces a Uint8Array containing a .zip archive without compression.

function crc32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
}
const CRC_TABLE = crc32Table();

function crc32(buf: Uint8Array): number {
  let c = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  }
  return (c ^ -1) >>> 0;
}

function dosTimeDate(date: Date) {
  const dt = new Date(date.getTime());
  const year = dt.getFullYear();
  const dosYear = Math.max(0, year - 1980);
  const dosTime = (dt.getHours() << 11) | (dt.getMinutes() << 5) | ((dt.getSeconds() / 2) & 31);
  const dosDate = (dosYear << 9) | ((dt.getMonth() + 1) << 5) | dt.getDate();
  return { dosTime, dosDate };
}

function writeUint32LE(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}
function writeUint16LE(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value & 0xffff, true);
}

export interface ZipFileEntry {
  name: string;
  data: Uint8Array;
  date?: Date;
}

export function buildZip(entries: ZipFileEntry[]): Uint8Array {
  const files: any[] = [];
  let offset = 0;
  const parts: Uint8Array[] = [];
  const now = new Date();

  for (const e of entries) {
    const nameBytes = new TextEncoder().encode(e.name.replace(/\\+/g, '/'));
    const data = e.data;
    const crc = crc32(data);
    const { dosTime, dosDate } = dosTimeDate(e.date || now);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const v = new DataView(localHeader.buffer);
    writeUint32LE(v, 0, 0x04034b50); // local file header signature
    writeUint16LE(v, 4, 20); // version needed
    writeUint16LE(v, 6, 0); // general purpose
    writeUint16LE(v, 8, 0); // compression: 0 = store
    writeUint16LE(v, 10, dosTime);
    writeUint16LE(v, 12, dosDate);
    writeUint32LE(v, 14, crc);
    writeUint32LE(v, 18, data.length);
    writeUint32LE(v, 22, data.length);
    writeUint16LE(v, 26, nameBytes.length);
    writeUint16LE(v, 28, 0); // extra length
    localHeader.set(nameBytes, 30);

    parts.push(localHeader, data);
    const size = localHeader.length + data.length;
    files.push({ nameBytes, crc, size: data.length, offset, dosTime, dosDate });
    offset += size;
  }

  // central directory
  const cdParts: Uint8Array[] = [];
  let cdSize = 0;
  let cdOffset = offset;
  for (const f of files) {
    const central = new Uint8Array(46 + f.nameBytes.length);
    const v = new DataView(central.buffer);
    writeUint32LE(v, 0, 0x02014b50);
    writeUint16LE(v, 4, 20); // version made by
    writeUint16LE(v, 6, 20); // version needed
    writeUint16LE(v, 8, 0); // flags
    writeUint16LE(v, 10, 0); // compression
    writeUint16LE(v, 12, f.dosTime);
    writeUint16LE(v, 14, f.dosDate);
    writeUint32LE(v, 16, f.crc);
    writeUint32LE(v, 20, f.size);
    writeUint32LE(v, 24, f.size);
    writeUint16LE(v, 28, f.nameBytes.length);
    writeUint16LE(v, 30, 0); // extra len
    writeUint16LE(v, 32, 0); // comment len
    writeUint16LE(v, 34, 0); // disk number
    writeUint16LE(v, 36, 0); // internal attrs
    writeUint32LE(v, 38, 0); // external attrs
    writeUint32LE(v, 42, f.offset);
    central.set(f.nameBytes, 46);
    cdParts.push(central);
    cdSize += central.length;
    offset += central.length;
  }

  const end = new Uint8Array(22);
  const ve = new DataView(end.buffer);
  writeUint32LE(ve, 0, 0x06054b50);
  writeUint16LE(ve, 4, 0); // disk #
  writeUint16LE(ve, 6, 0); // disk with central dir
  writeUint16LE(ve, 8, files.length);
  writeUint16LE(ve, 10, files.length);
  writeUint32LE(ve, 12, cdSize);
  writeUint32LE(ve, 16, cdOffset);
  writeUint16LE(ve, 20, 0); // comment len

  const totalLen = parts.reduce((n, p) => n + p.length, 0) + cdParts.reduce((n, p) => n + p.length, 0) + end.length;
  const out = new Uint8Array(totalLen);
  let pos = 0;
  for (const p of parts) { out.set(p, pos); pos += p.length; }
  for (const p of cdParts) { out.set(p, pos); pos += p.length; }
  out.set(end, pos);
  return out;
}

