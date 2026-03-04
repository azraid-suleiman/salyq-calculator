/**
 * ═══════════════════════════════════════════════════════════════
 *  Salyq Calc — Калькулятор транспортного налога
 *  Статья 492 Налогового кодекса Республики Казахстан
 * ═══════════════════════════════════════════════════════════════
 */

// ──────────────────────────────────────────────────────────────
//  МРП по годам (тенге)
// ──────────────────────────────────────────────────────────────
const MRP_BY_YEAR = {
    2016: 2121,
    2017: 2269,
    2018: 2405,
    2019: 2525,
    2020: 2651,   // до апреля 2651, с апреля 2778 (берём среднее/стандарт)
    2021: 2917,
    2022: 3063,
    2023: 3450,
    2024: 3692,
    2025: 3932,
    2026: 4325
};

function getMRP(year) {
    return MRP_BY_YEAR[year] || MRP_BY_YEAR[2026];
}

// ──────────────────────────────────────────────────────────────
//  ВОЗРАСТНОЙ КОЭФФИЦИЕНТ (только с 2026 года)
// ──────────────────────────────────────────────────────────────
function getAgeCoefficient(yearOfCalc, yearManufactured) {
    if (!yearManufactured || yearOfCalc < 2026) return 1.0;
    const age = yearOfCalc - yearManufactured;
    if (age > 20) return 0.5;
    if (age >= 10) return 0.7;
    return 1.0;
}

// ──────────────────────────────────────────────────────────────
//  ГЛАВНАЯ ФУНКЦИЯ РАСЧЁТА
// ──────────────────────────────────────────────────────────────
/**
 * @param {Object} p
 * @param {string}  p.type           — тип ТС
 * @param {number}  p.value          — объём см³ / грузоподъёмность т / мест / кВт / кг / л.с.
 * @param {number}  p.yearOfCalc     — год исчисления
 * @param {string}  p.regDate        — 'before2013' | 'after2013' (только для легков. >3000)
 * @param {number}  p.months         — кол-во месяцев владения
 * @param {number}  p.yearManufact   — год выпуска (для возраст. коэф.)
 * @returns {{ tax: number, details: Object }}
 */
