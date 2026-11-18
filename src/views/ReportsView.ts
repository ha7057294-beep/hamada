import {
  getCoops,
  getEggs,
  getSquabs,
  getSales,
  getManualRevenues,
  getExpenses,
} from '../db/indexedDB';
import { formatDateArabic, getRolling6MonthsPeriod } from '../utils/dateUtils';
import { icons } from '../utils/icons';

export async function renderReportsView(
  container: HTMLElement,
  _navigate?: (view: string, params?: Record<string, string>) => void
) {
  const { fromDate, toDate } = getRolling6MonthsPeriod();

  const [coops, eggs, squabs, sales, manualRevenues, expenses] = await Promise.all([
    getCoops(),
    getEggs(),
    getSquabs(),
    getSales(),
    getManualRevenues({ fromDate, toDate, activeOnly: true }),
    getExpenses({ fromDate, toDate, activeOnly: true }),
  ]);

  const inPeriod = (dateStr?: string) => Boolean(dateStr && dateStr >= fromDate && dateStr <= toDate);

  // Sort coops naturally by number
  const sortedCoops = [...coops].sort((a, b) =>
    String(a.number).localeCompare(String(b.number), 'ar', { numeric: true })
  );

  // Count production metrics per coop for the last 6 months
  const laidByCoop = new Map<string, number>();
  const hatchedByCoop = new Map<string, number>();
  const squabsByCoop = new Map<string, number>();

  let totalLaid = 0;
  let totalHatched = 0;
  let totalBornSquabs = 0;

  for (const egg of eggs) {
    if (inPeriod(egg.laidDate)) {
      totalLaid++;
      if (egg.coopId) {
        laidByCoop.set(egg.coopId, (laidByCoop.get(egg.coopId) || 0) + 1);
      }
    }
    if (egg.status === 'hatched' && inPeriod(egg.hatchDate || egg.laidDate)) {
      totalHatched++;
      if (egg.coopId) {
        hatchedByCoop.set(egg.coopId, (hatchedByCoop.get(egg.coopId) || 0) + 1);
      }
    }
  }

  for (const squab of squabs) {
    if (inPeriod(squab.hatchDate)) {
      totalBornSquabs++;
      if (squab.originCoopId) {
        squabsByCoop.set(squab.originCoopId, (squabsByCoop.get(squab.originCoopId) || 0) + 1);
      }
    }
  }

  // Financial summary for the same 6 months (no establishment split)
  const squabSalesTotal = sales
    .filter((s) => inPeriod(s.date))
    .reduce((sum, s) => sum + (s.totalAmount || 0), 0);
  const manualRevTotal = manualRevenues.reduce((sum, r) => sum + (r.amount || 0), 0);
  const totalSales = Math.round((squabSalesTotal + manualRevTotal) * 100) / 100;

  const totalExpenses = Math.round(
    expenses.reduce((sum, e) => sum + (e.amount || 0), 0) * 100
  ) / 100;

  const netProfit = Math.round((totalSales - totalExpenses) * 100) / 100;
  const profitMarginText =
    totalSales > 0 ? `${Math.round((netProfit / totalSales) * 1000) / 10}%` : '—';
  const isProfitable = netProfit >= 0;

  container.innerHTML = `
    <div class="list-view-header">
      <div>
        <h1 class="list-view-title">التقارير</h1>
        <div class="detail-item-sub">آخر 6 شهور (${formatDateArabic(fromDate)} — ${formatDateArabic(toDate)})</div>
      </div>
    </div>

    <!-- قسم 1: الإنتاج حسب السلاكة -->
    <section class="card">
      <div class="card-header">
        <div class="card-title">
          ${icons.coop}
          <span>الإنتاج حسب السلاكة</span>
        </div>
      </div>

      ${
        sortedCoops.length === 0
          ? `
        <div class="detail-empty-box">لا توجد سلاكات مسجلة حتى الآن.</div>
      `
          : `
        <div class="table-scroll-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>السلاكة</th>
                <th>البيض</th>
                <th>الفقس</th>
                <th>الزغاليل</th>
              </tr>
            </thead>
            <tbody>
              ${sortedCoops
                .map((coop) => {
                  const laid = laidByCoop.get(coop.id) || 0;
                  const hatched = hatchedByCoop.get(coop.id) || 0;
                  const born = squabsByCoop.get(coop.id) || 0;
                  return `
                  <tr>
                    <td><strong>${coop.number}</strong></td>
                    <td>${laid}</td>
                    <td>${hatched}</td>
                    <td>${born}</td>
                  </tr>
                `;
                })
                .join('')}
              <tr>
                <td><strong>الإجمالي</strong></td>
                <td><strong>${totalLaid}</strong></td>
                <td><strong>${totalHatched}</strong></td>
                <td><strong>${totalBornSquabs}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      `
      }
    </section>

    <!-- قسم 2: الملخص المالي -->
    <section class="card">
      <div class="card-header">
        <div class="card-title">
          ${icons.wallet}
          <span>الملخص المالي</span>
        </div>
      </div>

      <div class="detail-alert-box ${isProfitable ? 'detail-alert-box-success' : 'detail-alert-box-danger'}">
        <div class="detail-info-row">
          <strong style="font-size:1.05rem;">${isProfitable ? 'كسبان' : 'خسران'}</strong>
          <strong style="font-size:1.1rem;">${netProfit.toLocaleString('ar-EG')} ج.م</strong>
        </div>
      </div>

      <div class="detail-info-grid">
        <div class="detail-info-box">
          <span class="detail-info-label">إجمالي المبيعات</span>
          <strong class="detail-info-value detail-text-success">${totalSales.toLocaleString('ar-EG')} ج.م</strong>
        </div>
        <div class="detail-info-box">
          <span class="detail-info-label">إجمالي المصروفات</span>
          <strong class="detail-info-value detail-text-danger">${totalExpenses.toLocaleString('ar-EG')} ج.م</strong>
        </div>
        <div class="detail-info-box">
          <span class="detail-info-label">الصافي</span>
          <strong class="detail-info-value ${isProfitable ? 'detail-text-success' : 'detail-text-danger'}">${netProfit.toLocaleString('ar-EG')} ج.م</strong>
        </div>
        <div class="detail-info-box">
          <span class="detail-info-label">نسبة الربح</span>
          <strong class="detail-info-value">${profitMarginText}</strong>
        </div>
      </div>
    </section>
  `;
}
