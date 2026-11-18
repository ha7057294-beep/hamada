import {
  getExpenses,
  getManualRevenues,
  getSales,
  getAllSaleItems,
  toggleExpenseActive,
  toggleManualRevenueActive,
} from '../db/indexedDB';
import { Expense, ExpenseCategory, ManualRevenue, ManualRevenueCategory, Sale } from '../types';
import {
  formatDateArabic,
  getFirstDayOfMonth,
  getRolling6MonthsPeriod,
  getTodayDate,
} from '../utils/dateUtils';
import { icons } from '../utils/icons';
import {
  showAddExpenseModal,
  showEditExpenseModal,
  showAddManualRevenueModal,
  showEditManualRevenueModal,
  showSaleDetailModal,
} from '../components/Modal';
import { showToast } from '../components/Toast';

type PeriodFilter = 'month' | '6m' | 'all';
type TypeFilter = 'all' | 'expenses' | 'revenues' | 'inactive';

let activePeriod: PeriodFilter = 'month';
let activeType: TypeFilter = 'all';

function getExpenseCategoryLabel(category: ExpenseCategory): string {
  switch (category) {
    case 'feed':
    case 'feed_purchase':
      return 'علف';
    case 'medication':
      return 'أدوية';
    case 'pigeon_purchase':
      return 'شراء حمام';
    case 'equipment':
    case 'breeding_supplies':
      return 'معدات ومستلزمات';
    case 'utilities':
      return 'كهرباء ومياه';
    case 'maintenance':
    case 'operational':
    case 'other':
    default:
      return 'أخرى';
  }
}

function getRevenueCategoryLabel(category: ManualRevenueCategory): string {
  switch (category) {
    case 'squab_sale':
      return 'بيع زغاليل';
    case 'adult_sale':
      return 'بيع حمام';
    case 'other':
    case 'other_revenue':
    default:
      return 'أخرى';
  }
}

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

interface LedgerEntry {
  kind: 'expense' | 'manual_revenue' | 'sale';
  id: string;
  date: string;
  createdAt: string;
  amount: number;
  isRevenue: boolean;
  active: boolean;
  description: string;
  categoryLabel: string;
  expense?: Expense;
  manualRevenue?: ManualRevenue;
  sale?: Sale;
}