function calculateTransportTax(p) {
    const mrp    = getMRP(p.yearOfCalc);
    const months = p.months || 12;
    const ageCf  = getAgeCoefficient(p.yearOfCalc, p.yearManufact);
    const v      = parseFloat(p.value);

    let baseTax = 0;
    let details = { bracket: '', formula: '', mrp, ageCf };

    switch (p.type) {

        // ── 1. ЛЕГКОВЫЕ АВТОМОБИЛИ ─────────────────────────
        case 'passenger': {
            if (v <= 3000) {
                // Прогрессивная сетка до 3000 см³
                const brackets = [
                    { min: 0,    max: 1100, base: 1,  over: 0    },
                    { min: 1100, max: 1500, base: 2,  over: 1100 },
                    { min: 1500, max: 2000, base: 3,  over: 1500 },
                    { min: 2000, max: 2500, base: 6,  over: 2000 },
                    { min: 2500, max: 3000, base: 9,  over: 2500 }
                ];
                const b = brackets.find(b => v > b.min && v <= b.max) || brackets[0];
                const overAmount = Math.max(0, v - b.over) * 7;
                baseTax = b.base * mrp + overAmount;
                details.bracket = `${b.min ? b.min + 1 : 0}–${b.max} куб.см`;
                details.formula = `${b.base} МРП × ${fmt(mrp)} ₸` +
                    (b.over && v > b.over ? ` + ${Math.round(v - b.over)} см³ × 7 ₸` : '');

            } else {
                // > 3000 см³ — зависит от даты регистрации/ввоза
                if (p.regDate === 'before2013') {
                    // До 31.12.2013 включительно — плоская + 7 тг/куб сверх порога
                    if (v <= 4000) {
                        baseTax = 15 * mrp + (v - 3000) * 7;
                        details.bracket = '3 001–4 000 куб.см (до 31.12.2013)';
                        details.formula = `15 МРП × ${fmt(mrp)} ₸ + ${Math.round(v - 3000)} см³ × 7 ₸`;
                    } else {
                        baseTax = 117 * mrp + (v - 4000) * 7;
                        details.bracket = 'Свыше 4 000 куб.см (до 31.12.2013)';
                        details.formula = `117 МРП × ${fmt(mrp)} ₸ + ${Math.round(v - 4000)} см³ × 7 ₸`;
                    }
                } else {
                    // После 31.12.2013 — прогрессивная шкала + 7 тг/куб
                    const brackets = [
                        { min: 3000, max: 3200, base: 35,  over: 3000 },
                        { min: 3200, max: 3500, base: 46,  over: 3200 },
                        { min: 3500, max: 4000, base: 66,  over: 3500 },
                        { min: 4000, max: 5000, base: 130, over: 4000 },
                        { min: 5000, max: Infinity, base: 200, over: 5000 }
                    ];
                    const b = brackets.find(b => v > b.min && v <= b.max);
                    const overAmount = (v - b.over) * 7;
                    baseTax = b.base * mrp + overAmount;
                    details.bracket = `${b.min + 1}–${b.max === Infinity ? '∞' : b.max} куб.см (после 31.12.2013)`;
                    details.formula = `${b.base} МРП × ${fmt(mrp)} ₸ + ${Math.round(v - b.over)} см³ × 7 ₸`;
                }
            }
            break;
        }

        // ── 2. ГРУЗОВЫЕ АВТОМОБИЛИ ─────────────────────────
        case 'truck': {
            // Грузоподъёмность в тоннах
            let base, bracket;
            if      (v <= 1.5)      { base = 3;  bracket = 'до 1.5 тонн'; }
            else if (v <= 5)        { base = 5;  bracket = '1.5–5 тонн';  }
            else if (v <= 10)       { base = 7;  bracket = '5–10 тонн';   }
            else                    { base = 9;  bracket = 'свыше 10 тонн'; }
            baseTax = base * mrp;
            details.bracket = bracket;
            details.formula = `${base} МРП × ${fmt(mrp)} ₸`;
            break;
        }

        // ── 3. АВТОБУСЫ ───────────────────────────────────
        case 'bus': {
            // Количество посадочных мест
            let base, bracket;
            if      (v <= 12)  { base = 9;  bracket = 'до 12 мест';     }
            else if (v <= 25)  { base = 14; bracket = '13–25 мест';     }
            else               { base = 20; bracket = 'свыше 25 мест';  }
            baseTax = base * mrp;
            details.bracket = bracket;
            details.formula = `${base} МРП × ${fmt(mrp)} ₸`;
            break;
        }

        // ── 4. МОТОЦИКЛЫ И МОПЕДЫ ─────────────────────────
        case 'motorcycle': {
            // Мощность в кВт
            let base, bracket;
            if (v <= 55) { base = 1;  bracket = 'до 55 кВт';     }
            else         { base = 10; bracket = 'свыше 55 кВт';  }
            baseTax = base * mrp;
            details.bracket = bracket;
            details.formula = `${base} МРП × ${fmt(mrp)} ₸`;
            break;
        }

        // ── 5. ЖЕЛЕЗНОДОРОЖНЫЙ ТРАНСПОРТ ──────────────────
        case 'railway': {
            // 1% от МРП за каждую л.с. мощности двигателя
            baseTax = mrp * 0.01 * v;
            details.bracket = `${v} л.с.`;
            details.formula = `${fmt(mrp)} ₸ × 1% × ${v} л.с.`;
            break;
        }

        // ── 6. МОРСКИЕ И РЕЧНЫЕ СУДА ──────────────────────
        case 'marine': {
            // Маломерные суда: 0.5 МРП за 1 кВт
            // Катера/яхты свыше опр. мощности — по шкале
            const marineBrackets = [
                { min: 0,   max: 55,  base: 10,  ratePerKw: 0 },
                { min: 55,  max: 110, base: 20,  ratePerKw: 0 },
                { min: 110, max: 165, base: 30,  ratePerKw: 0 },
                { min: 165, max: 220, base: 40,  ratePerKw: 0 },
                { min: 220, max: Infinity, base: 60, ratePerKw: 0 }
            ];
            if (v <= 18.5) {
                // Маломерные: 0.5 МРП / кВт
                baseTax = 0.5 * mrp * v;
                details.bracket = 'Маломерное судно (до 18.5 кВт)';
                details.formula = `0.5 МРП × ${fmt(mrp)} ₸ × ${v} кВт`;
            } else {
                const b = marineBrackets.find(b => v > b.min && v <= b.max) || marineBrackets[marineBrackets.length - 1];
                baseTax = b.base * mrp;
                details.bracket = `Катер/яхта ${b.min + 1}–${b.max === Infinity ? '∞' : b.max} кВт`;
                details.formula = `${b.base} МРП × ${fmt(mrp)} ₸`;
            }
            break;
        }

        // ── 7. ЛЕТАТЕЛЬНЫЕ АППАРАТЫ ───────────────────────
        case 'aircraft': {
            // 4% от МРП за каждый кг максимальной взлётной массы
            baseTax = mrp * 0.04 * v;
            details.bracket = `${fmt(v)} кг`;
            details.formula = `${fmt(mrp)} ₸ × 4% × ${fmt(v)} кг`;
            break;
        }

        // ── 8. СПЕЦТЕХНИКА / ТРАКТОРЫ ─────────────────────
        case 'special': {
            // С/х техника освобождена, прочая — 3 МРП
            baseTax = 3 * mrp;
            details.bracket = 'Спецтехника (не с/х)';
            details.formula = `3 МРП × ${fmt(mrp)} ₸`;
            break;
        }

        default:
            return null;
    }

    // Применяем возрастной коэффициент
    const taxWithAge = baseTax * ageCf;

    // Формула владения: (годовой налог / 12) × месяцы
    const finalTax = (taxWithAge / 12) * months;

    return {
        tax: Math.round(finalTax),
        details: {
            ...details,
            baseTax:    Math.round(baseTax),
            taxWithAge: Math.round(taxWithAge),
            months,
            yearOfCalc: p.yearOfCalc,
            yearManufact: p.yearManufact
        }
    };
}

