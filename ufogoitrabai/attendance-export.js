import {t, locale} from './i18n.js';
const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const STATUS = {present: t('Có mặt'), absent: t('Vắng'), unmarked: t('Chưa điểm danh')};
const RUN_STATUS = {running: t('Chưa kết thúc'), completed: t('Đã hoàn tất'), stopped: t('Đã dừng')};
const encoder = new TextEncoder();
const xml = value => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'}[char]));
const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function cleanSession(session) {
  if (!session || !Array.isArray(session.records) || session.records.length > 120) throw new Error(t('Lượt điểm danh chưa có danh sách hợp lệ để xuất.'));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(session.date || '') || !Number.isFinite(session.startedAt)) throw new Error(t('Lượt điểm danh thiếu ngày hoặc giờ bắt đầu.'));
  const records = session.records.map((record, index) => {
    if (!record || !Object.hasOwn(STATUS, record.status)) throw new Error(t('Có trạng thái điểm danh không hợp lệ.'));
    return {number: index + 1, name: String(record.name || ''), gender: record.gender === 'female' ? t('Nữ') : record.gender === 'other' ? t('Khác') : t('Nam'), status: record.status};
  });
  const counts = {total: records.length, present: 0, absent: 0, unmarked: 0};
  for (const record of records) counts[record.status]++;
  let timeZone = String(session.timeZone || 'Asia/Ho_Chi_Minh');
  let parts;
  // Fixed Latin numeric parts produce a locale-independent Excel time serial.
  try { parts = new Intl.DateTimeFormat('en-GB', {timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'}).formatToParts(session.startedAt); }
  catch { throw new Error(t('Múi giờ của lượt điểm danh không hợp lệ.')); }
  const part = type => Number(parts.find(value => value.type === type)?.value || 0);
  const time = (part('hour') * 3600 + part('minute') * 60 + part('second')) / 86400;
  const [year, month, day] = session.date.split('-').map(Number), dateValue = Date.UTC(year, month - 1, day);
  if (new Date(dateValue).toISOString().slice(0, 10) !== session.date) throw new Error(t('Ngày điểm danh không hợp lệ.'));
  return {...session, records, counts, timeZone, excelDate: dateValue / 86400000 + 25569, excelTime: time};
}

function cell(ref, value, style = 0) {
  return typeof value === 'number'
    ? `<c r="${ref}" s="${style}"><v>${value}</v></c>`
    : `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}
function row(number, cells, height = 23) { return `<row r="${number}" ht="${height}" customHeight="1">${cells.map(([column, value, style]) => cell(`${column}${number}`, value, style)).join('')}</row>`; }

function sheetXML(session, className, title, records) {
  const {counts} = session;
  const rows = [
    row(1, [], 10),
    row(2, [['A', t('KROMA · ĐIỂM DANH LỚP HỌC'), 1]], 29),
    row(3, [['A', t('Lớp'), 2], ['B', className, 3]], Math.max(26, Math.ceil(className.length / 35) * 16 + 8)),
    row(4, [['A', t('Ngày'), 2], ['B', session.excelDate, 6], ['C', t('Giờ bắt đầu'), 2], ['D', session.excelTime, 7]]),
    row(5, [['A', t('Múi giờ'), 2], ['B', session.timeZone], ['C', t('Kết quả'), 2], ['D', RUN_STATUS[session.status] || session.status, 3]], 38),
    row(6, [['A', t('Lượt'), 2], ['B', session.id]], 23),
    row(7, [['A', t('Tổng'), 2], ['B', counts.total, 8], ['C', t('Có mặt'), 2], ['D', counts.present, 8]]),
    row(8, [['A', t('Vắng'), 2], ['B', counts.absent, 8], ['C', t('Chưa điểm danh'), 2], ['D', counts.unmarked, 8]], 32),
    row(9, [], 9),
    row(10, [['A', title, 2]], 25),
    row(11, [['A', t('STT'), 4], ['B', t('Họ tên'), 4], ['C', t('Giới tính'), 4], ['D', t('Trạng thái'), 4]], 27),
    ...records.map((record, index) => row(index + 12, [['A', record.number, 8], ['B', record.name, 3], ['C', record.gender, 5], ['D', STATUS[record.status], record.status === 'present' ? 9 : record.status === 'absent' ? 10 : 11]], Math.max(25, Math.ceil(record.name.length / 35) * 16 + 8))),
  ];
  if (!records.length) rows.push(row(12, [['B', t('Không có học sinh trong danh sách này.'), 3]], 27));
  const lastRow = Math.max(12, records.length + 11);
  return `${declaration}<worksheet xmlns="${NS}"><sheetPr><tabColor rgb="FF416549"/><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:D${lastRow}"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="11" topLeftCell="A12" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A12" sqref="A12"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="23"/><cols><col min="1" max="1" width="10" customWidth="1"/><col min="2" max="2" width="54" customWidth="1"/><col min="3" max="3" width="16" customWidth="1"/><col min="4" max="4" width="24" customWidth="1"/></cols><sheetData>${rows.join('')}</sheetData><autoFilter ref="A11:D${Math.max(11, records.length + 11)}"/><printOptions horizontalCentered="1"/><pageMargins left="0.35" right="0.35" top="0.45" bottom="0.45" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

const dateFormat = ({en: 'mm/dd/yyyy', zh: 'yyyy/mm/dd', ja: 'yyyy/mm/dd', ko: 'yyyy-mm-dd', de: 'dd.mm.yyyy'})[locale.split('-')[0]] || 'dd/mm/yyyy';
const styles = `${declaration}<styleSheet xmlns="${NS}"><numFmts count="2"><numFmt numFmtId="164" formatCode="${dateFormat}"/><numFmt numFmtId="165" formatCode="hh:mm:ss"/></numFmts><fonts count="5"><font><sz val="11"/><color rgb="FF2E3D31"/><name val="Arial"/></font><font><b/><sz val="16"/><color rgb="FF31583D"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FF536A48"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><sz val="11"/><color rgb="FF986B43"/><name val="Arial"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF416549"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF0F5EA"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFCF2E8"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFE3EADB"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="12"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="4" fillId="4" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

const crcTable = Array.from({length: 256}, (_, index) => { let crc = index; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0); return crc >>> 0; });
function crc32(bytes) { let crc = 0xFFFFFFFF; for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255]; return (crc ^ 0xFFFFFFFF) >>> 0; }
function concat(parts) { const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0)); let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.length; } return result; }
function header(length, values) { const bytes = new Uint8Array(length), view = new DataView(bytes.buffer); for (const [offset, value, width = 2] of values) width === 4 ? view.setUint32(offset, value, true) : view.setUint16(offset, value, true); return bytes; }
function zip(files) {
  const local = [], central = []; let offset = 0;
  for (const [name, contents] of files) {
    const filename = encoder.encode(name), data = encoder.encode(contents), crc = crc32(data);
    const localHeader = header(30, [[0,0x04034B50,4],[4,20],[6,0x0800],[12,33],[14,crc,4],[18,data.length,4],[22,data.length,4],[26,filename.length]]);
    local.push(localHeader, filename, data);
    central.push(header(46, [[0,0x02014B50,4],[4,20],[6,20],[8,0x0800],[14,33],[16,crc,4],[20,data.length,4],[24,data.length,4],[28,filename.length],[42,offset,4]]), filename);
    offset += localHeader.length + filename.length + data.length;
  }
  const directory = concat(central);
  return concat([...local, directory, header(22, [[0,0x06054B50,4],[8,files.length],[10,files.length],[12,directory.length,4],[16,offset,4]])]);
}

export function buildAttendanceWorkbook(input, {className = t('Lớp học')} = {}) {
  const session = cleanSession(input), name = String(className || t('Lớp học'));
  const sheets = [
    {name: t('Tổng hợp'), title: t('Danh sách điểm danh'), records: session.records},
    {name: t('Có mặt'), title: t('Danh sách có mặt'), records: session.records.filter(record => record.status === 'present')},
    {name: t('Vắng'), title: t('Danh sách vắng'), records: session.records.filter(record => record.status === 'absent')},
  ];
  const types = `${declaration}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,index)=>`<Override PartName="/xl/worksheets/sheet${index+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
  const rootRels = `${declaration}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbook = `${declaration}<workbook xmlns="${NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sheets.map((sheet,index)=>`<sheet name="${xml(sheet.name)}" sheetId="${index+1}" r:id="rId${index+1}"/>`).join('')}</sheets><definedNames>${sheets.map((sheet,index)=>`<definedName name="_xlnm.Print_Titles" localSheetId="${index}">'${xml(sheet.name)}'!$11:$11</definedName>`).join('')}</definedNames></workbook>`;
  const rels = `${declaration}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,index)=>`<Relationship Id="rId${index+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index+1}.xml"/>`).join('')}<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  return new Blob([zip([['[Content_Types].xml', types], ['_rels/.rels',rootRels], ['xl/workbook.xml',workbook], ['xl/_rels/workbook.xml.rels',rels], ['xl/styles.xml',styles], ...sheets.map((sheet,index)=>[`xl/worksheets/sheet${index+1}.xml`,sheetXML(session,name,sheet.title,sheet.records)])])], {type: MIME});
}

export function attendanceFilename(session) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(session?.date || '') ? session.date : t('lich-su');
  const id = String(session?.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
  return `KROMA-${t('diem-danh')}-${date}${id ? `-${id}` : ''}.xlsx`;
}

export function downloadAttendanceWorkbook(session, options) {
  const blob = buildAttendanceWorkbook(session, options), url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = attendanceFilename(session);
  document.body.append(link); link.click(); link.remove();
  // Retain the URL briefly so mobile browsers can finish opening the download.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return {filename: link.download, bytes: blob.size};
}
