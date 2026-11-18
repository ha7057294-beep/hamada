import {
  getCoop,
  getPairs,
  getEggsByCoop,
  getCycles,
  getSquabs,
  getBatchesByCoop,
  getEventsForEntity,
  getSettings,
} from '../db/indexedDB';
import { Egg, Cycle } from '../types';
import {
  getEggSchedule,
  formatDateArabic,
  formatDateTimeArabic,
  getSquabAge,
  formatAgeArabic,
  getEffectiveSaleDate,
} from '../utils/dateUtils';
import { icons } from '../utils/icons';
import {
  showEditCoopModal,
  showToggleCoopModal,
  showLayEggModal,
  showEditEggModal,
  showDeleteEggModal,
  showEggFertilityCheckModal,
  showEggBrokenOrLostModal,
  showAddPairModal,
  showEditPairModal,
  showChangePairModal,
  showCoopPreviousPairsModal,
  showRecordHatchModal,
  showRecordSquabDeathModal,
  showAddSquabWeightModal,
  showEditSquabModal,
  showTransferToCollectionModal,
} from '../components/Modal';

type CoopTab = 'summary' | 'eggs' | 'batches' | 'squabs' | 'history';

const selectedTabByCoop = new Map<string, CoopTab>();
const prevEggsAccordionByCoop = new Map<string, boolean>();

function getEggBadgeClass(status: string): string {
  switch (status) {
    case 'pending':
      return 'badge-warning';
    case 'fertile':
      return 'badge-success';
    case 'hatched':
      return 'badge-squab';
    case 'broken':
    case 'lost':
      return 'badge-danger';
    default:
      return 'badge-muted';
  }
}

function getEggIconClass(status: string): string {
  switch (status) {
    case 'pending':
      return 'detail-item-icon-warning';
    case 'fertile':
      return 'detail-item-icon-success';
    case 'hatched':
      return 'detail-item-icon-info';
    case 'broken':
    case 'lost':
      return 'detail-item-icon-danger';
    default:
      return 'detail-item-icon-muted';
  }
}

function normalizeCoopTab(tab: string | undefined, isCollection: boolean): CoopTab {
  if (tab === 'summary' || tab === 'squabs' || tab === 'history') {
    return tab;
  }
  if (tab === 'batches' && isCollection) {
    return 'batches';
  }
  if (tab === 'eggs' && !isCollection) {
    return 'eggs';
  }
  return 'summary';
}