// ──────────────────────────────────────────────────────────────
//  UI — Конфигурация полей по типу ТС
// ──────────────────────────────────────────────────────────────
const UI_CONFIG = {
    passenger: {
        section:    'passengerFields',
        rangeEl:    'passengerRange',
        inputEl:    'engineVolume',
        hintEl:     'engineVolumeHint',
        valueLabel: v => `Объём двигателя: ${fmt(v)} куб.см`,
        ranges: {
            low:  { min: 1,    max: 3000,  hint: 'Число от 1 до 3 000',    ph: 'Например: 2000' },
            high: { min: 3001, max: 10000, hint: 'Число от 3 001 до 10 000', ph: 'Например: 3500' }
        }
    },
    truck: {
        section:    'truckFields',
        rangeEl:    'truckRange',
        inputEl:    'truckCapacity',
        hintEl:     'truckCapacityHint',
        valueLabel: v => `Грузоподъёмность: ${v} тонн`,
        ranges: {
            low:  { min: 0.1, max: 1.5, hint: 'Тонн: до 1.5',    ph: 'Например: 1.0' },
            mid:  { min: 1.5, max: 5,   hint: 'Тонн: 1.5–5',     ph: 'Например: 3.0' },
            high: { min: 5,   max: 100, hint: 'Тонн: свыше 5',   ph: 'Например: 8.0' }
        }
    },
    bus: {
        section:    'busFields',
        rangeEl:    null,
        inputEl:    'busSeats',
        hintEl:     'busSeatsHint',
        valueLabel: v => `Посадочных мест: ${v}`,
        ranges: null
    },
    motorcycle: {
        section:    'motorcycleFields',
        rangeEl:    null,
        inputEl:    'motorcyclePower',
        hintEl:     'motorcyclePowerHint',
        valueLabel: v => `Мощность: ${v} кВт`,
        ranges: null
    },
    railway: {
        section:    'railwayFields',
        rangeEl:    null,
        inputEl:    'railwayPower',
        hintEl:     'railwayPowerHint',
        valueLabel: v => `Мощность двигателя: ${v} л.с.`,
        ranges: null
    },
    marine: {
        section:    'marineFields',
        rangeEl:    null,
        inputEl:    'marinePower',
        hintEl:     'marinePowerHint',
        valueLabel: v => `Мощность: ${v} кВт`,
        ranges: null
    },
    aircraft: {
        section:    'aircraftFields',
        rangeEl:    null,
        inputEl:    'aircraftMass',
        hintEl:     'aircraftMassHint',
        valueLabel: v => `Взлётная масса: ${fmt(v)} кг`,
        ranges: null
    },
    special: {
        section:    'specialFields',
        rangeEl:    null,
        inputEl:    null,
        hintEl:     null,
        valueLabel: v => 'Спецтехника',
        ranges: null
    }
};

