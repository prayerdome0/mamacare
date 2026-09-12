/**
 * PDF rendering for reports.
 *
 * jsPDF is imported dynamically so the ~350 kB renderer is never loaded by users
 * who never generate a report. The header carries the confidentiality notice and
 * the actor, which is what makes an exported print-out traceable.
 */

import type { jsPDF } from 'jspdf';

export interface PdfColumn {
  header: string;
  accessor: string;
  width?: number;
}

export interface PdfSection {
  title: string;
  description?: string;
  columns: PdfColumn[];
  rows: Record<string, string | number | null | undefined>[];
  /** Rendered as key/value cards above the table. */
  meta?: { label: string; value: string }[];
  emptyMessage?: string;
}

export interface PdfDocument {
  reportTitle: string;
  reportType: string;
  facilityName: string;
  periodLabel: string;
  generatedByName: string;
  generatedAtLabel: string;
  reference: string;
  confidentiality: string;
  summary: { label: string; value: string | number }[];
  sections: PdfSection[];
  footnotes: string[];
}

const BRAND = { r: 15, g: 118, b: 110 } as const;
const INK = { r: 30, g: 41, b: 59 } as const;

export async function renderPdf(document: PdfDocument): Promise<Blob> {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const autoTable = (autoTableModule as unknown as { default?: typeof import('jspdf-autotable').default }).default ?? (autoTableModule as unknown as typeof import('jspdf-autotable').default);

  const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const marginX = 40;
  let cursorY = 0;

  cursorY = drawHeader(pdf, document, pageWidth, marginX);

  for (const section of document.sections) {
    cursorY = drawSection(pdf, autoTable, section, document, pageWidth, marginX, cursorY);
  }

  drawFooter(pdf, document, pageWidth);
  return pdf.output('blob');
}

function drawHeader(pdf: InstanceType<typeof jsPDF>, document: PdfDocument, pageWidth: number, marginX: number): number {
  pdf.setFillColor(BRAND.r, BRAND.g, BRAND.b);
  pdf.rect(0, 0, pageWidth, 78, 'F');

  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text('MAMA CARE', marginX, 32);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10.5);
  pdf.text(document.reportTitle, marginX, 50);

  pdf.setFontSize(8);
  pdf.text(`Reference ${document.reference}`, pageWidth - marginX, 32, { align: 'right' });
  pdf.text(document.facilityName, pageWidth - marginX, 44, { align: 'right' });
  pdf.text(`${document.periodLabel}  ·  generated ${document.generatedAtLabel}`, pageWidth - marginX, 56, { align: 'right' });

  let y = 100;
  pdf.setTextColor(INK.r, INK.g, INK.b);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Summary', marginX, y);
  y += 6;

  if (document.summary.length > 0) {
    const boxWidth = (pageWidth - marginX * 2 - 12) / Math.min(4, Math.max(2, document.summary.length));
    document.summary.slice(0, 8).forEach((item, index) => {
      const col = index % Math.min(4, document.summary.length);
      const row = Math.floor(index / 4);
      const x = marginX + col * (boxWidth + 4);
      const boxY = y + row * 46;
      pdf.setDrawColor(226, 232, 240);
      pdf.setFillColor(248, 250, 252);
      pdf.roundedRect(x, boxY, boxWidth, 40, 4, 4, 'FD');
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor(100, 116, 139);
      pdf.text(String(item.label).toUpperCase(), x + 8, boxY + 15);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.setTextColor(INK.r, INK.g, INK.b);
      pdf.text(String(item.value), x + 8, boxY + 31);
    });
    y += 46 * Math.ceil(Math.min(8, document.summary.length) / 4) + 8;
  }

  pdf.setFont('helvetica', 'italic');
  pdf.setFontSize(7.5);
  pdf.setTextColor(148, 163, 184);
  pdf.text(document.confidentiality, marginX, y);
  return y + 18;
}

function drawSection(
  pdf: InstanceType<typeof jsPDF>,
  autoTable: typeof import('jspdf-autotable').default,
  section: PdfSection,
  document: PdfDocument,
  pageWidth: number,
  marginX: number,
  startY: number,
): number {
  let y = startY;
  const remaining = pdf.internal.pageSize.getHeight() - y - 90;
  if (remaining < 120) {
    pdf.addPage();
    y = 56;
  }

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(INK.r, INK.g, INK.b);
  pdf.text(section.title, marginX, y);
  y += 13;

  if (section.meta?.length) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(71, 85, 105);
    const line = section.meta.map((item) => `${item.label}: ${item.value}`).join('   ·   ');
    const wrapped = pdf.splitTextToSize(line, pageWidth - marginX * 2) as string[];
    wrapped.slice(0, 3).forEach((row, index) => pdf.text(row, marginX, y + index * 11));
    y += wrapped.slice(0, 3).length * 11 + 6;
  }

  if (section.description) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(100, 116, 139);
    const wrapped = pdf.splitTextToSize(section.description, pageWidth - marginX * 2) as string[];
    wrapped.slice(0, 2).forEach((row, index) => pdf.text(row, marginX, y + index * 11));
    y += wrapped.slice(0, 2).length * 11 + 4;
  }

  if (section.rows.length === 0) {
    pdf.setDrawColor(226, 232, 240);
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(marginX, y, pageWidth - marginX * 2, 30, 4, 4, 'FD');
    pdf.setFontSize(8.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text(section.emptyMessage ?? 'No records in this period.', marginX + 10, y + 19);
    return y + 46;
  }

  autoTable(pdf, {
    startY: y,
    margin: { left: marginX, right: marginX, bottom: 60 },
    head: [section.columns.map((column) => column.header)],
    body: section.rows.map((row) => section.columns.map((column) => formatCell(row[column.accessor]))),
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 4, lineColor: [226, 232, 240], lineWidth: 0.5, textColor: [51, 65, 85] },
    headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: [250, 252, 252] },
    columnStyles: Object.fromEntries(
      section.columns.map((column, index) => [index, column.width ? { cellWidth: column.width } : {}]),
    ),
  });

  const afterTable = (pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
  return (afterTable?.finalY ?? y) + 20;
}

function formatCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function drawFooter(pdf: InstanceType<typeof jsPDF>, document: PdfDocument, pageWidth: number): void {
  const pages = pdf.getNumberOfPages();
  const bottom = pdf.internal.pageSize.getHeight() - 42;
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor(226, 232, 240);
    pdf.line(40, bottom - 12, pageWidth - 40, bottom - 12);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(148, 163, 184);
    pdf.text(
      `${document.reportType} · generated by ${document.generatedByName} · ${document.confidentiality}`,
      40,
      bottom,
    );
    pdf.text(`Page ${page} of ${pages}`, pageWidth - 40, bottom, { align: 'right' });
    if (page === 1 && document.footnotes.length > 0) {
      pdf.text(document.footnotes.slice(0, 2).join('  ·  '), 40, bottom + 11);
    }
  }
}
