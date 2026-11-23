// Offline Microsoft Excel SpreadsheetML 2003 XML (.xls) exporter with Persian RTL sheets
import type { MonthlyContractorEarning } from './fiberLogic.ts';
import { getTodayJalali } from './jalali.ts';

export interface ExcelLedgerRow {
  id: number;
  user_full_name: string;
  ticket_id: number | null;
  type: 'credit' | 'debit';
  amount: number;
  description: string;
  jalaliDate: string;
}

function escapeXml(raw: string | number | null | undefined): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildWorksheetXml(
  sheetName: string,
  headers: string[],
  rows: Array<Array<{ value: string | number; type?: 'String' | 'Number' }>>,
): string {
  const headerXml = headers
    .map(
      (h) =>
        `<Cell ss:StyleID="sHeader"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`,
    )
    .join('');

  const rowsXml = rows
    .map((cells) => {
      const cellsXml = cells
        .map((c) => {
          const t = c.type === 'Number' ? 'Number' : 'String';
          const style = c.type === 'Number' ? 'sNum' : 'sText';
          return `<Cell ss:StyleID="${style}"><Data ss:Type="${t}">${escapeXml(c.value)}</Data></Cell>`;
        })
        .join('');
      return `<Row ss:Height="22">${cellsXml}</Row>`;
    })
    .join('');

  return `<Worksheet ss:Name="${escapeXml(sheetName)}">
    <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
      <DisplayRightToLeft/>
    </WorksheetOptions>
    <Table>
      <Row ss:Height="26">${headerXml}</Row>
      ${rowsXml}
    </Table>
  </Worksheet>`;
}

export function buildFinancialExcelXml(params: {
  monthlySummary: MonthlyContractorEarning[];
  ledgerRows: ExcelLedgerRow[];
}): string {
  const monthlyRows = params.monthlySummary.map((m) => [
    { value: m.monthLabel, type: 'String' as const },
    { value: m.monthKey, type: 'String' as const },
    { value: m.entryCount, type: 'Number' as const },
    { value: Math.round(m.totalEarnings), type: 'Number' as const },
  ]);

  const txRows = params.ledgerRows.map((l) => [
    { value: l.id, type: 'Number' as const },
    { value: l.jalaliDate, type: 'String' as const },
    { value: l.user_full_name, type: 'String' as const },
    { value: l.ticket_id ? `#${l.ticket_id}` : '—', type: 'String' as const },
    { value: l.type === 'credit' ? 'بستانکار (درآمد)' : 'بدهکار (پرداختی)', type: 'String' as const },
    { value: Math.round(l.amount), type: 'Number' as const },
    { value: l.description, type: 'String' as const },
  ]);

  const sheet1 = buildWorksheetXml(
    'خلاصه ماهانه درآمد',
    ['ماه شمسی', 'کد دوره', 'تعداد سند بستانکار', 'مجموع درآمد (تومان)'],
    monthlyRows,
  );
  const sheet2 = buildWorksheetXml(
    'ریز تراکنش‌های مالی',
    ['شناسه', 'تاریخ شمسی', 'نصاب', 'شماره تیکت', 'نوع سند', 'مبلغ (تومان)', 'شرح'],
    txRows,
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Font ss:FontName="Tahoma" ss:Size="10"/>
    </Style>
    <Style ss:ID="sHeader">
      <Font ss:FontName="Tahoma" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#0F766E" ss:Pattern="Solid"/>
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    </Style>
    <Style ss:ID="sText">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
    </Style>
    <Style ss:ID="sNum">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <NumberFormat ss:Format="#,##0"/>
    </Style>
  </Styles>
  ${sheet1}
  ${sheet2}
</Workbook>`;
}

export function downloadFinancialExcelReport(params: {
  monthlySummary: MonthlyContractorEarning[];
  ledgerRows: ExcelLedgerRow[];
}): string {
  const j = getTodayJalali();
  const filename = `avanetwork-financial-${j.jy}-${String(j.jm).padStart(2, '0')}-${String(j.jd).padStart(2, '0')}.xls`;
  const xml = buildFinancialExcelXml(params);
  const blob = new Blob(['\uFEFF' + xml], {
    type: 'application/vnd.ms-excel;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}
