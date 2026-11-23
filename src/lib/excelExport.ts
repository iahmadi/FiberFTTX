import type { MonthlyContractorEarning } from './fiberLogic.ts';
import { formatDateTimeToJalali, gregorianToJalali, JALALI_MONTH_NAMES, toPersianDigits } from './jalali.ts';

export interface LedgerExcelRow {
  id: number;
  user_name: string;
  ticket_id?: number | null;
  amount: number;
  type: 'credit' | 'debit';
  description: string | null;
  created_at: string;
}

export function escapeExcelXml(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function getLedgerEntryJalaliMonthKey(createdAt: string): string | null {
  if (!createdAt) return null;
  const normalized = createdAt.includes('T') ? createdAt : createdAt.replace(' ', 'T');
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return null;
  const j = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return `${j.jy}-${String(j.jm).padStart(2, '0')}`;
}

export function filterLedgerEntriesByMonths<T extends { created_at: string }>(
  entries: T[],
  monthKeys: string[],
): T[] {
  if (monthKeys.length === 0) return [];
  const allowed = new Set(monthKeys);
  return entries.filter((entry) => {
    const key = getLedgerEntryJalaliMonthKey(entry.created_at);
    return Boolean(key && allowed.has(key));
  });
}

export function buildContractorEarningsExcelXml(params: {
  monthlyEarnings: MonthlyContractorEarning[];
  ledgerEntries: LedgerExcelRow[];
  rangeLabel: string;
  contractorScopeLabel: string;
  exportedAtJalali?: string;
}): string {
  const exportedAt =
    params.exportedAtJalali ||
    (() => {
      const now = new Date();
      const j = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
      return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
    })();

  const totalMonthlyEarnings = params.monthlyEarnings.reduce((acc, m) => acc + m.totalEarnings, 0);
  const totalMonthlyCount = params.monthlyEarnings.reduce((acc, m) => acc + m.entryCount, 0);

  const monthlyRowsXml = params.monthlyEarnings
    .map(
      (m, idx) => `      <Row>
        <Cell ss:StyleID="CellCenter"><Data ss:Type="Number">${idx + 1}</Data></Cell>
        <Cell ss:StyleID="CellText"><Data ss:Type="String">${escapeExcelXml(m.monthLabel)}</Data></Cell>
        <Cell ss:StyleID="CellCenter"><Data ss:Type="Number">${m.entryCount}</Data></Cell>
        <Cell ss:StyleID="CellNum"><Data ss:Type="Number">${Math.round(m.totalEarnings)}</Data></Cell>
      </Row>`,
    )
    .join('\n');

  const ledgerRowsXml = params.ledgerEntries
    .map((entry) => {
      const typeLabel = entry.type === 'credit' ? 'بستانکار (دستمزد)' : 'بدهکار (پرداختی)';
      const dateStr = formatDateTimeToJalali(entry.created_at, false);
      const ticketLabel = entry.ticket_id ? `#${entry.ticket_id}` : '—';
      return `      <Row>
        <Cell ss:StyleID="CellCenter"><Data ss:Type="Number">${entry.id}</Data></Cell>
        <Cell ss:StyleID="CellText"><Data ss:Type="String">${escapeExcelXml(dateStr)}</Data></Cell>
        <Cell ss:StyleID="CellText"><Data ss:Type="String">${escapeExcelXml(entry.user_name)}</Data></Cell>
        <Cell ss:StyleID="CellCenter"><Data ss:Type="String">${escapeExcelXml(ticketLabel)}</Data></Cell>
        <Cell ss:StyleID="CellText"><Data ss:Type="String">${escapeExcelXml(typeLabel)}</Data></Cell>
        <Cell ss:StyleID="CellNum"><Data ss:Type="Number">${Math.round(entry.amount)}</Data></Cell>
        <Cell ss:StyleID="CellText"><Data ss:Type="String">${escapeExcelXml(entry.description || '—')}</Data></Cell>
      </Row>`;
    })
    .join('\n');

  const totalCreditLedger = params.ledgerEntries
    .filter((l) => l.type === 'credit')
    .reduce((acc, l) => acc + l.amount, 0);
  const totalDebitLedger = params.ledgerEntries
    .filter((l) => l.type === 'debit')
    .reduce((acc, l) => acc + l.amount, 0);

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center"/>
      <Font ss:FontName="Tahoma" ss:Size="10" ss:Color="#0F172A"/>
    </Style>
    <Style ss:ID="TitleStyle">
      <Font ss:FontName="Tahoma" ss:Size="12" ss:Bold="1" ss:Color="#0F766E"/>
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
    </Style>
    <Style ss:ID="MetaStyle">
      <Font ss:FontName="Tahoma" ss:Size="9" ss:Color="#475569"/>
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
    </Style>
    <Style ss:ID="Header">
      <Font ss:FontName="Tahoma" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#0D9488" ss:Pattern="Solid"/>
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    </Style>
    <Style ss:ID="CellText">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>
    <Style ss:ID="CellCenter">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>
    <Style ss:ID="CellNum">
      <NumberFormat ss:Format="#,##0"/>
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>
    <Style ss:ID="TotalRow">
      <Font ss:FontName="Tahoma" ss:Size="10" ss:Bold="1" ss:Color="#0F172A"/>
      <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="#,##0"/>
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="خلاصه ماهانه درآمد" ss:RightToLeft="1">
    <Table>
      <Column ss:Width="55"/>
      <Column ss:Width="150"/>
      <Column ss:Width="110"/>
      <Column ss:Width="170"/>
      <Row>
        <Cell ss:StyleID="TitleStyle"><Data ss:Type="String">گزارش ماهانه درآمد پیمانکاران شبکه فیبر نوری</Data></Cell>
      </Row>
      <Row>
        <Cell ss:StyleID="MetaStyle"><Data ss:Type="String">محدوده گزارش: ${escapeExcelXml(params.contractorScopeLabel)} | بازه زمانی: ${escapeExcelXml(params.rangeLabel)} | تاریخ تهیه: ${escapeExcelXml(toPersianDigits(exportedAt))}</Data></Cell>
      </Row>
      <Row/>
      <Row>
        <Cell ss:StyleID="Header"><Data ss:Type="String">ردیف</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">ماه شمسی</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">تعداد کارکرد</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">مجموع درآمد (تومان)</Data></Cell>
      </Row>
${monthlyRowsXml}
      <Row>
        <Cell ss:StyleID="TotalRow"><Data ss:Type="String">جمع کل</Data></Cell>
        <Cell ss:StyleID="TotalRow"><Data ss:Type="String">${escapeExcelXml(`${toPersianDigits(params.monthlyEarnings.length)} ماه`)}</Data></Cell>
        <Cell ss:StyleID="TotalRow"><Data ss:Type="Number">${totalMonthlyCount}</Data></Cell>
        <Cell ss:StyleID="TotalRow"><Data ss:Type="Number">${Math.round(totalMonthlyEarnings)}</Data></Cell>
      </Row>
    </Table>
  </Worksheet>
  <Worksheet ss:Name="ریز تراکنش‌های مالی" ss:RightToLeft="1">
    <Table>
      <Column ss:Width="75"/>
      <Column ss:Width="125"/>
      <Column ss:Width="140"/>
      <Column ss:Width="80"/>
      <Column ss:Width="135"/>
      <Column ss:Width="135"/>
      <Column ss:Width="260"/>
      <Row>
        <Cell ss:StyleID="TitleStyle"><Data ss:Type="String">ریز اسناد کارکرد و پرداخت‌های حسابداری</Data></Cell>
      </Row>
      <Row>
        <Cell ss:StyleID="MetaStyle"><Data ss:Type="String">بازه زمانی: ${escapeExcelXml(params.rangeLabel)} | جمع بستانکاری: ${Math.round(totalCreditLedger).toLocaleString('en-US')} تومان | جمع پرداختی: ${Math.round(totalDebitLedger).toLocaleString('en-US')} تومان</Data></Cell>
      </Row>
      <Row/>
      <Row>
        <Cell ss:StyleID="Header"><Data ss:Type="String">شماره سند</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">تاریخ شمسی</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">پیمانکار / شخص</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">شماره تیکت</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">نوع سند</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">مبلغ (تومان)</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">شرح سند</Data></Cell>
      </Row>
${ledgerRowsXml}
    </Table>
  </Worksheet>
</Workbook>`;
}

export function buildExcelExportFilename(prefix = 'contractor-earnings'): string {
  const now = new Date();
  const j = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const monthName = JALALI_MONTH_NAMES[j.jm - 1] ? `${j.jy}-${String(j.jm).padStart(2, '0')}-${String(j.jd).padStart(2, '0')}` : 'report';
  return `${prefix}-${monthName}.xls`;
}

export function downloadExcelWorkbook(filename: string, xmlContent: string): void {
  const blob = new Blob([`\uFEFF${xmlContent}`], {
    type: 'application/vnd.ms-excel;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