export async function renderCoopDetailView(
  container: HTMLElement,
  coopId: string,
  navigate: (view: string, params?: Record<string, string>) => void,
  initialTab?: string
) {
  const [coop, pairs, eggs, cycles, allSquabs, batches, events, settings] = await Promise.all([
    getCoop(coopId),
    getPairs(),
    getEggsByCoop(coopId),
    getCycles(),
    getSquabs(),
    getBatchesByCoop(coopId),
    getEventsForEntity(coopId),
    getSettings(),
  ]);

  if (!coop) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-title">السلاكة غير موجودة</div>
        <button class="btn btn-primary" id="btn-back-coops">${icons.back} العودة لقائمة السلاكات</button>
      </div>
    `;
    container.querySelector('#btn-back-coops')?.addEventListener('click', () => navigate('coops'));
    return;
  }

  const isCollection = coop.type === 'collection';

  if (initialTab) {
    selectedTabByCoop.set(coopId, normalizeCoopTab(initialTab, isCollection));
  }
  const activeCoopTab = normalizeCoopTab(selectedTabByCoop.get(coopId), isCollection);
  selectedTabByCoop.set(coopId, activeCoopTab);

  const residentPair = pairs.find((p) => p.coopId === coop.id && p.status === 'active');
  const previousPairs = pairs.filter((p) => p.coopId === coop.id && p.status === 'inactive');
  const activeEggs = eggs.filter((e) => e.status === 'pending' || e.status === 'fertile');
  const otherHistoricalEggs = eggs
    .filter((e) => e.status === 'infertile' || e.status === 'broken' || e.status === 'lost')
    .sort((a, b) => b.laidDate.localeCompare(a.laidDate) || b.eggNumber - a.eggNumber);

  // الزغاليل الحية المتواجدة حالياً في هذه السلاكة
  const liveSquabsHere = allSquabs.filter(
    (s) =>
      (s.currentLocationId === coop.id || (!s.currentLocationId && s.originCoopId === coop.id)) &&
      (s.status === 'alive_production' || s.status === 'transferred_collection')
  );

  // الزغاليل التي نفقت في هذه السلاكة
  const deceasedSquabsHere = allSquabs.filter(
    (s) =>
      (s.currentLocationId === coop.id || (!s.currentLocationId && s.originCoopId === coop.id)) &&
      s.status === 'deceased'
  );

  // الزغاليل التي نشأت أصلاً من هذه السلاكة وتم نقلها للتجميع (سجل تاريخي لسلاكة الإنتاج)
  const transferredFromHere = allSquabs.filter(
    (s) => s.originCoopId === coop.id && (s.status === 'transferred_collection' || s.status === 'sold')
  );

  const weaningDays = settings.weaningAgeDays || 20;
  const hasReadyToTransfer = liveSquabsHere.some((s) => getSquabAge(s.hatchDate) >= weaningDays);
  const readyForSaleCount = liveSquabsHere.filter((s) => getSquabAge(s.hatchDate) >= 30).length;
  const isPrevEggsOpen = prevEggsAccordionByCoop.get(coopId) ?? false;

  const renderSummaryTab = () => {
    if (isCollection) {
      return `
        <div class="card">
          <div class="detail-kpi-grid">
            <div class="detail-kpi-item">
              <span class="detail-kpi-label">الدفعات</span>
              <strong class="detail-kpi-value detail-kpi-value-primary">${batches.length}</strong>
            </div>
            <div class="detail-kpi-item">
              <span class="detail-kpi-label">زغاليل حية</span>
              <strong class="detail-kpi-value detail-kpi-value-success">${liveSquabsHere.length}</strong>
            </div>
            <div class="detail-kpi-item">
              <span class="detail-kpi-label">جاهزة للبيع</span>
              <strong class="detail-kpi-value detail-kpi-value-info">${readyForSaleCount}</strong>
            </div>
          </div>

          ${
            coop.notes
              ? `<div class="detail-note-box"><strong>ملاحظات:</strong> ${coop.notes}</div>`
              : ''
          }

          <div class="detail-action-bar">
            <button class="btn btn-primary btn-sm btn-primary-main" id="btn-goto-batches-tab">
              ${icons.box} عرض دفعات التجميع (${batches.length})
            </button>
          </div>
        </div>
      `;
    }

    // سلاكة الإنتاج: ملخص مركز (3 أرقام أساسية + الزوج الساكن + صف إجراءات موحد)
    return `
      <div class="card">
        <div class="detail-kpi-grid">
          <div class="detail-kpi-item">
            <span class="detail-kpi-label">بيض بالحضن</span>
            <strong class="detail-kpi-value detail-kpi-value-primary">${activeEggs.length}</strong>
          </div>
          <div class="detail-kpi-item">
            <span class="detail-kpi-label">زغاليل حية</span>
            <strong class="detail-kpi-value detail-kpi-value-success">${liveSquabsHere.length}</strong>
          </div>
          <div class="detail-kpi-item">
            <span class="detail-kpi-label">أزواج سابقة</span>
            <strong class="detail-kpi-value">${previousPairs.length}</strong>
          </div>
        </div>

        ${
          residentPair
            ? `
          <div id="card-resident-pair-clickable" class="detail-subcard detail-subcard-clickable">
            <div class="detail-subcard-header">
              <div class="detail-inline-group">
                <span class="detail-item-link">${residentPair.name}</span>
                ${residentPair.breed ? `<span class="badge badge-primary">${residentPair.breed}</span>` : ''}
              </div>
              <span class="badge badge-success">نشط</span>
            </div>
            <div class="detail-item-sub">
              الذكر: <strong>${residentPair.maleInfo}</strong> • الأنثى: <strong>${residentPair.femaleInfo}</strong>
            </div>
            <div class="detail-item-sub">
              تاريخ التكوين: ${formatDateArabic(residentPair.pairedDate)}
            </div>
          </div>
        `
            : `
          <div class="detail-empty-box">
            لا يوجد زوج مسكن في هذه السلاكة حالياً.
          </div>
        `
        }

        ${
          coop.notes
            ? `<div class="detail-note-box"><strong>ملاحظات:</strong> ${coop.notes}</div>`
            : ''
        }

        <!-- Unified Action Row: 1 prominent primary action + compact secondary buttons -->
        <div class="detail-action-bar">
          ${
            !residentPair
              ? `
            <button class="btn btn-primary btn-sm btn-primary-main" id="btn-assign-pair">
              ${icons.plus} تسكين زوج جديد
            </button>
          `
              : hasReadyToTransfer
                ? `
            <button class="btn btn-primary btn-sm btn-primary-main" id="btn-transfer-to-collection">
              ${icons.truck} نقل إلى التجميع
            </button>
            ${
              coop.active
                ? `<button class="btn btn-secondary btn-sm" id="btn-lay-egg-coop">${icons.plus} وضع بيض</button>`
                : ''
            }
            <button class="btn btn-outline btn-sm" id="btn-edit-resident-pair">${icons.edit} الزوج</button>
            <button class="btn btn-outline btn-sm detail-btn-primary-text" id="btn-change-resident-pair">تغيير</button>
          `
                : `
            ${
              coop.active
                ? `<button class="btn btn-primary btn-sm btn-primary-main" id="btn-lay-egg-coop">
                    ${icons.plus} تسجيل وضع بيض
                  </button>`
                : ''
            }
            ${
              liveSquabsHere.length > 0
                ? `<button class="btn btn-secondary btn-sm" id="btn-transfer-to-collection">
                    ${icons.truck} نقل للتجميع
                  </button>`
                : ''
            }
            <button class="btn btn-outline btn-sm" id="btn-edit-resident-pair">${icons.edit} الزوج</button>
            <button class="btn btn-outline btn-sm detail-btn-primary-text" id="btn-change-resident-pair">تغيير</button>
          `
          }
          <button type="button" class="btn btn-outline btn-sm btn-previous-pairs" id="btn-previous-pairs-summary">
            ${icons.history} الأزواج السابقون (${previousPairs.length})
          </button>
        </div>
      </div>
    `;
  };

  const renderEggsTab = () => {
    return `
      <!-- Active Eggs Section (Current Clutch Grouped by Cycle) -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            ${icons.egg}
            البيض قيد الحضانة (${activeEggs.length})
          </div>
          ${
            coop.active && residentPair
              ? `<button class="btn btn-sm btn-primary" id="btn-lay-egg-coop-tab">${icons.plus} وضع بيض</button>`
              : ''
          }
        </div>

        ${(() => {
          if (activeEggs.length === 0) {
            return `
              <div class="detail-empty-box">
                <span>لا يوجد بيض بالحضانة حالياً.</span>
                ${
                  coop.active && residentPair
                    ? `<button class="btn btn-outline btn-sm" id="btn-empty-lay">${icons.plus} تسجيل وضع بيض الآن</button>`
                    : ''
                }
              </div>
            `;
          }

          const cyclesMap = new Map<string, Cycle>(cycles.map((c) => [c.id, c]));
          const groupedByCycle = new Map<string, Egg[]>();

          activeEggs.forEach((egg) => {
            const key = egg.cycleId || `coop:${coop.id}`;
            const list = groupedByCycle.get(key) || [];
            list.push(egg);
            groupedByCycle.set(key, list);
          });

          const cycleEntries = Array.from(groupedByCycle.entries())
            .map(([key, cycleEggs]) => {
              const cycle = cyclesMap.get(key);
              const sortedEggs = [...cycleEggs].sort(
                (a, b) => a.eggNumber - b.eggNumber || a.laidDate.localeCompare(b.laidDate)
              );
              return { key, cycle, eggs: sortedEggs };
            })
            .sort((a, b) => {
              const dateA = a.cycle?.startDate || a.eggs[0]?.laidDate || '';
              const dateB = b.cycle?.startDate || b.eggs[0]?.laidDate || '';
              return dateB.localeCompare(dateA);
            });

          return `
            <div class="detail-section-list">
              ${cycleEntries
                .map(
                  ({ cycle, eggs: clutchEggs }) => `
                <div class="detail-cycle-card">
                  <div class="detail-cycle-header">
                    <div class="detail-inline-group">
                      <span class="detail-item-title">${cycle ? `عش رقم ${cycle.cycleNumber}` : 'العش الحالي'}</span>
                      <span class="badge badge-primary">نشط</span>
                    </div>
                    <span class="detail-text-muted">${formatDateArabic(cycle?.startDate || clutchEggs[0]?.laidDate || '')}</span>
                  </div>

                  <div class="detail-section-list">
                    ${clutchEggs
                      .map((egg) => {
                        const schedule = getEggSchedule(egg, settings);

                        return `
                        <div class="detail-subcard ${schedule.isCheckDue ? 'detail-subcard-due' : ''}">
                          <div class="detail-subcard-header">
                            <div class="detail-subcard-leading">
                              <div class="detail-item-icon ${getEggIconClass(egg.status)}">
                                ${icons.egg}
                              </div>
                              <div class="detail-hero-meta">
                                <div class="detail-inline-group">
                                  <span class="detail-item-title">البيضة ${egg.eggNumber}</span>
                                  <span class="badge ${getEggBadgeClass(egg.status)}">
                                    ${schedule.statusText}
                                  </span>
                                </div>
                                <div class="detail-item-sub">
                                  تاريخ الوضع: ${formatDateArabic(egg.laidDate)} • منذ ${schedule.daysSinceLaid} يوم
                                </div>
                              </div>
                            </div>
                          </div>

                          <div class="detail-meta-pill-box ${schedule.isCheckDue ? 'detail-countdown-due' : ''}">
                            ${schedule.countdownText}
                          </div>

                          <div class="detail-action-row-inline">
                            <button type="button" class="btn btn-primary btn-sm btn-egg-hatch" data-egg-id="${egg.id}">
                              ${icons.squab} تسجيل فقس
                            </button>
                            ${
                              egg.status === 'pending'
                                ? `<button type="button" class="btn btn-secondary btn-sm btn-egg-check" data-egg-id="${egg.id}">
                                    ${icons.check} فحص التخصيب
                                  </button>`
                                : `<button type="button" class="btn btn-outline btn-sm btn-egg-check" data-egg-id="${egg.id}">
                                    ${icons.edit} إعادة فحص التخصيب
                                  </button>`
                            }
                            <button type="button" class="btn btn-danger btn-sm btn-egg-broken" data-egg-id="${egg.id}">
                              ${icons.eggCrack} تسجيل كسر أو فقدان
                            </button>
                            <button type="button" class="btn btn-outline btn-sm btn-egg-edit" data-egg-id="${egg.id}">
                              ${icons.edit} تعديل
                            </button>
                            <button type="button" class="btn btn-outline btn-sm detail-btn-danger-text btn-egg-delete" data-egg-id="${egg.id}">
                              ${icons.trash} حذف
                            </button>
                          </div>
                        </div>
                      `;
                      })
                      .join('')}
                  </div>
                </div>
              `
                )
                .join('')}
            </div>
          `;
        })()}
      </div>

      ${
        otherHistoricalEggs.length > 0
          ? `
        <section class="card tasks-accordion-card">
          <button
            type="button"
            class="tasks-accordion-header"
            id="btn-prev-eggs-accordion"
            aria-expanded="${isPrevEggsOpen ? 'true' : 'false'}"
          >
            <span class="tasks-accordion-leading">
              <span class="tasks-card-icon">${icons.history}</span>
              <span class="tasks-accordion-title">بيض سابق</span>
            </span>
            <span class="tasks-accordion-trailing">
              <span class="tasks-count-badge">${otherHistoricalEggs.length}</span>
              <span class="tasks-accordion-chevron">${icons.chevronDown}</span>
            </span>
          </button>

          <div class="tasks-accordion-body ${isPrevEggsOpen ? 'open' : ''}" id="prev-eggs-accordion-body">
            <div class="tasks-accordion-body-inner">
              <div class="tasks-accordion-content">
                <div class="detail-section-list">
                  ${otherHistoricalEggs
                    .map(
                      (egg) => `
                    <div class="detail-subcard">
                      <div class="detail-subcard-header">
                        <div class="detail-inline-group">
                          <span class="detail-item-title">البيضة رقم ${egg.eggNumber}</span>
                          <span class="badge ${egg.status === 'infertile' ? 'badge-muted' : 'badge-danger'}">
                            ${egg.status === 'infertile' ? 'رايقة' : egg.status === 'broken' ? 'مكسورة' : 'مفقودة'}
                          </span>
                        </div>
                        <span class="detail-item-sub">وضعت ${formatDateArabic(egg.laidDate)}</span>
                      </div>
                      <div class="detail-action-row-inline">
                        <button type="button" class="btn btn-outline btn-sm btn-egg-edit" data-egg-id="${egg.id}">
                          ${icons.edit} تعديل
                        </button>
                        <button type="button" class="btn btn-outline btn-sm detail-btn-danger-text btn-egg-delete" data-egg-id="${egg.id}">
                          ${icons.trash} حذف
                        </button>
                      </div>
                    </div>
                  `
                    )
                    .join('')}
                </div>
              </div>
            </div>
          </div>
        </section>
      `
          : ''
      }
    `;
  };

  const renderBatchesTab = () => {
    return `
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            ${icons.box}
            دفعات التجميع (${batches.length})
          </div>
        </div>

        ${
          batches.length === 0
            ? `
          <div class="detail-empty-box">
            <strong>لا توجد دفعات تجميع في هذه السلاكة بعد</strong>
            <span>يمكنك نقل الزغاليل المفطومة (عمر 20+ يوم) من سلاكات الإنتاج إلى هنا، وستُنشأ كل عملية نقل كدفعة مستقلة.</span>
          </div>
        `
            : `
          <div class="detail-section-list">
            ${batches
              .map((batch) => {
                const bSquabs = allSquabs.filter((s) => s.batchId === batch.id);
                const bLive = bSquabs.filter(
                  (s) => s.status === 'transferred_collection' || s.status === 'alive_production'
                );
                const bSold = bSquabs.filter((s) => s.status === 'sold');

                let ageRange = '—';
                if (bLive.length > 0) {
                  const ages = bLive.map((s) => getSquabAge(s.hatchDate));
                  const min = Math.min(...ages);
                  const max = Math.max(...ages);
                  ageRange = min === max ? `${min} يوم` : `من ${min} إلى ${max} يوم`;
                }

                let targetSaleRange = '—';
                if (bLive.length > 0) {
                  const dates = bLive.map((s) => getEffectiveSaleDate(s)).sort();
                  targetSaleRange =
                    dates[0] === dates[dates.length - 1]
                      ? formatDateArabic(dates[0])
                      : `من ${formatDateArabic(dates[0])} إلى ${formatDateArabic(dates[dates.length - 1])}`;
                }

                let statusBadge = `<span class="badge badge-squab">قيد التربية</span>`;
                if (batch.status === 'fully_sold') {
                  statusBadge = `<span class="badge badge-success">مباعة بالكامل ✓</span>`;
                } else if (bLive.some((s) => getSquabAge(s.hatchDate) >= 30)) {
                  statusBadge = `<span class="badge badge-warning">جاهزة للبيع (30+ يوم)</span>`;
                }

                return `
                <div class="detail-subcard detail-subcard-clickable batch-card-item" data-batch-id="${batch.id}">
                  <div class="detail-subcard-header">
                    <div class="detail-subcard-leading">
                      <div class="detail-item-icon">${icons.box}</div>
                      <div class="detail-hero-meta">
                        <div class="detail-inline-group">
                          <span class="detail-item-title">${batch.batchNumber}</span>
                          ${statusBadge}
                        </div>
                        <div class="detail-item-sub">
                          تاريخ النقل: <strong>${formatDateArabic(batch.transferDate)}</strong>
                        </div>
                      </div>
                    </div>
                    <button class="btn btn-outline btn-sm btn-open-batch" data-batch-id="${batch.id}">
                      فتح ←
                    </button>
                  </div>

                  <div class="detail-kpi-grid">
                    <div class="detail-kpi-item">
                      <span class="detail-kpi-label">الحي</span>
                      <strong class="detail-kpi-value detail-kpi-value-success">${bLive.length}</strong>
                    </div>
                    <div class="detail-kpi-item">
                      <span class="detail-kpi-label">المباع</span>
                      <strong class="detail-kpi-value">${bSold.length}</strong>
                    </div>
                    <div class="detail-kpi-item">
                      <span class="detail-kpi-label">الأعمار</span>
                      <strong class="detail-kpi-value-sm">${ageRange}</strong>
                    </div>
                  </div>

                  <div class="detail-info-row">
                    <span class="detail-info-label">موعد البيع المستهدف:</span>
                    <strong class="detail-text-info">${targetSaleRange}</strong>
                  </div>
                </div>
              `;
              })
              .join('')}
          </div>
        `
        }
      </div>
    `;
  };

  const renderSquabsTab = () => {
    return `
      <!-- Live Squabs Section -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            ${icons.squab}
            الزغاليل الحية (${liveSquabsHere.length})
          </div>
          ${
            !isCollection && liveSquabsHere.length > 0
              ? `<button class="btn btn-primary btn-sm" id="btn-transfer-to-collection-tab">
                  ${icons.truck} نقل إلى التجميع
                </button>`
              : ''
          }
        </div>

        ${
          liveSquabsHere.length === 0
            ? `
          <div class="detail-empty-box">
            ${
              isCollection
                ? 'لا توجد زغاليل حية في هذه السلاكة حالياً.'
                : 'لا توجد زغاليل حية في هذه السلاكة حالياً. (تظهر هنا تلقائياً عند تسجيل فقس أي بيضة).'
            }
          </div>
        `
            : `
          <div class="detail-section-list">
            ${liveSquabsHere
              .map((squab) => {
                const age = getSquabAge(squab.hatchDate);
                const isReadyTransfer = !isCollection && age >= weaningDays;
                const isReadySale = isCollection && age >= 30;
                const latestWeight =
                  squab.weights && squab.weights.length > 0 ? squab.weights[squab.weights.length - 1] : null;

                return `
                <div class="detail-subcard ${isReadyTransfer || isReadySale ? 'detail-subcard-due' : ''}">
                  <div class="detail-subcard-header">
                    <div class="detail-subcard-leading">
                      <div class="detail-item-icon detail-item-icon-success">
                        ${icons.squab}
                      </div>
                      <div class="detail-hero-meta">
                        <div class="detail-inline-group">
                          <span class="detail-item-link btn-view-squab" data-squab-id="${squab.id}">${squab.codeNumber}</span>
                          <span class="badge ${squab.status === 'transferred_collection' ? 'badge-primary' : 'badge-success'}">
                            ${squab.status === 'transferred_collection' ? 'منقول للتجميع' : 'حي في الإنتاج'}
                          </span>
                          ${
                            isReadyTransfer
                              ? `<span class="badge badge-transfer">${icons.truck} جاهز للنقل</span>`
                              : ''
                          }
                          ${
                            isReadySale
                              ? `<span class="badge badge-warning">${icons.cash} جاهز للبيع</span>`
                              : ''
                          }
                        </div>
                        <div class="detail-item-sub">
                          الفقس: ${formatDateArabic(squab.hatchDate)} • <strong>العمر: ${formatAgeArabic(age)}</strong>
                        </div>
                      </div>
                    </div>

                    <button class="btn btn-outline btn-sm btn-view-squab" data-squab-id="${squab.id}">
                      التفاصيل ←
                    </button>
                  </div>

                  ${
                    latestWeight || squab.illnessOrInjury
                      ? `
                    <div class="detail-meta-pill-box">
                      ${
                        latestWeight
                          ? `<span><strong>الوزن الأخير:</strong> ${latestWeight.weightGrams} جم (${formatDateArabic(latestWeight.date)})</span>`
                          : ''
                      }
                      ${
                        squab.illnessOrInjury
                          ? `<span class="detail-text-warning"><strong>الحالة الصحية:</strong> ${squab.illnessOrInjury}</span>`
                          : '<span class="detail-text-success"><strong>الحالة:</strong> سليم</span>'
                      }
                    </div>
                  `
                      : ''
                  }

                  <div class="detail-action-row-inline">
                    <button type="button" class="btn btn-secondary btn-sm btn-weight-squab" data-squab-id="${squab.id}">
                      ${icons.scale} تسجيل وزن
                    </button>
                    <button type="button" class="btn btn-outline btn-sm btn-edit-squab" data-squab-id="${squab.id}">
                      ${icons.edit} تعديل
                    </button>
                    <button type="button" class="btn btn-danger btn-sm btn-death-squab" data-squab-id="${squab.id}">
                      ${icons.skull} تسجيل نفوق
                    </button>
                  </div>
                </div>
              `;
              })
              .join('')}
          </div>
        `
        }
      </div>

      ${
        !isCollection && transferredFromHere.length > 0
          ? `
        <div class="card">
          <div class="card-header">
            <div class="card-title">
              ${icons.truck}
              زغاليل منقولة من هذه السلاكة (${transferredFromHere.length})
            </div>
          </div>
          <div class="detail-section-list">
            ${transferredFromHere
              .map((s) => {
                const isSold = s.status === 'sold';
                return `
                <div class="detail-subcard">
                  <div class="detail-subcard-header">
                    <div class="detail-inline-group">
                      <span class="squab-name-link detail-item-link" data-squab-id="${s.id}">${s.codeNumber}</span>
                      <span class="badge ${isSold ? 'badge-primary' : 'badge-muted'}">
                        ${isSold ? 'مباع ✓' : 'منقول للتجميع'}
                      </span>
                    </div>
                    <div class="detail-item-sub">
                      بعمر ${s.ageAtTransfer ?? '—'} يوم (${formatDateArabic(s.transferDate || '')})
                    </div>
                  </div>
                  <div class="detail-action-row-inline">
                    <button type="button" class="btn btn-outline btn-sm btn-view-squab" data-squab-id="${s.id}">
                      التفاصيل ←
                    </button>
                    <button type="button" class="btn btn-outline btn-sm btn-edit-squab" data-squab-id="${s.id}">
                      ${icons.edit} تعديل
                    </button>
                  </div>
                </div>
              `;
              })
              .join('')}
          </div>
        </div>
      `
          : ''
      }

      ${
        deceasedSquabsHere.length > 0
          ? `
        <div class="card detail-subcard-danger">
          <div class="card-header">
            <div class="card-title detail-text-danger">
              ${icons.skull}
              زغاليل نافقة في هذه السلاكة (${deceasedSquabsHere.length})
            </div>
          </div>
          <div class="detail-section-list">
            ${deceasedSquabsHere
              .map(
                (s) => `
              <div class="detail-subcard detail-subcard-danger">
                <div class="detail-subcard-header">
                  <div class="detail-inline-group">
                    <span class="squab-name-link detail-item-link-danger" data-squab-id="${s.id}">${s.codeNumber}</span>
                    <span class="detail-item-sub">عمر النفوق: ${s.deathAgeDays ?? '—'} يوم</span>
                  </div>
                  <div class="detail-text-muted">
                    ${s.deathReason ? `السبب: ${s.deathReason}` : `بتاريخ ${formatDateArabic(s.deathDate || '')}`}
                  </div>
                </div>
                <div class="detail-action-row-inline">
                  <button type="button" class="btn btn-outline btn-sm btn-view-squab" data-squab-id="${s.id}">
                    التفاصيل ←
                  </button>
                  <button type="button" class="btn btn-outline btn-sm btn-edit-squab" data-squab-id="${s.id}">
                    ${icons.edit} تعديل
                  </button>
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      `
          : ''
      }
    `;
  };

  const renderHistoryTab = () => {
    return `
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            ${icons.history}
            سجل أحداث السلاكة (${events.length})
          </div>
        </div>
        ${
          events.length === 0
            ? `<div class="detail-empty-box">لا توجد أحداث مسجلة لهذه السلاكة.</div>`
            : `
          <div class="timeline">
            ${events
              .map(
                (evt) => `
              <div class="timeline-item">
                <div class="timeline-dot timeline-dot-sm">${icons.check}</div>
                <div class="timeline-content timeline-content-sm">
                  <span class="timeline-time">${formatDateTimeArabic(evt.date)}</span>
                  <span class="timeline-text">${evt.note || evt.type}</span>
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        `
        }
      </div>
    `;
  };

  container.innerHTML = `
    <!-- Top Back Bar -->
    <div class="detail-topbar">
      <button class="btn btn-outline btn-sm" id="btn-back">
        ${icons.back} السلاكات
      </button>
      <div class="detail-topbar-actions">
        <button class="btn btn-outline btn-sm" id="btn-edit-coop">
          ${icons.edit} تعديل
        </button>
        <button class="btn btn-outline btn-sm ${coop.active ? 'detail-btn-danger-text' : 'detail-btn-success-text'}" id="btn-toggle-coop">
          ${coop.active ? icons.pause : icons.play}
          ${coop.active ? 'إيقاف' : 'تفعيل'}
        </button>
      </div>
    </div>

    <!-- Compact Hero Card -->
    <div class="card detail-hero-card">
      <div class="detail-hero-row">
        <div class="detail-hero-icon ${coop.active ? '' : 'detail-hero-icon-muted'}">
          ${coop.number}
        </div>
        <div class="detail-hero-meta">
          <h1 class="detail-hero-title">سلاكة رقم ${coop.number}</h1>
          <div class="detail-hero-badges">
            <span class="badge ${isCollection ? 'badge-muted' : 'badge-primary'}">
              ${isCollection ? 'تجميع وفطام' : 'إنتاج وتزاوج'}
            </span>
            <span class="badge ${coop.active ? 'badge-success' : 'badge-danger'}">
              ${coop.active ? 'نشطة' : 'متوقفة'}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Horizontal Tabs -->
    <div class="filter-tabs" role="tablist">
      <button type="button" class="filter-tab ${activeCoopTab === 'summary' ? 'active' : ''}" role="tab" aria-selected="${activeCoopTab === 'summary' ? 'true' : 'false'}" data-tab="summary">
        ملخص
      </button>
      ${
        isCollection
          ? `<button type="button" class="filter-tab ${activeCoopTab === 'batches' ? 'active' : ''}" role="tab" aria-selected="${activeCoopTab === 'batches' ? 'true' : 'false'}" data-tab="batches">
              دفعات (${batches.length})
            </button>`
          : `<button type="button" class="filter-tab ${activeCoopTab === 'eggs' ? 'active' : ''}" role="tab" aria-selected="${activeCoopTab === 'eggs' ? 'true' : 'false'}" data-tab="eggs">
              بيض (${activeEggs.length})
            </button>`
      }
      <button type="button" class="filter-tab ${activeCoopTab === 'squabs' ? 'active' : ''}" role="tab" aria-selected="${activeCoopTab === 'squabs' ? 'true' : 'false'}" data-tab="squabs">
        زغاليل (${liveSquabsHere.length})
      </button>
      <button type="button" class="filter-tab ${activeCoopTab === 'history' ? 'active' : ''}" role="tab" aria-selected="${activeCoopTab === 'history' ? 'true' : 'false'}" data-tab="history">
        سجل
      </button>
    </div>

    <!-- Active Tab Panel -->
    ${
      activeCoopTab === 'summary'
        ? renderSummaryTab()
        : activeCoopTab === 'batches'
          ? renderBatchesTab()
          : activeCoopTab === 'eggs'
            ? renderEggsTab()
            : activeCoopTab === 'squabs'
              ? renderSquabsTab()
              : renderHistoryTab()
    }
  `;

  // Tab switching
  container.querySelectorAll('.filter-tab[data-tab]').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      const nextTab = (tabBtn as HTMLElement).dataset.tab as CoopTab;
      if (nextTab && nextTab !== activeCoopTab) {
        selectedTabByCoop.set(coopId, nextTab);
        renderCoopDetailView(container, coopId, navigate);
      }
    });
  });

  container.querySelector('#btn-goto-batches-tab')?.addEventListener('click', () => {
    selectedTabByCoop.set(coopId, 'batches');
    renderCoopDetailView(container, coopId, navigate);
  });

  // Previous eggs accordion toggle
  const prevEggsBtn = container.querySelector('#btn-prev-eggs-accordion') as HTMLButtonElement | null;
  const prevEggsBody = container.querySelector('#prev-eggs-accordion-body');
  if (prevEggsBtn && prevEggsBody) {
    prevEggsBtn.addEventListener('click', () => {
      const nextOpen = !(prevEggsAccordionByCoop.get(coopId) ?? false);
      prevEggsAccordionByCoop.set(coopId, nextOpen);
      prevEggsBtn.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
      prevEggsBody.classList.toggle('open', nextOpen);
    });
  }

  // Top & Summary Handlers
  container.querySelector('#btn-back')?.addEventListener('click', () => navigate('coops'));

  container.querySelector('#btn-edit-coop')?.addEventListener('click', () => {
    showEditCoopModal(coop, () => renderCoopDetailView(container, coopId, navigate));
  });

  container.querySelector('#btn-toggle-coop')?.addEventListener('click', () => {
    showToggleCoopModal(coop, () => renderCoopDetailView(container, coopId, navigate));
  });

  container.querySelector('#card-resident-pair-clickable')?.addEventListener('click', () => {
    if (residentPair) navigate('pair_detail', { pairId: residentPair.id });
  });

  container.querySelector('#btn-edit-resident-pair')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (residentPair) {
      showEditPairModal(residentPair, () => renderCoopDetailView(container, coopId, navigate));
    }
  });

  container.querySelector('#btn-change-resident-pair')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (residentPair) {
      showChangePairModal(coop, residentPair, () => renderCoopDetailView(container, coopId, navigate));
    }
  });

  container.querySelectorAll('.btn-previous-pairs').forEach((btn) => {
    btn.addEventListener('click', () => {
      showCoopPreviousPairsModal(coop, navigate);
    });
  });

  container.querySelector('#btn-assign-pair')?.addEventListener('click', () => {
    showAddPairModal(coop.id, () => renderCoopDetailView(container, coopId, navigate));
  });

  const handleLayEgg = () => {
    if (residentPair) {
      showLayEggModal(residentPair.id, coop.id, () => renderCoopDetailView(container, coopId, navigate));
    }
  };
  container.querySelector('#btn-lay-egg-coop')?.addEventListener('click', handleLayEgg);
  container.querySelector('#btn-lay-egg-coop-tab')?.addEventListener('click', handleLayEgg);
  container.querySelector('#btn-empty-lay')?.addEventListener('click', handleLayEgg);

  const handleTransfer = () => {
    showTransferToCollectionModal(coop.id, () => renderCoopDetailView(container, coopId, navigate));
  };
  container.querySelector('#btn-transfer-to-collection')?.addEventListener('click', handleTransfer);
  container.querySelector('#btn-transfer-to-collection-tab')?.addEventListener('click', handleTransfer);

  // Batch clicks in collection coop
  container.querySelectorAll('.batch-card-item, .btn-open-batch').forEach((elem) => {
    elem.addEventListener('click', (e) => {
      e.stopPropagation();
      const bId = (elem as HTMLElement).dataset.batchId;
      if (bId) navigate('batch_detail', { batchId: bId });
    });
  });

  // Egg Hatch buttons
  container.querySelectorAll('.btn-egg-hatch').forEach((btn) => {
    btn.addEventListener('click', () => {
      const eggId = (btn as HTMLElement).dataset.eggId;
      const targetEgg = eggs.find((e) => e.id === eggId);
      if (targetEgg) {
        const eggPair = pairs.find((p) => p.id === targetEgg.pairId) || residentPair;
        showRecordHatchModal(
          targetEgg,
          eggPair ? eggPair.name : '—',
          coop.number,
          () => renderCoopDetailView(container, coopId, navigate)
        );
      }
    });
  });

  // Egg check buttons
  container.querySelectorAll('.btn-egg-check').forEach((btn) => {
    btn.addEventListener('click', () => {
      const eggId = (btn as HTMLElement).dataset.eggId;
      const targetEgg = eggs.find((e) => e.id === eggId);
      if (targetEgg) {
        const eggPair = pairs.find((p) => p.id === targetEgg.pairId) || residentPair;
        showEggFertilityCheckModal(
          targetEgg,
          eggPair ? eggPair.name : '—',
          coop.number,
          () => renderCoopDetailView(container, coopId, navigate)
        );
      }
    });
  });

  // Egg broken / lost buttons
  container.querySelectorAll('.btn-egg-broken').forEach((btn) => {
    btn.addEventListener('click', () => {
      const eggId = (btn as HTMLElement).dataset.eggId;
      const targetEgg = eggs.find((e) => e.id === eggId);
      if (targetEgg) {
        const eggPair = pairs.find((p) => p.id === targetEgg.pairId) || residentPair;
        showEggBrokenOrLostModal(
          targetEgg,
          eggPair ? eggPair.name : '—',
          coop.number,
          () => renderCoopDetailView(container, coopId, navigate)
        );
      }
    });
  });

  // Egg edit buttons
  container.querySelectorAll('.btn-egg-edit').forEach((btn) => {
    btn.addEventListener('click', () => {
      const eggId = (btn as HTMLElement).dataset.eggId;
      const targetEgg = eggs.find((e) => e.id === eggId);
      if (targetEgg) {
        showEditEggModal(targetEgg, () => renderCoopDetailView(container, coopId, navigate));
      }
    });
  });

  // Egg delete buttons
  container.querySelectorAll('.btn-egg-delete').forEach((btn) => {
    btn.addEventListener('click', () => {
      const eggId = (btn as HTMLElement).dataset.eggId;
      const targetEgg = eggs.find((e) => e.id === eggId);
      if (targetEgg) {
        const eggPair = pairs.find((p) => p.id === targetEgg.pairId) || residentPair;
        showDeleteEggModal(
          targetEgg,
          eggPair ? eggPair.name : '—',
          coop.number,
          () => renderCoopDetailView(container, coopId, navigate)
        );
      }
    });
  });

  // Squab link & actions
  container.querySelectorAll('.squab-name-link, .btn-view-squab').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const squabId = (btn as HTMLElement).dataset.squabId;
      if (squabId) navigate('squab_detail', { squabId });
    });
  });

  container.querySelectorAll('.btn-weight-squab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const squabId = (btn as HTMLElement).dataset.squabId;
      const targetSquab = allSquabs.find((s) => s.id === squabId);
      if (targetSquab) {
        showAddSquabWeightModal(targetSquab, () => renderCoopDetailView(container, coopId, navigate));
      }
    });
  });

  container.querySelectorAll('.btn-edit-squab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const squabId = (btn as HTMLElement).dataset.squabId;
      const targetSquab = allSquabs.find((s) => s.id === squabId);
      if (targetSquab) {
        showEditSquabModal(targetSquab, () => renderCoopDetailView(container, coopId, navigate));
      }
    });
  });

  container.querySelectorAll('.btn-death-squab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const squabId = (btn as HTMLElement).dataset.squabId;
      const targetSquab = allSquabs.find((s) => s.id === squabId);
      if (targetSquab) {
        showRecordSquabDeathModal(targetSquab, () => renderCoopDetailView(container, coopId, navigate));
      }
    });
  });
}