const ALL_SECTIONS = Object.values(UI_CONFIG).map(c => c.section).filter(Boolean);

// ──────────────────────────────────────────────────────────────
//  DOM REFS
// ──────────────────────────────────────────────────────────────
const vehicleTypeEl    = document.getElementById('vehicleType');
const taxYearEl        = document.getElementById('taxYear');
const taxMonthsEl      = document.getElementById('taxMonths');
const yearManufactEl   = document.getElementById('yearManufact');
const transportForm    = document.getElementById('transportForm');
const resultSection    = document.getElementById('resultSection');
const resetBtn         = document.getElementById('resetBtn');
const mrpInfoText      = document.getElementById('mrpInfoText');
const importDateGroup  = document.getElementById('importDateGroup');
const importDateEl     = document.getElementById('importDate');
const passengerRangeEl = document.getElementById('passengerRange');

// ──────────────────────────────────────────────────────────────
//  HELPERS
// ──────────────────────────────────────────────────────────────
function fmt(num) {
    return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function updateMRPInfo() {
    const yr = parseInt(taxYearEl.value) || 2026;
    if (mrpInfoText) {
        mrpInfoText.innerHTML = `<strong>МРП на ${yr} год:</strong> ${fmt(getMRP(yr))} тенге`;
    }
}

function showSection(type) {
    ALL_SECTIONS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    const cfg = UI_CONFIG[type];
    if (cfg && cfg.section) {
        const sec = document.getElementById(cfg.section);
        if (sec) sec.style.display = 'block';
    }
    // Дата ввоза — только для легковых
    if (importDateGroup) importDateGroup.style.display = 'none';
}

function syncRangeInput(type, rangeVal) {
    const cfg = UI_CONFIG[type];
    if (!cfg || !cfg.ranges || !cfg.inputEl) return;
    const r   = cfg.ranges[rangeVal];
    if (!r)   return;
    const inp  = document.getElementById(cfg.inputEl);
    const hint = document.getElementById(cfg.hintEl);
    if (inp)  { inp.min = r.min; inp.max = r.max; inp.value = ''; inp.placeholder = r.ph; }
    if (hint) hint.textContent = r.hint;

    // Показываем «Дата ввоза» только для легковых > 3000
    if (type === 'passenger' && importDateGroup) {
        importDateGroup.style.display = (rangeVal === 'high') ? 'block' : 'none';
    }
}

// ──────────────────────────────────────────────────────────────
//  СЛУШАТЕЛИ СОБЫТИЙ
// ──────────────────────────────────────────────────────────────
taxYearEl.addEventListener('change', () => {
    updateMRPInfo();
    // Обновляем макс. год выпуска
    if (yearManufactEl) yearManufactEl.max = taxYearEl.value;
});

vehicleTypeEl.addEventListener('change', function () {
    const type = this.value;
    showSection(type);
    // Для типов с диапазонами — устанавливаем дефолт
    const cfg = UI_CONFIG[type];
    if (cfg && cfg.ranges) {
        const firstKey = Object.keys(cfg.ranges)[0];
        const rangeEl  = cfg.rangeEl ? document.getElementById(cfg.rangeEl) : null;
        if (rangeEl) rangeEl.value = firstKey;
        syncRangeInput(type, firstKey);
    }
    resultSection.style.display = 'none';
});

// Диапазон для легковых
if (passengerRangeEl) {
    passengerRangeEl.addEventListener('change', function () {
        syncRangeInput('passenger', this.value);
    });
}

// Диапазон для грузовых
const truckRangeEl = document.getElementById('truckRange');
if (truckRangeEl) {
    truckRangeEl.addEventListener('change', function () {
        syncRangeInput('truck', this.value);
    });
}

// ──────────────────────────────────────────────────────────────
//  ОБРАБОТКА ФОРМЫ
// ──────────────────────────────────────────────────────────────
transportForm.addEventListener('submit', function (e) {
    e.preventDefault();

    const type  = vehicleTypeEl.value;
    if (!type)  { alert('Выберите вид объекта налогообложения'); return; }

    const yearOfCalc   = parseInt(taxYearEl.value)  || 2026;
    const months       = parseInt(taxMonthsEl.value) || 12;
    const yearManufact = yearManufactEl ? parseInt(yearManufactEl.value) || null : null;

    const cfg     = UI_CONFIG[type];
    const inputEl = cfg.inputEl ? document.getElementById(cfg.inputEl) : null;
    const value   = inputEl ? parseFloat(inputEl.value) : 0;

    if (type !== 'special' && (!value || isNaN(value) || value <= 0)) {
        alert('Введите корректное значение'); return;
    }

    const regDate = (type === 'passenger' && value > 3000 && importDateEl)
        ? (importDateEl.value === 'after' ? 'after2013' : 'before2013')
        : null;

    const result = calculateTransportTax({ type, value, yearOfCalc, regDate, months, yearManufact });
    if (!result) { alert('Не удалось рассчитать налог'); return; }

    const d = result.details;
    const mrp = getMRP(yearOfCalc);

    // Строим детализацию
    let ageNote = '';
    if (d.ageCf < 1 && yearManufact) {
        const age = yearOfCalc - yearManufact;
        ageNote = `
            <hr style="border:none;border-top:1px solid #e8dcc4;margin:1rem 0;">
            <p><strong>Год выпуска:</strong> ${yearManufact} (возраст ${age} лет)</p>
            <p style="color:#e67e22;font-weight:600;">⚡ Возрастной коэффициент: × ${d.ageCf} (${yearOfCalc} г.)</p>
            <p><strong>Налог до коэф.:</strong> ${fmt(d.baseTax)} ₸ → После коэф.: ${fmt(d.taxWithAge)} ₸</p>`;
    }

    let monthNote = '';
    if (months < 12) {
        monthNote = `<p><strong>Пересчёт на ${months} мес.:</strong> ${fmt(d.taxWithAge)} ÷ 12 × ${months} = ${fmt(result.tax)} ₸</p>`;
    }

    let regNote = '';
    if (regDate) {
        regNote = `<p><strong>Дата ввоза/регистрации:</strong> ${regDate === 'after2013' ? 'После 31.12.2013' : 'До 31.12.2013 включительно'}</p>`;
    }

    const detailsHTML = `
        <p><strong>Вид ТС:</strong> ${vehicleTypeEl.options[vehicleTypeEl.selectedIndex].text}</p>
        <p><strong>${cfg.valueLabel(value)}</strong></p>
        ${regNote}
        <p><strong>Год исчисления:</strong> ${yearOfCalc} | МРП: ${fmt(mrp)} ₸</p>
        <p><strong>Количество месяцев:</strong> ${months}</p>
        <hr style="border:none;border-top:1px solid #e8dcc4;margin:1rem 0;">
        <p><strong>Категория:</strong> ${d.bracket}</p>
        <p><strong>Формула:</strong> ${d.formula}</p>
        <p><strong>Годовой налог:</strong> ${fmt(d.baseTax)} ₸</p>
        ${ageNote}
        ${monthNote}
    `;

    document.getElementById('taxAmount').textContent   = `${fmt(result.tax)} ₸`;
    document.getElementById('resultDetails').innerHTML = detailsHTML;
    resultSection.style.display = 'block';
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

// ──────────────────────────────────────────────────────────────
//  ОЧИСТИТЬ
// ──────────────────────────────────────────────────────────────
resetBtn.addEventListener('click', function () {
    transportForm.reset();
    taxYearEl.value   = '2026';
    taxMonthsEl.value = '12';
    ALL_SECTIONS.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    if (importDateGroup) importDateGroup.style.display = 'none';
    resultSection.style.display = 'none';
    updateMRPInfo();
});

// Инициализация
updateMRPInfo();
