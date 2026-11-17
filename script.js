/* =====================================================================
   رِواء | REWA — interaction layer (vanilla JS only)
   Shared behavior + page modules: availability search, room filters,
   comparison, tabs, and the three-step booking wizard.
   ===================================================================== */
(function () {
  'use strict';

  /* ---------- helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const on = (el, ev, fn, opts) => { if (el) el.addEventListener(ev, fn, opts); };
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scrollBehavior = () => (reduceMotion() ? 'auto' : 'smooth');

  const numberFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  const money = (value) => numberFmt.format(Math.round(value)) + ' ر.س';

  const pad = (n) => String(n).padStart(2, '0');

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function addDays(iso, days) {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function toDate(iso) {
    return new Date(iso + 'T12:00:00');
  }

  function nightsBetween(from, to) {
    if (!from || !to) return 0;
    return Math.round((toDate(to) - toDate(from)) / 86400000);
  }

  function formatDate(iso) {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
        day: 'numeric', month: 'long', year: 'numeric'
      }).format(toDate(iso));
    } catch (e) {
      return iso;
    }
  }

  function nightsLabel(n) {
    if (!n || n < 1) return '٠ ليلة';
    if (n === 1) return 'ليلة واحدة';
    if (n === 2) return 'ليلتان';
    if (n <= 10) return n + ' ليالٍ';
    return n + ' ليلة';
  }

  function guestsLabel(n) {
    if (!n || n < 1) return 'ضيفان';
    if (n === 1) return 'ضيف واحد';
    if (n === 2) return 'ضيفان';
    if (n <= 10) return n + ' ضيوف';
    return n + ' ضيفاً';
  }

  function announce(message) {
    const live = $('#form-live');
    if (live) live.textContent = message;
  }

  function safeGet(key) {
    try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }

  function safeSet(key, value) {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }

  /* ---------- theme ---------- */
  function initTheme() {
    const btn = $('#theme-toggle');
    const root = document.documentElement;
    if (!btn) return;

    const apply = (dark) => {
      if (dark) root.dataset.theme = 'dark';
      else delete root.dataset.theme;
      btn.setAttribute('aria-pressed', String(dark));
      btn.setAttribute('aria-label', dark ? 'تعطيل الوضع الداكن' : 'تفعيل الوضع الداكن');
      const meta = $('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', dark ? '#0C1D21' : '#142A2E');
    };

    apply(root.dataset.theme === 'dark');

    on(btn, 'click', () => {
      const dark = root.dataset.theme !== 'dark';
      apply(dark);
      try { localStorage.setItem('rewa-theme', dark ? 'dark' : 'light'); } catch (e) { /* ignore */ }
    });
  }

  /* ---------- sticky header ---------- */
  function initHeader() {
    const header = $('#site-header');
    if (!header) return;
    const update = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
    update();
    on(window, 'scroll', update, { passive: true });
  }

  /* ---------- mobile navigation ---------- */
  function initNav() {
    const toggle = $('#menu-toggle');
    const nav = $('#primary-nav');
    const scrim = $('[data-nav-scrim]');
    if (!toggle || !nav) return;

    const openIcon = $('.menu-toggle__open', toggle);
    const closeIcon = $('.menu-toggle__close', toggle);
    let isOpen = false;

    const focusable = () => $$('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])', nav)
      .filter((el) => el.offsetParent !== null);

    const setOpen = (state) => {
      isOpen = state;
      nav.classList.toggle('is-open', state);
      toggle.setAttribute('aria-expanded', String(state));
      toggle.setAttribute('aria-label', state ? 'إغلاق القائمة' : 'فتح القائمة');
      if (openIcon) openIcon.style.display = state ? 'none' : '';
      if (closeIcon) closeIcon.style.display = state ? '' : 'none';
      if (scrim) scrim.classList.toggle('is-active', state);
      document.body.classList.toggle('no-scroll', state);
      if (state) {
        const items = focusable();
        if (items.length) items[0].focus();
      }
    };

    on(toggle, 'click', () => setOpen(!isOpen));
    on(scrim, 'click', () => { setOpen(false); toggle.focus(); });

    on(document, 'keydown', (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        toggle.focus();
        return;
      }
      if (e.key === 'Tab') {
        const items = focusable();
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    on(document, 'click', (e) => {
      if (!isOpen) return;
      if (!nav.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
    });

    $$('a', nav).forEach((a) => on(a, 'click', () => { if (isOpen) setOpen(false); }));

    on(window, 'resize', () => {
      if (isOpen && window.innerWidth > 920) setOpen(false);
    });
  }

  /* ---------- reveal on scroll ---------- */
  function initReveal() {
    const nodes = $$('.reveal');
    if (!nodes.length) return;
    if (!('IntersectionObserver' in window) || reduceMotion()) {
      nodes.forEach((node) => node.classList.add('is-visible'));
      return;
    }
    nodes.forEach((node) => node.classList.add('reveal--armed'));
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -32px 0px' });
    nodes.forEach((node) => observer.observe(node));
  }

  /* ---------- quick availability search (home) ---------- */
  function initQuickSearch() {
    const form = $('#quick-search-form');
    if (!form) return;

    const checkIn = $('#qs-checkin');
    const checkOut = $('#qs-checkout');
    const guests = $('#qs-guests');
    const errorBox = $('#qs-date-error');
    const errorText = errorBox ? errorBox.querySelector('span') : null;
    if (!checkIn || !checkOut) return;

    const today = todayISO();
    checkIn.min = today;
    checkOut.min = addDays(today, 1);
    if (!checkIn.value) checkIn.value = addDays(today, 7);
    if (!checkOut.value) checkOut.value = addDays(today, 9);

    const setError = (message) => {
      if (!errorBox) return;
      errorBox.hidden = !message;
      if (errorText) errorText.textContent = message || '';
      [checkIn, checkOut].forEach((el) => el.setAttribute('aria-invalid', message ? 'true' : 'false'));
    };

    on(checkIn, 'change', () => {
      if (checkIn.value) checkOut.min = addDays(checkIn.value, 1);
      if (checkOut.value && checkOut.value <= checkIn.value) {
        checkOut.value = addDays(checkIn.value, 1);
      }
      setError('');
    });
    on(checkOut, 'change', () => setError(''));

    on(form, 'submit', (e) => {
      e.preventDefault();
      const from = checkIn.value;
      const to = checkOut.value;
      if (!from || !to) {
        setError('اختر تاريخ الوصول والمغادرة أولاً.');
        (from ? checkOut : checkIn).focus();
        return;
      }
      const nights = nightsBetween(from, to);
      if (nights < 1) {
        setError('يجب أن تكون المغادرة بعد تاريخ الوصول بيوم واحد على الأقل.');
        checkOut.focus();
        return;
      }
      if (nights > 21) {
        setError('أقصى مدة إقامة ٢١ ليلة. اختر تاريخاً أقرب.');
        checkOut.focus();
        return;
      }
      setError('');
      safeSet('rewa-search', {
        checkIn: from,
        checkOut: to,
        adults: Number(guests ? guests.value : 2) || 2,
        children: 0
      });
      window.location.href = 'booking.html';
    });
  }

  /* ---------- footer year ---------- */
  function initYear() {
    const year = String(new Date().getFullYear());
    $$('[data-year]').forEach((el) => { el.textContent = year; });
  }

  /* ---------- boot shared ---------- */
  initTheme();
  initHeader();
  initNav();
  initReveal();
  initQuickSearch();
  initYear();

  /* =====================================================================
     ROOMS PAGE — filters, progressive disclosure, comparison
     ===================================================================== */
  const FEATURE_LABELS = {
    breakfast: 'الإفطار مشمول',
    wifi: 'واي فاي فائق السرعة',
    pool: 'المسبح والسبا',
    roomservice: 'خدمة الغرف ٢٤ ساعة',
    lounge: 'صالة الضيوف',
    workspace: 'مساحة عمل',
    butler: 'مضيف خاص'
  };

  function svgIcon(id) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(ns, 'use');
    use.setAttribute('href', '#' + id);
    svg.appendChild(use);
    return svg;
  }

  function resultsLabel(n) {
    if (n === 0) return 'لا توجد نتائج';
    if (n === 1) return 'خيار واحد متاح';
    if (n === 2) return 'خياران متاحان';
    if (n === 3) return '٣ خيارات متاحة';
    return n + ' خيارات متاحة';
  }

  function initRoomsPage() {
    const grid = $('#rooms-grid');
    if (!grid) return;

    const cards = $$('.room-card', grid);
    const form = $('#room-filters');
    const typeSelect = $('#filter-type');
    const priceSelect = $('#filter-price');
    const capacitySelect = $('#filter-capacity');
    const count = $('#results-count');
    const empty = $('#no-results');
    const emptyReset = $('#empty-reset');
    const resetBtn = $('#reset-filters');

    /* ---- filters ---- */
    const applyFilters = () => {
      const type = typeSelect ? typeSelect.value : 'all';
      const price = priceSelect ? priceSelect.value : 'all';
      const capacity = capacitySelect ? capacitySelect.value : 'all';
      let visible = 0;

      cards.forEach((card) => {
        const cardPrice = Number(card.dataset.price);
        const cardCapacity = Number(card.dataset.capacity);
        let ok = type === 'all' || card.dataset.type === type;

        if (ok && price !== 'all') {
          if (price === 'low') ok = cardPrice < 1000;
          else if (price === 'mid') ok = cardPrice >= 1000 && cardPrice <= 2000;
          else if (price === 'high') ok = cardPrice > 2000;
        }
        if (ok && capacity !== 'all') {
          if (capacity === '2') ok = cardCapacity === 2;
          else if (capacity === '34') ok = cardCapacity >= 3 && cardCapacity <= 4;
          else if (capacity === '5') ok = cardCapacity >= 5;
        }

        card.hidden = !ok;
        if (ok) visible += 1;
      });

      if (empty) empty.hidden = visible !== 0;
      if (count) count.textContent = resultsLabel(visible);
    };

    on(form, 'change', applyFilters);

    const resetFilters = () => {
      if (form) form.reset();
      applyFilters();
      if (grid) {
        grid.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
      }
    };
    on(resetBtn, 'click', resetFilters);
    on(emptyReset, 'click', resetFilters);

    /* ---- progressive disclosure ---- */
    $$('[data-disclosure]').forEach((btn) => {
      const panelId = btn.getAttribute('aria-controls');
      const panel = panelId ? document.getElementById(panelId) : null;
      if (!panel) return;
      on(btn, 'click', () => {
        const isOpen = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!isOpen));
        panel.hidden = isOpen;
        const textNode = Array.from(btn.childNodes).find(
          (node) => node.nodeType === 3 && node.textContent.trim()
        );
        if (textNode) textNode.textContent = isOpen ? ' عرض التفاصيل ' : ' إخفاء التفاصيل ';
      });
    });

    /* ---- comparison ---- */
    const tray = $('#compare-tray');
    const compareCount = $('#compare-count');
    const showBtn = $('#show-compare');
    const clearBtn = $('#clear-compare');
    const panel = $('#compare');
    const table = $('#compare-table');
    const closeBtn = $('#close-compare');
    const compareBoxes = $$('[data-compare]');

    const getSelected = () => compareBoxes.filter((box) => box.checked).map((box) => box.value);

    const updateCompareUI = () => {
      const selected = getSelected();
      const full = selected.length >= 3;

      compareBoxes.forEach((box) => {
        const labelText = box.parentElement ? box.parentElement.querySelector('span') : null;
        box.disabled = !box.checked && full;
        if (labelText) {
          labelText.textContent = box.checked ? 'مختارة' : (box.disabled ? 'الحد ٣' : 'قارن');
        }
      });

      if (tray) tray.hidden = selected.length === 0;
      if (compareCount) {
        if (selected.length === 1) compareCount.textContent = 'غرفة واحدة مختارة — اختر أخرى للمقارنة';
        else if (selected.length === 2) compareCount.textContent = 'غرفتان مختارتان للمقارنة';
        else if (selected.length === 3) compareCount.textContent = '٣ غرف مختارة للمقارنة';
      }
      if (showBtn) showBtn.disabled = selected.length < 2;
      if (panel && !panel.hidden) {
        if (selected.length >= 2) renderCompare(selected);
        else panel.hidden = true;
      }
    };

    const renderCompare = (selected) => {
      if (!table) return;
      const rooms = selected
        .map((id) => cards.find((card) => card.dataset.id === id))
        .filter(Boolean);
      if (rooms.length < 2) { panel.hidden = true; return; }

      table.textContent = '';
      const caption = document.createElement('caption');
      caption.className = 'visually-hidden';
      caption.textContent = 'مقارنة تفصيلية بين ' + rooms.map((r) => r.dataset.name).join(' و');
      table.appendChild(caption);

      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      const corner = document.createElement('th');
      corner.scope = 'col';
      corner.textContent = 'المعيار';
      headRow.appendChild(corner);

      rooms.forEach((room) => {
        const th = document.createElement('th');
        th.scope = 'col';
        const name = document.createElement('span');
        name.textContent = room.dataset.name;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'compare-table__remove';
        remove.setAttribute('data-remove', room.dataset.id);
        remove.setAttribute('aria-label', 'إزالة ' + room.dataset.name + ' من المقارنة');
        remove.textContent = 'إزالة';
        th.appendChild(name);
        th.appendChild(document.createTextNode(' '));
        th.appendChild(document.createElement('br'));
        th.appendChild(document.createTextNode(' '));
        th.appendChild(remove);
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      const rows = [
        ['النوع', (room) => room.dataset.typeLabel],
        ['السعر لليلة', (room) => money(Number(room.dataset.price))],
        ['المساحة', (room) => room.dataset.area + ' م²'],
        ['السعة', (room) => guestsLabel(Number(room.dataset.capacity))],
        ['السرير', (room) => room.dataset.bed],
        ['الإطلالة', (room) => room.dataset.view]
      ];

      rows.forEach(([label, getValue]) => {
        const tr = document.createElement('tr');
        const th = document.createElement('th');
        th.scope = 'row';
        th.textContent = label;
        tr.appendChild(th);
        rooms.forEach((room) => {
          const td = document.createElement('td');
          td.textContent = getValue(room);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });

      Object.keys(FEATURE_LABELS).forEach((feature) => {
        const tr = document.createElement('tr');
        const th = document.createElement('th');
        th.scope = 'row';
        th.textContent = FEATURE_LABELS[feature];
        tr.appendChild(th);
        rooms.forEach((room) => {
          const has = (room.dataset.features || '').split(',').includes(feature);
          const td = document.createElement('td');
          const wrap = document.createElement('span');
          wrap.className = has ? 'val-yes' : 'val-no';
          wrap.appendChild(svgIcon(has ? 'i-check' : 'i-x'));
          const text = document.createElement('span');
          text.textContent = has ? ' متوفر' : ' غير متوفر';
          wrap.appendChild(text);
          td.appendChild(wrap);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
    };

    compareBoxes.forEach((box) => on(box, 'change', updateCompareUI));

    on(showBtn, 'click', () => {
      const selected = getSelected();
      if (selected.length < 2 || !panel) return;
      renderCompare(selected);
      panel.hidden = false;
      const heading = $('#compare-title');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
      panel.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    });

    on(closeBtn, 'click', () => {
      if (panel) panel.hidden = true;
      if (showBtn) showBtn.focus();
    });

    on(clearBtn, 'click', () => {
      compareBoxes.forEach((box) => { box.checked = false; });
      if (panel) panel.hidden = true;
      updateCompareUI();
    });

    on(table, 'click', (e) => {
      const remove = e.target.closest('[data-remove]');
      if (!remove) return;
      const id = remove.getAttribute('data-remove');
      const box = compareBoxes.find((item) => item.value === id);
      if (box) {
        box.checked = false;
        updateCompareUI();
      }
    });

    updateCompareUI();

    /* ---- deep links to a specific room card ---- */
    const hash = window.location.hash.replace('#', '');
    if (['deluxe', 'executive', 'royal'].includes(hash)) {
      const card = document.getElementById(hash);
      if (card) {
        const detailsBtn = $('[data-disclosure]', card);
        if (detailsBtn && detailsBtn.getAttribute('aria-expanded') === 'false') {
          detailsBtn.click();
        }
        window.setTimeout(() => {
          card.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
          const heading = $('h3', card);
          if (heading) {
            heading.setAttribute('tabindex', '-1');
            heading.focus({ preventScroll: true });
          }
        }, 120);
      }
    }
  }

  /* =====================================================================
     EXPERIENCE PAGE — accessible tabs with deep links
     ===================================================================== */
  function initExperienceTabs() {
    const list = $('[role="tablist"]');
    if (!list) return;
    const tabs = $$('[role="tab"]', list);
    if (!tabs.length) return;

    const activate = (tab, options) => {
      const opts = options || {};
      tabs.forEach((item) => {
        const selected = item === tab;
        item.setAttribute('aria-selected', String(selected));
        item.tabIndex = selected ? 0 : -1;
        const panel = document.getElementById(item.getAttribute('aria-controls'));
        if (panel) {
          panel.hidden = !selected;
          if (selected) {
            $$('img[loading="lazy"]', panel).forEach((img) => { img.loading = 'eager'; });
          }
        }
      });
      if (opts.focus) tab.focus();
      if (opts.updateHash !== false) {
        const key = tab.dataset.tab || tab.getAttribute('aria-controls');
        if (key) {
          try { window.history.replaceState(null, '', '#' + key); } catch (e) { /* ignore */ }
        }
      }
    };

    tabs.forEach((tab) => on(tab, 'click', () => activate(tab)));

    on(list, 'keydown', (e) => {
      const index = tabs.indexOf(document.activeElement);
      if (index < 0) return;
      let next = null;
      if (e.key === 'ArrowLeft') next = tabs[(index + 1) % tabs.length];
      else if (e.key === 'ArrowRight') next = tabs[(index - 1 + tabs.length) % tabs.length];
      else if (e.key === 'Home') next = tabs[0];
      else if (e.key === 'End') next = tabs[tabs.length - 1];
      if (!next) return;
      e.preventDefault();
      activate(next, { focus: true });
    });

    const fromHash = () => {
      const hash = decodeURIComponent(window.location.hash.replace('#', ''));
      if (!hash) return null;
      return tabs.find((tab) => tab.dataset.tab === hash || tab.getAttribute('aria-controls') === hash) || null;
    };

    const initial = fromHash();
    if (initial) activate(initial, { updateHash: false });

    on(window, 'hashchange', () => {
      const tab = fromHash();
      if (tab) activate(tab, { updateHash: false });
    });
  }

  /* =====================================================================
     BOOKING PAGE — three-step wizard, validation, live price summary
     ===================================================================== */
  const ROOMS = {
    deluxe: {
      name: 'غرفة ديلوكس',
      rate: 850,
      capacity: 2,
      img: 'images/room-1.webp',
      alt: 'غرفة ديلوكس بسرير كينغ وجدار خشبي منحوت'
    },
    executive: {
      name: 'جناح تنفيذي',
      rate: 1450,
      capacity: 3,
      img: 'images/room-2.webp',
      alt: 'جناح تنفيذي بصالة جلوس ونافذة بانورامية على الرياض'
    },
    royal: {
      name: 'جناح رِواء الملكي',
      rate: 2600,
      capacity: 4,
      img: 'images/room-3.webp',
      alt: 'جناح رِواء الملكي بصالة واسعة وغرفتَي نوم'
    }
  };
  const VAT_RATE = 0.15;
  const MAX_NIGHTS = 21;
  const MAX_GUESTS = 4;

  const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
  const isSaudiPhone = (value) => /^(?:\+966|00966|0)?5\d{8}$/.test(value.replace(/[\s\-()]/g, ''));

  function luhnValid(digits) {
    if (!/^\d{16}$/.test(digits)) return false;
    let sum = 0;
    let double = false;
    for (let i = digits.length - 1; i >= 0; i -= 1) {
      let n = Number(digits[i]);
      if (double) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      double = !double;
    }
    return sum % 10 === 0;
  }

  function expiryValid(value) {
    const match = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(value.trim());
    if (!match) return false;
    const month = Number(match[1]);
    const year = 2000 + Number(match[2]);
    const endOfMonth = new Date(year, month, 1);
    const now = new Date();
    return endOfMonth > now;
  }

  function initBookingPage() {
    const form = $('#booking-form');
    if (!form) return;

    const wizard = $('.wizard');
    const bookingGrid = $('.booking-grid');
    const summary = $('#summary');
    const checkin = $('#checkin');
    const checkout = $('#checkout');
    const adults = $('#adults');
    const children = $('#children');
    const roomInputs = $$('input[name="room"]', form);
    const roomChoice = $('#room-choice');
    const guestsError = $('#guests-error');
    const roomError = $('#room-error');
    const nameInput = $('#guest-name');
    const emailInput = $('#guest-email');
    const phoneInput = $('#guest-phone');
    const paymentRadios = $$('input[name="payment"]', form);
    const cardFields = $('#card-fields');
    const cardNumber = $('#card-number');
    const cardName = $('#card-name');
    const cardExpiry = $('#card-expiry');
    const cardCvv = $('#card-cvv');
    const terms = $('#terms');
    const formAlert = $('#form-alert');
    const formAlertText = $('#form-alert-text');
    const confirmBtn = $('#confirm-btn');
    const confirmLabel = $('#confirm-label');
    const confirmSpinner = $('#confirm-spinner');
    const confirmIcon = $('#confirm-icon');
    const success = $('#booking-success');
    const summaryTitle = $('#summary-title');
    const summaryMedia = $('#summary-media');
    const summaryImg = $('#summary-img');
    const summaryDates = $('#summary-dates');
    const summaryGuests = $('#summary-guests');
    const summaryNights = $('#summary-nights');
    const summaryRate = $('#summary-rate');
    const summarySubtotal = $('#summary-subtotal');
    const summaryVat = $('#summary-vat');
    const summaryTotal = $('#summary-total');
    const summaryBadge = $('#summary-badge');
    const summaryHint = $('#summary-hint');
    const stepHint = $('#step-2-summary');
    const panels = $$('.step-panel', form);
    const stepItems = $$('[data-step-item]');
    const progress = $('#progress-bar');
    const today = todayISO();

    let currentStep = 1;
    let submitting = false;

    /* ---- error helpers ---- */
    const showFieldError = (input, errorId, message) => {
      const field = input ? input.closest('.field') : null;
      const box = errorId ? document.getElementById(errorId) : null;
      if (field) field.classList.toggle('is-invalid', Boolean(message));
      if (box) {
        box.hidden = !message;
        const text = box.querySelector('span');
        if (message && text) text.textContent = message;
      }
      if (input) input.setAttribute('aria-invalid', message ? 'true' : 'false');
    };

    const showBlockError = (box, message) => {
      if (!box) return;
      box.hidden = !message;
      const text = box.querySelector('span');
      if (message && text) text.textContent = message;
    };

    const clearFormAlert = () => { if (formAlert) formAlert.hidden = true; };

    /* ---- summary ---- */
    const nights = () => nightsBetween(checkin.value, checkout.value);
    const totalGuests = () => (Number(adults.value) || 0) + (Number(children.value) || 0);
    const selectedRoomKey = () => {
      const checked = roomInputs.find((input) => input.checked);
      return checked ? checked.value : null;
    };
    const selectedRoom = () => {
      const key = selectedRoomKey();
      return key ? ROOMS[key] : null;
    };

    const priceFor = (room) => {
      const stay = Math.max(0, nights());
      const subtotal = room.rate * stay;
      const vat = subtotal * VAT_RATE;
      return { subtotal: subtotal, vat: vat, total: subtotal + vat };
    };

    const updateHint = (room) => {
      if (!summaryHint) return;
      const textNode = Array.from(summaryHint.childNodes).find(
        (node) => node.nodeType === 3 && node.textContent.trim()
      );
      if (textNode) {
        textNode.textContent = room
          ? ' شامل الضرائب والرسوم. لا رسوم خفية.'
          : ' اختر الغرفة ليكتمل ملخص السعر. لا رسوم خفية.';
      }
    };

    const updateSummary = () => {
      const stay = Math.max(0, nights());
      const guests = totalGuests();
      const room = selectedRoom();

      if (summaryDates) {
        summaryDates.textContent = checkin.value && checkout.value && stay > 0
          ? formatDate(checkin.value) + ' — ' + formatDate(checkout.value)
          : 'اختر التواريخ';
      }
      if (summaryGuests) summaryGuests.textContent = guests ? guestsLabel(guests) : 'أضف ضيفاً';
      if (summaryNights) summaryNights.textContent = nightsLabel(stay);

      if (summaryTitle) summaryTitle.textContent = room ? room.name : 'لم تختر الغرفة بعد';
      if (summaryMedia) summaryMedia.classList.toggle('is-set', Boolean(room));
      if (summaryImg) {
        if (room) {
          summaryImg.loading = 'eager';
          summaryImg.src = room.img;
          summaryImg.alt = room.alt;
        } else {
          summaryImg.src = 'images/room-1.webp';
          summaryImg.alt = '';
        }
      }

      if (room && stay > 0) {
        const price = priceFor(room);
        if (summaryRate) summaryRate.textContent = money(room.rate) + ' / الليلة';
        if (summarySubtotal) summarySubtotal.textContent = money(price.subtotal);
        if (summaryVat) summaryVat.textContent = money(price.vat);
        if (summaryTotal) summaryTotal.textContent = money(price.total);
        if (summaryBadge) summaryBadge.hidden = false;
      } else {
        if (summaryRate) summaryRate.textContent = room ? money(room.rate) + ' / الليلة' : '—';
        if (summarySubtotal) summarySubtotal.textContent = '—';
        if (summaryVat) summaryVat.textContent = '—';
        if (summaryTotal) summaryTotal.textContent = '—';
        if (summaryBadge) summaryBadge.hidden = true;
      }
      updateHint(room);
    };

    const updateRoomCards = () => {
      const guests = totalGuests();
      const stay = Math.max(0, nights());

      Object.keys(ROOMS).forEach((key) => {
        const room = ROOMS[key];
        const input = roomInputs.find((item) => item.value === key);
        if (!input) return;
        const card = input.closest('.radio-card');
        const flag = card ? card.querySelector('[data-room-flag]') : null;
        const totalLabel = card ? card.querySelector('[data-room-total]') : null;
        const tooSmall = guests > room.capacity;

        input.disabled = tooSmall;
        if (tooSmall && input.checked) input.checked = false;

        if (flag) flag.hidden = !tooSmall;
        if (card) card.classList.toggle('is-unavailable', tooSmall);
        if (totalLabel) {
          totalLabel.textContent = stay > 0 ? 'الإجمالي ' + money(priceFor(room).total) : '—';
        }
      });

      if (roomError && selectedRoomKey()) roomError.hidden = true;
      updateSummary();
    };

    const updateStepHint = () => {
      if (!stepHint) return;
      const stay = nights();
      const guests = totalGuests();
      stepHint.textContent = stay > 0
        ? nightsLabel(stay) + ' · ' + guestsLabel(guests) + '. الأسعار المعروضة هي إجمالي الإقامة شامل الضريبة.'
        : 'اختر الغرفة التي تناسب عدد ضيوفك وميزانيتك. الأسعار المعروضة هي إجمالي الإقامة شامل الضريبة.';
    };

    /* ---- validation ---- */
    const validateDates = (announceErrors) => {
      let firstInvalid = null;
      let checkinMessage = '';
      let checkoutMessage = '';

      if (!checkin.value) {
        checkinMessage = 'اختر تاريخ الوصول.';
      } else if (checkin.value < today) {
        checkinMessage = 'تاريخ الوصول لا يمكن أن يكون في الماضي.';
      }

      if (!checkout.value) {
        checkoutMessage = 'اختر تاريخ المغادرة.';
      } else if (checkin.value && checkout.value <= checkin.value) {
        checkoutMessage = 'يجب أن تكون المغادرة بعد تاريخ الوصول بيوم واحد على الأقل.';
      } else if (nightsBetween(checkin.value, checkout.value) > MAX_NIGHTS) {
        checkoutMessage = 'أقصى مدة إقامة ٢١ ليلة. اختر تاريخاً أقرب.';
      }

      showFieldError(checkin, 'checkin-error', checkinMessage);
      showFieldError(checkout, 'checkout-error', checkoutMessage);
      if (checkinMessage) firstInvalid = checkin;
      else if (checkoutMessage) firstInvalid = checkout;

      if (firstInvalid && announceErrors === true) firstInvalid.focus();
      return !firstInvalid;
    };

    const validateGuests = () => {
      const guests = totalGuests();
      let message = '';
      if (guests > MAX_GUESTS) {
        message = 'أقصى سعة لغرفنا أربعة ضيوف. احجز جناحين متجاورين للعائلات الكبيرة.';
      } else if (guests < 1) {
        message = 'أضف ضيفاً واحداً على الأقل.';
      }
      showBlockError(guestsError, message);
      if (adults) adults.setAttribute('aria-invalid', message ? 'true' : 'false');
      if (children) children.setAttribute('aria-invalid', message ? 'true' : 'false');
      return !message;
    };

    const validateStep1 = () => {
      const datesOk = validateDates(true);
      const guestsOk = validateGuests();
      return datesOk && guestsOk;
    };

    const validateRoom = () => {
      const room = selectedRoom();
      const guests = totalGuests();
      let message = '';
      if (!room) message = 'اختر غرفة للمتابعة.';
      else if (guests > room.capacity) message = 'الغرفة المختارة لا تتسع لعدد الضيوف. اختر غرفة أكبر.';
      showBlockError(roomError, message);
      return !message;
    };

    const validateName = () => {
      const value = nameInput.value.trim();
      const message = value.length >= 3 ? '' : 'أدخل اسماً من ٣ أحرف على الأقل.';
      showFieldError(nameInput, 'name-error', message);
      return !message;
    };

    const validateEmail = () => {
      const value = emailInput.value.trim();
      const message = isEmail(value) ? '' : 'أدخل بريداً إلكترونياً صحيحاً، مثل name@example.com.';
      showFieldError(emailInput, 'email-error', message);
      return !message;
    };

    const validatePhone = () => {
      const value = phoneInput.value.trim();
      const message = isSaudiPhone(value) ? '' : 'أدخل رقم جوال سعودياً صحيحاً (مثال: 0512345678).';
      showFieldError(phoneInput, 'phone-error', message);
      return !message;
    };

    const validateCardNumber = () => {
      const digits = cardNumber.value.replace(/\D/g, '');
      const message = luhnValid(digits) ? '' : 'أدخل ١٦ رقماً صحيحاً للبطاقة التجريبية.';
      showFieldError(cardNumber, 'card-number-error', message);
      return !message;
    };

    const validateCardName = () => {
      const message = cardName.value.trim().length >= 3 ? '' : 'أدخل الاسم كما يظهر على البطاقة.';
      showFieldError(cardName, 'card-name-error', message);
      return !message;
    };

    const validateExpiry = () => {
      const message = expiryValid(cardExpiry.value) ? '' : 'أدخل تاريخاً صحيحاً بصيغة MM/YY.';
      showFieldError(cardExpiry, 'expiry-error', message);
      return !message;
    };

    const validateCvv = () => {
      const message = /^\d{3,4}$/.test(cardCvv.value.trim()) ? '' : 'أدخل ٣ أو ٤ أرقام.';
      showFieldError(cardCvv, 'cvv-error', message);
      return !message;
    };

    const usingCard = () => {
      const checked = paymentRadios.find((radio) => radio.checked);
      return !checked || checked.value === 'card';
    };

    const wakeLazyImages = (root) => {
      if (!root) return;
      $$('img[loading="lazy"]', root).forEach((img) => { img.loading = 'eager'; });
    };

    const validateTerms = () => {
      const message = terms && terms.checked ? '' : 'يجب الموافقة على السياسة قبل تأكيد الحجز.';
      showBlockError($('#terms-error'), message);
      if (terms) terms.setAttribute('aria-invalid', message ? 'true' : 'false');
      return !message;
    };

    const validateStep3 = () => {
      const checks = [validateName(), validateEmail(), validatePhone()];
      if (usingCard()) {
        checks.push(validateCardNumber(), validateCardName(), validateExpiry(), validateCvv());
      }
      checks.push(validateTerms());
      const ok = checks.every(Boolean);

      if (!ok) {
        if (formAlert) {
          formAlert.hidden = false;
          if (formAlertText) formAlertText.textContent = 'يرجى تصحيح الحقول المحددة قبل تأكيد الحجز.';
        }
        const firstInvalid = $('[aria-invalid="true"]', form);
        if (firstInvalid) firstInvalid.focus();
      } else if (formAlert) {
        formAlert.hidden = true;
      }
      return ok;
    };

    /* ---- steps ---- */
    const setStep = (step, options) => {
      const opts = options || {};
      currentStep = Math.min(3, Math.max(1, Number(step) || 1));

      panels.forEach((panel) => {
        panel.hidden = Number(panel.dataset.step) !== currentStep;
      });

      stepItems.forEach((item) => {
        const index = Number(item.dataset.stepItem);
        const active = index === currentStep;
        const complete = index < currentStep;
        item.classList.toggle('is-active', active);
        item.classList.toggle('is-complete', complete);
        if (active) item.setAttribute('aria-current', 'step');
        else item.removeAttribute('aria-current');
      });

      if (progress) {
        progress.style.width = (currentStep / 3) * 100 + '%';
        progress.setAttribute('aria-valuenow', String(currentStep));
        progress.setAttribute('aria-valuetext', 'الخطوة ' + currentStep + ' من ٣');
      }

      clearFormAlert();
      updateSummary();
      updateStepHint();

      const panel = $('.step-panel[data-step="' + currentStep + '"]', form);
      if (panel) wakeLazyImages(panel);
      const heading = panel ? $('h2', panel) : null;
      const label = stepItems[currentStep - 1]
        ? stepItems[currentStep - 1].querySelector('.stepper__label').textContent.trim()
        : '';
      announce('الخطوة ' + currentStep + ' من ٣: ' + label);

      if (opts.focus !== false) {
        if (wizard) {
          const top = wizard.getBoundingClientRect().top + window.scrollY - 88;
          window.scrollTo({ top: top, behavior: scrollBehavior() });
        }
        if (heading) {
          heading.setAttribute('tabindex', '-1');
          window.setTimeout(() => heading.focus({ preventScroll: true }), reduceMotion() ? 0 : 180);
        }
      }
    };

    /* ---- live updates ---- */
    on(checkin, 'change', () => {
      if (checkin.value) checkout.min = addDays(checkin.value, 1);
      if (checkin.value && (!checkout.value || checkout.value <= checkin.value)) {
        checkout.value = addDays(checkin.value, 1);
      }
      validateDates(false);
      updateSummary();
      updateStepHint();
    });

    on(checkout, 'change', () => {
      validateDates(false);
      updateSummary();
      updateStepHint();
    });

    on(adults, 'change', () => {
      validateGuests();
      updateRoomCards();
      updateStepHint();
    });

    on(children, 'change', () => {
      validateGuests();
      updateRoomCards();
      updateStepHint();
    });

    roomInputs.forEach((input) => on(input, 'change', () => {
      if (roomError) roomError.hidden = true;
      updateSummary();
    }));

    on(nameInput, 'blur', validateName);
    on(emailInput, 'blur', validateEmail);
    on(phoneInput, 'blur', validatePhone);

    [[nameInput, 'name-error', validateName],
      [emailInput, 'email-error', validateEmail],
      [phoneInput, 'phone-error', validatePhone],
      [cardNumber, 'card-number-error', validateCardNumber],
      [cardName, 'card-name-error', validateCardName],
      [cardExpiry, 'expiry-error', validateExpiry],
      [cardCvv, 'cvv-error', validateCvv]].forEach(([input, errorId, validate]) => {
      on(input, 'input', () => {
        if (input.getAttribute('aria-invalid') === 'true') validate();
        else if (errorId) {
          const box = document.getElementById(errorId);
          if (box && !box.hidden) box.hidden = true;
        }
        clearFormAlert();
      });
    });

    on(cardNumber, 'input', () => {
      const digits = cardNumber.value.replace(/\D/g, '').slice(0, 16);
      cardNumber.value = digits.replace(/(\d{4})(?=\d)/g, '$1 ');
    });

    on(cardExpiry, 'input', () => {
      const digits = cardExpiry.value.replace(/\D/g, '').slice(0, 4);
      cardExpiry.value = digits.length > 2 ? digits.slice(0, 2) + '/' + digits.slice(2) : digits;
    });

    on(cardCvv, 'input', () => {
      cardCvv.value = cardCvv.value.replace(/\D/g, '').slice(0, 4);
    });

    on(cardNumber, 'blur', validateCardNumber);
    on(cardName, 'blur', validateCardName);
    on(cardExpiry, 'blur', validateExpiry);
    on(cardCvv, 'blur', validateCvv);

    paymentRadios.forEach((radio) => on(radio, 'change', () => {
      const card = usingCard();
      if (cardFields) cardFields.hidden = !card;
      ['card-number-error', 'card-name-error', 'expiry-error', 'cvv-error'].forEach((id) => {
        const box = document.getElementById(id);
        if (box) box.hidden = true;
      });
      ['field-card-number', 'field-card-name', 'field-expiry', 'field-cvv'].forEach((id) => {
        const field = document.getElementById(id);
        if (field) field.classList.remove('is-invalid');
      });
      [cardNumber, cardName, cardExpiry, cardCvv].forEach((input) => {
        if (input) input.setAttribute('aria-invalid', 'false');
      });
      clearFormAlert();
    }));

    on(terms, 'change', () => {
      if (terms.checked) showBlockError($('#terms-error'), '');
    });

    $$('[data-next]').forEach((btn) => on(btn, 'click', () => {
      const target = Number(btn.dataset.next);
      if (target === 2 && !validateStep1()) return;
      if (target === 3) {
        if (!validateStep1()) { setStep(1, { focus: false }); return; }
        if (!validateRoom()) return;
      }
      setStep(target);
    }));

    $$('[data-back]').forEach((btn) => on(btn, 'click', () => {
      setStep(Number(btn.dataset.back));
    }));

    on(form, 'keydown', (e) => {
      if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA' || currentStep === 3) return;
      const next = $('.step-panel[data-step="' + currentStep + '"] [data-next]', form);
      if (next) {
        e.preventDefault();
        next.click();
      }
    });

    /* ---- submit ---- */
    const setLoading = (loading) => {
      submitting = loading;
      if (confirmBtn) {
        confirmBtn.disabled = loading;
        confirmBtn.classList.toggle('is-loading', loading);
        confirmBtn.setAttribute('aria-busy', String(loading));
      }
      if (confirmSpinner) confirmSpinner.hidden = !loading;
      if (confirmIcon) confirmIcon.hidden = loading;
      if (confirmLabel) confirmLabel.textContent = loading ? 'جارٍ تأكيد الحجز…' : 'تأكيد الحجز';
    };

    const showSuccess = () => {
      const room = selectedRoom();
      if (!room) return;
      const price = priceFor(room);
      const ref = 'RWA-' + String(Math.floor(100000 + Math.random() * 900000));
      const roomName = $('#success-room');
      const dates = $('#success-dates');
      const guests = $('#success-guests');
      const total = $('#success-total');
      const refEl = $('#success-ref');

      if (refEl) refEl.textContent = ref;
      if (roomName) roomName.textContent = room.name;
      if (dates) dates.textContent = formatDate(checkin.value) + ' — ' + formatDate(checkout.value);
      if (guests) guests.textContent = guestsLabel(totalGuests()) + ' · ' + nightsLabel(nights());
      if (total) total.textContent = money(price.total);

      form.hidden = true;
      if (success) success.hidden = false;
      if (bookingGrid) bookingGrid.classList.add('is-confirmed');

      stepItems.forEach((item) => {
        item.classList.remove('is-active');
        item.classList.add('is-complete');
        item.removeAttribute('aria-current');
      });
      if (progress) {
        progress.style.width = '100%';
        progress.setAttribute('aria-valuenow', '3');
        progress.setAttribute('aria-valuetext', 'اكتمل الحجز');
      }
      clearFormAlert();
      updateSummary();
      announce('تم تأكيد الحجز التجريبي. رقم الحجز ' + ref + '.');

      if (success) {
        success.setAttribute('tabindex', '-1');
        success.focus({ preventScroll: true });
        success.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
      }
    };

    on(form, 'submit', (e) => {
      e.preventDefault();
      if (submitting) return;
      if (!validateStep1()) { setStep(1, { focus: false }); return; }
      if (!validateRoom()) { setStep(2, { focus: false }); return; }
      if (!validateStep3()) return;

      setLoading(true);
      announce('جارٍ تأكيد الحجز. يرجى الانتظار.');
      window.setTimeout(() => {
        setLoading(false);
        showSuccess();
      }, 1400);
    });

    on($('#print-confirmation'), 'click', () => {
      window.print();
    });

    on($('#new-booking'), 'click', () => {
      form.reset();
      if (bookingGrid) bookingGrid.classList.remove('is-confirmed');
      if (success) success.hidden = true;
      form.hidden = false;
      setLoading(false);

      checkin.value = addDays(today, 7);
      checkout.min = addDays(today, 8);
      checkout.value = addDays(today, 9);
      adults.value = '2';
      children.value = '0';
      if (cardFields) cardFields.hidden = false;

      ['checkin-error', 'checkout-error', 'guests-error', 'room-error', 'name-error',
        'email-error', 'phone-error', 'card-number-error', 'card-name-error',
        'expiry-error', 'cvv-error', 'terms-error'].forEach((id) => {
        const box = document.getElementById(id);
        if (box) box.hidden = true;
      });
      $$('.field.is-invalid', form).forEach((field) => field.classList.remove('is-invalid'));
      $$('[aria-invalid]', form).forEach((el) => el.setAttribute('aria-invalid', 'false'));

      updateRoomCards();
      updateSummary();
      updateStepHint();
      setStep(1);
    });

    /* ---- initial state ---- */
    const params = new URLSearchParams(window.location.search);
    const requestedRoom = params.get('room');
    const paramIn = params.get('checkIn') || '';
    const paramOut = params.get('checkOut') || '';
    const paramAdults = params.get('adults') || params.get('guests') || '';
    const saved = safeGet('rewa-search');
    const savedIn = paramIn || (saved && saved.checkIn ? saved.checkIn : '');
    const savedOut = paramOut || (saved && saved.checkOut ? saved.checkOut : '');

    checkin.min = today;
    checkin.max = addDays(today, 300);
    checkout.min = addDays(today, 1);
    checkout.max = addDays(today, 330);

    checkin.value = savedIn && savedIn >= today ? savedIn : addDays(today, 7);
    checkout.value = savedOut && savedOut > checkin.value ? savedOut : addDays(checkin.value, 2);
    checkout.min = addDays(checkin.value, 1);
    if (nightsBetween(checkin.value, checkout.value) > MAX_NIGHTS) {
      checkout.value = addDays(checkin.value, 2);
    }

    const savedGuests = paramAdults || (saved && saved.adults ? saved.adults : '');
    if (savedGuests) {
      const count = Math.min(4, Math.max(1, Number(savedGuests) || 2));
      adults.value = String(count);
    }
    if (saved && saved.children) {
      children.value = String(Math.min(2, Math.max(0, Number(saved.children) || 0)));
    }

    if (requestedRoom && ROOMS[requestedRoom]) {
      const input = roomInputs.find((item) => item.value === requestedRoom);
      if (input && !input.disabled) input.checked = true;
    }

    updateRoomCards();
    updateSummary();
    updateStepHint();
    setStep(1, { focus: false });

    if (requestedRoom && ROOMS[requestedRoom] && selectedRoomKey() === requestedRoom) {
      setStep(2, { focus: false });
    }
  }

  initRoomsPage();
  initExperienceTabs();
  initBookingPage();
})();