export async function renderFinancesView(container: HTMLElement) {
  const loadAndRender = async () => {
    const [allExpenses, allManualRevenues, allSales, allSaleItems] = await Promise.all([
      getExpenses({ activeOnly: false }),
      getManualRevenues({ activeOnly: false }),
      getSales(),
      getAllSaleItems(),
    ]);

    const today = getTodayDate();
    let fromDate = '';
    let toDate = today;

    if (activePeriod === 'month') {
      fromDate = getFirstDayOfMonth();
    } else if (activePeriod === '6m') {
      fromDate = getRolling6MonthsPeriod().fromDate;
    }

    const inPeriod = (dateStr: string) => {
      if (activePeriod === 'all') return true;
      return dateStr >= fromDate && dateStr <= toDate;
    };

    // Count sold squabs per sale for clean fallback description
    const saleSquabCount = new Map<string, number>();
    for (const item of allSaleItems) {
      saleSquabCount.set(item.saleId, (saleSquabCount.get(item.saleId) || 0) + 1);
    }

    // Build unified ledger filtered by period
    const periodEntries: LedgerEntry[] = [];

    for (const exp of allExpenses) {
      if (!inPeriod(exp.date)) continue;
      periodEntries.push({
        kind: 'expense',
        id: exp.id,
        date: exp.date,
        createdAt: exp.createdAt || '',
        amount: exp.amount || 0,
        isRevenue: false,
        active: exp.active !== false,
        description: exp.description,
        categoryLabel: getExpenseCategoryLabel(exp.category),
        expense: exp,
      });
    }

    for (const rev of allManualRevenues) {
      if (!inPeriod(rev.date)) continue;
      periodEntries.push({
        kind: 'manual_revenue',
        id: rev.id,
        date: rev.date,
        createdAt: rev.createdAt || '',
        amount: rev.amount || 0,
        isRevenue: true,
        active: rev.active !== false,
        description: rev.description,
        categoryLabel: getRevenueCategoryLabel(rev.category),
        manualRevenue: rev,
      });
    }

    for (const sale of allSales) {
      if (!inPeriod(sale.date)) continue;
      const count = saleSquabCount.get(sale.id) || 0;
      const desc =
        sale.note && sale.note.trim()
          ? sale.note.trim()
          : count > 0
          ? `بيع ${count} زغلول`
          : 'بيع زغاليل';
      periodEntries.push({
        kind: 'sale',
        id: sale.id,
        date: sale.date,
        createdAt: sale.createdAt || '',
        amount: sale.totalAmount || 0,
        isRevenue: true,
        active: true,
        description: desc,
        categoryLabel: 'بيع زغاليل',
        sale,
      });
    }

    // Compute top 3 totals over active period entries only (no establishment split)
    let totalRevenue = 0;
    let totalExpenses = 0;
    for (const entry of periodEntries) {
      if (!entry.active) continue;
      if (entry.isRevenue) {
        totalRevenue += entry.amount;
      } else {
        totalExpenses += entry.amount;
      }
    }
    totalRevenue = Math.round(totalRevenue * 100) / 100;
    totalExpenses = Math.round(totalExpenses * 100) / 100;
    const netAmount = Math.round((totalRevenue - totalExpenses) * 100) / 100;

    // Filter by type chip & sort newest first
    const visibleEntries = periodEntries
      .filter((entry) => {
        if (activeType === 'inactive') return !entry.active;
        if (!entry.active) return false;
        if (activeType === 'expenses') return !entry.isRevenue;
        if (activeType === 'revenues') return entry.isRevenue;
        return true;
      })
      .sort((a, b) => {
        const dateCmp = b.date.localeCompare(a.date);
        if (dateCmp !== 0) return dateCmp;
        return b.createdAt.localeCompare(a.createdAt);
      });

    const inactiveCount = periodEntries.filter((e) => !e.active).length;

    container.innerHTML = `
      <div class="list-view-header">
        <h1 class="list-view-title">المالية</h1>
      </div>

      <!-- 3 إجماليات في الأعلى -->
      <div class="detail-kpi-grid">
        <div class="detail-kpi-item">
          <span class="detail-kpi-label">إجمالي الإيرادات</span>
          <span class="detail-kpi-value detail-kpi-value-success">${totalRevenue.toLocaleString('ar-EG')} ج.م</span>
        </div>
        <div class="detail-kpi-item">
          <span class="detail-kpi-label">إجمالي المصروفات</span>
          <span class="detail-kpi-value detail-kpi-value-danger">${totalExpenses.toLocaleString('ar-EG')} ج.م</span>
        </div>
        <div class="detail-kpi-item">
          <span class="detail-kpi-label">الصافي</span>
          <span class="detail-kpi-value ${netAmount >= 0 ? 'detail-kpi-value-success' : 'detail-kpi-value-danger'}">${netAmount.toLocaleString('ar-EG')} ج.م</span>
        </div>
      </div>

      <!-- زراران فقط -->
      <div class="quick-actions-row">
        <button type="button" class="btn btn-primary quick-action-btn" id="btn-add-expense">
          ${icons.plus}
          <span>إضافة مصروف</span>
        </button>
        <button type="button" class="btn btn-secondary quick-action-btn" id="btn-add-revenue">
          ${icons.plus}
          <span>إضافة إيراد</span>
        </button>
      </div>

      <!-- فلاتر الفترة -->
      <div class="filter-tabs" role="tablist" aria-label="تصفية الفترة">
        <button type="button" class="filter-tab ${activePeriod === 'month' ? 'active' : ''}" data-period="month">هذا الشهر</button>
        <button type="button" class="filter-tab ${activePeriod === '6m' ? 'active' : ''}" data-period="6m">آخر 6 شهور</button>
        <button type="button" class="filter-tab ${activePeriod === 'all' ? 'active' : ''}" data-period="all">الكل</button>
      </div>

      <!-- فلاتر النوع -->
      <div class="filter-tabs" role="tablist" aria-label="تصفية النوع">
        <button type="button" class="filter-tab ${activeType === 'all' ? 'active' : ''}" data-type="all">الكل</button>
        <button type="button" class="filter-tab ${activeType === 'expenses' ? 'active' : ''}" data-type="expenses">مصروفات</button>
        <button type="button" class="filter-tab ${activeType === 'revenues' ? 'active' : ''}" data-type="revenues">إيرادات</button>
        <button type="button" class="filter-tab ${activeType === 'inactive' ? 'active' : ''}" data-type="inactive">
          الموقوفة${inactiveCount > 0 ? ` (${inactiveCount})` : ''}
        </button>
      </div>

      <!-- القائمة المدمجة -->
      ${
        visibleEntries.length === 0
          ? `
        <div class="compact-empty-state">
          <div class="compact-empty-title">
            ${activeType === 'inactive' ? 'لا توجد بنود موقوفة في هذه الفترة' : 'لا توجد حركات مالية في هذه الفترة'}
          </div>
          <div class="compact-empty-desc">
            ${activeType === 'inactive' ? 'أي مصروف أو إيراد يتم إيقافه سيظهر هنا لإعادة التفعيل عند الحاجة.' : 'استخدم زر إضافة مصروف أو إضافة إيراد للتسجيل.'}
          </div>
        </div>
      `
          : `
        <div class="compact-list">
          ${visibleEntries
            .map(
              (entry) => `
            <div class="list-card finance-entry-card" data-kind="${entry.kind}" data-id="${entry.id}">
              <div class="list-card-main">
                <div class="list-card-lines">
                  <div class="list-card-line1">${escapeHtml(entry.description)}</div>
                  <div class="list-card-line2">
                    ${formatDateArabic(entry.date)} • ${entry.categoryLabel}
                  </div>
                </div>
              </div>
              <div class="list-card-badge-wrap">
                ${
                  !entry.active
                    ? `
                  <button
                    type="button"
                    class="btn btn-outline btn-sm btn-reactivate-entry"
                    data-kind="${entry.kind}"
                    data-id="${entry.id}"
                  >
                    إعادة تفعيل
                  </button>
                `
                    : `
                  <span class="${entry.isRevenue ? 'detail-text-success' : 'detail-text-danger'}" style="font-weight:800;">
                    ${entry.isRevenue ? '+' : '-'}${entry.amount.toLocaleString('ar-EG')} ج.م
                  </span>
                `
                }
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      `
      }
    `;

    // Add Expense / Revenue
    container.querySelector('#btn-add-expense')?.addEventListener('click', () => {
      showAddExpenseModal(undefined, () => {
        window.dispatchEvent(new Event('farm-data-updated'));
        loadAndRender();
      });
    });

    container.querySelector('#btn-add-revenue')?.addEventListener('click', () => {
      showAddManualRevenueModal(() => {
        window.dispatchEvent(new Event('farm-data-updated'));
        loadAndRender();
      });
    });

    // Period filter tabs
    container.querySelectorAll('[data-period]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = (btn as HTMLElement).dataset.period as PeriodFilter;
        if (p && p !== activePeriod) {
          activePeriod = p;
          loadAndRender();
        }
      });
    });

    // Type filter tabs
    container.querySelectorAll('[data-type]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = (btn as HTMLElement).dataset.type as TypeFilter;
        if (t && t !== activeType) {
          activeType = t;
          loadAndRender();
        }
      });
    });

    // Direct reactivate on inactive items
    container.querySelectorAll('.btn-reactivate-entry').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const el = btn as HTMLElement;
        const kind = el.dataset.kind;
        const id = el.dataset.id;
        if (!id) return;

        try {
          if (kind === 'expense') {
            await toggleExpenseActive(id, true, 'إعادة تفعيل المصروف من شاشة المالية');
            showToast('تمت إعادة تفعيل المصروف بنجاح', 'success');
          } else if (kind === 'manual_revenue') {
            await toggleManualRevenueActive(id, true, 'إعادة تفعيل الإيراد من شاشة المالية');
            showToast('تمت إعادة تفعيل الإيراد بنجاح', 'success');
          }
          window.dispatchEvent(new Event('farm-data-updated'));
          loadAndRender();
        } catch (err: unknown) {
          showToast('فشل إعادة التفعيل: ' + (err instanceof Error ? err.message : String(err)), 'error');
        }
      });
    });

    // Row click -> edit / sale detail
    container.querySelectorAll('.finance-entry-card').forEach((card) => {
      card.addEventListener('click', () => {
        const el = card as HTMLElement;
        const kind = el.dataset.kind;
        const id = el.dataset.id;
        const entry = visibleEntries.find((x) => x.kind === kind && x.id === id);
        if (!entry) return;

        const onUpdated = () => {
          window.dispatchEvent(new Event('farm-data-updated'));
          loadAndRender();
        };

        if (entry.kind === 'expense' && entry.expense) {
          showEditExpenseModal(entry.expense, onUpdated);
        } else if (entry.kind === 'manual_revenue' && entry.manualRevenue) {
          showEditManualRevenueModal(entry.manualRevenue, onUpdated);
        } else if (entry.kind === 'sale' && entry.sale) {
          showSaleDetailModal(entry.sale, onUpdated);
        }
      });
    });
  };

  await loadAndRender();
}
