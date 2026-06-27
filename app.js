(() => {
  'use strict';

  const STORAGE_KEY = 'livingdex.progress.v1';
  const SETTINGS_KEY = 'livingdex.settings.v1';
  const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

  let DATA = null;          // { generations, species }
  let progress = {};        // { [formKey]: { caught: bool, shiny: bool, maleCaught, femaleCaught, maleShiny, femaleShiny } }
  let settings = { showBattleOnly: false, theming: true };

  let state = {
    activeGen: 'all',
    search: '',
    missingOnly: false,
  };

  // ---------- Persistence ----------

  function loadProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      progress = raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.error('Failed to load progress', e);
      progress = {};
    }
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch (e) {
      console.error('Failed to save progress', e);
      showToast('Could not save — storage may be full');
    }
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) settings = { ...settings, ...JSON.parse(raw) };
    } catch (e) { /* ignore */ }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) { /* ignore */ }
  }

  function getFormProgress(key) {
    return progress[key] || { caught: false, shiny: false, maleCaught: false, femaleCaught: false, maleShiny: false, femaleShiny: false };
  }

  function setFormProgress(key, patch) {
    const current = getFormProgress(key);
    progress[key] = { ...current, ...patch };
    saveProgress();
  }

  // ---------- Data loading ----------

  async function loadData() {
    const res = await fetch('pokemon_data.json');
    DATA = await res.json();
  }

  // ---------- Derived helpers ----------

  function visibleForms(species) {
    return species.f.filter(f => settings.showBattleOnly || !f.b);
  }

  function formSlots(form) {
    if (form.g) {
      return ['maleCaught', 'femaleCaught', 'maleShiny', 'femaleShiny'];
    }
    return ['caught', 'shiny'];
  }

  function formCaughtCount(form) {
    const p = getFormProgress(form.k);
    if (form.g) {
      return (p.maleCaught ? 1 : 0) + (p.femaleCaught ? 1 : 0);
    }
    return p.caught ? 1 : 0;
  }

  function formShinyCount(form) {
    const p = getFormProgress(form.k);
    if (form.g) {
      return (p.maleShiny ? 1 : 0) + (p.femaleShiny ? 1 : 0);
    }
    return p.shiny ? 1 : 0;
  }

  function formTotalSlots(form) {
    return form.g ? 2 : 1;
  }

  function speciesProgress(species) {
    const forms = visibleForms(species);
    let caught = 0, shiny = 0, total = 0;
    for (const f of forms) {
      total += formTotalSlots(f);
      caught += formCaughtCount(f);
      shiny += formShinyCount(f);
    }
    return { caught, shiny, total };
  }

  function isFormFullyCaught(form) {
    const p = getFormProgress(form.k);
    if (form.g) return p.maleCaught && p.femaleCaught;
    return p.caught;
  }

  function isSpeciesMissing(species) {
    const forms = visibleForms(species);
    return !forms.every(isFormFullyCaught);
  }

  // Sprite fallback chain: form-specific sprite -> variety home-artwork -> silhouette placeholder
  function spriteCandidates(form, shiny) {
    const shinyPart = shiny ? 'shiny/' : '';
    const urls = [
      `${SPRITE_BASE}/${shinyPart}${form.s}.png`,
    ];
    if (form.s !== form.v) {
      urls.push(`${SPRITE_BASE}/${shinyPart}${form.v}.png`);
    }
    urls.push(`${SPRITE_BASE}/other/home/${shinyPart}${form.v}.png`);
    urls.push(`${SPRITE_BASE}/${form.v}.png`);
    return urls;
  }

  function applySpriteWithFallback(imgEl, form, shiny) {
    const candidates = spriteCandidates(form, shiny);
    let i = 0;
    function tryNext() {
      if (i >= candidates.length) {
        imgEl.style.visibility = 'hidden';
        return;
      }
      imgEl.src = candidates[i++];
    }
    imgEl.onerror = tryNext;
    tryNext();
  }

  // ---------- Rendering: header ----------

  function renderProgress() {
    let caught = 0, shiny = 0, total = 0;
    for (const sp of DATA.species) {
      const p = speciesProgress(sp);
      caught += p.caught;
      shiny += p.shiny;
      total += p.total;
    }
    document.getElementById('caughtStat').textContent = `${caught} / ${total}`;
    document.getElementById('shinyStat').textContent = `${shiny} / ${total}`;
    const pct = total ? Math.round((caught / total) * 100) : 0;
    document.getElementById('progressBarFill').style.width = pct + '%';
    document.getElementById('progressBar').setAttribute('aria-valuenow', String(pct));
  }  // ---------- Rendering: gen tabs ----------

  function renderGenTabs() {
    const nav = document.getElementById('genTabs');
    nav.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.className = 'gen-tab' + (state.activeGen === 'all' ? ' active' : '');
    allBtn.textContent = 'All';
    allBtn.setAttribute('role', 'tab');
    allBtn.setAttribute('aria-selected', state.activeGen === 'all' ? 'true' : 'false');
    allBtn.addEventListener('click', () => { state.activeGen = 'all'; applyGenTheme(); render(); });
    nav.appendChild(allBtn);

    for (const gen of DATA.generations) {
      const btn = document.createElement('button');
      btn.className = 'gen-tab' + (state.activeGen === gen.id ? ' active' : '');
      btn.textContent = romanGen(gen.id);
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', state.activeGen === gen.id ? 'true' : 'false');
      btn.title = gen.name;
      btn.addEventListener('click', () => { state.activeGen = gen.id; applyGenTheme(); render(); });
      nav.appendChild(btn);
    }
  }

  function romanGen(id) {
    const numerals = ['I','II','III','IV','V','VI','VII','VIII','IX','X'];
    return numerals[id - 1] || String(id);
  }

  function applyGenTheme() {
    if (!settings.theming) {
      document.body.removeAttribute('data-gen');
      return;
    }
    if (state.activeGen === 'all') {
      document.body.removeAttribute('data-gen');
    } else {
      document.body.setAttribute('data-gen', String(state.activeGen));
    }
  }

  // ---------- Rendering: grid ----------

  function getFilteredSpecies() {
    let list = DATA.species;

    if (state.activeGen !== 'all') {
      list = list.filter(s => s.gen === state.activeGen);
    }

    const q = state.search.trim().toLowerCase();
    if (q) {
      const asNum = parseInt(q, 10);
      list = list.filter(s => {
        if (!isNaN(asNum) && s.n === asNum) return true;
        return s.nm.toLowerCase().includes(q);
      });
    }

    if (state.missingOnly) {
      list = list.filter(isSpeciesMissing);
    }

    return list;
  }

  function renderGrid() {
    const grid = document.getElementById('dexGrid');
    const emptyState = document.getElementById('emptyState');
    const list = getFilteredSpecies();

    grid.innerHTML = '';

    if (list.length === 0) {
      emptyState.hidden = false;
      return;
    }
    emptyState.hidden = true;

    const frag = document.createDocumentFragment();
    for (const sp of list) {
      frag.appendChild(buildCard(sp));
    }
    grid.appendChild(frag);
  }

  function buildCard(species) {
    const p = speciesProgress(species);
    const complete = p.total > 0 && p.caught === p.total;
    const hasAnyShiny = p.shiny > 0;
    const hasAnyProgress = p.caught > 0;

    const card = document.createElement('button');
    card.className = 'dex-card' + (complete ? ' complete' : '') + (!hasAnyProgress ? ' empty-progress' : '');
    card.setAttribute('aria-label', `${species.nm}, number ${species.n}, ${p.caught} of ${p.total} caught`);

    const num = document.createElement('span');
    num.className = 'dex-card-num';
    num.textContent = '#' + String(species.n).padStart(4, '0');
    card.appendChild(num);

    if (hasAnyShiny) {
      const badge = document.createElement('span');
      badge.className = 'dex-card-shiny-badge';
      badge.innerHTML = '<i class="ti ti-sparkles" aria-hidden="true"></i>';
      card.appendChild(badge);
    }

    const spriteWrap = document.createElement('div');
    spriteWrap.className = 'dex-card-sprite-wrap';
    const img = document.createElement('img');
    img.className = 'dex-card-sprite';
    img.loading = 'lazy';
    img.alt = '';
    const defaultForm = species.f[0];
    applySpriteWithFallback(img, defaultForm, false);
    spriteWrap.appendChild(img);
    card.appendChild(spriteWrap);

    const name = document.createElement('span');
    name.className = 'dex-card-name';
    name.textContent = species.nm;
    card.appendChild(name);

    const prog = document.createElement('span');
    prog.className = 'dex-card-progress';
    prog.textContent = `${p.caught}/${p.total}`;
    card.appendChild(prog);

    card.addEventListener('click', () => openModal(species));

    return card;
  }

  // ---------- Modal ----------

  let currentModalSpecies = null;

  function openModal(species) {
    currentModalSpecies = species;
    const overlay = document.getElementById('modalOverlay');
    const defaultForm = species.f[0];

    applySpriteWithFallback(document.getElementById('modalSprite'), defaultForm, false);
    document.getElementById('modalDexNum').textContent = '#' + String(species.n).padStart(4, '0');
    document.getElementById('modalTitle').textContent = species.nm;

    renderModalForms();
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    document.getElementById('modalOverlay').hidden = true;
    document.body.style.overflow = '';
    currentModalSpecies = null;
    // refresh grid in case progress changed
    renderGrid();
    renderProgress();
  }

  function renderModalForms() {
    if (!currentModalSpecies) return;
    const species = currentModalSpecies;
    const container = document.getElementById('modalForms');
    container.innerHTML = '';

    const forms = visibleForms(species);
    const p = speciesProgress(species);
    document.getElementById('modalProgress').textContent = `${p.caught} / ${p.total} caught · ${p.shiny} / ${p.total} shiny`;

    for (const form of forms) {
      container.appendChild(buildFormRow(form));
    }
  }

  function buildFormRow(form) {
    const row = document.createElement('div');
    row.className = 'form-row';

    const info = document.createElement('div');
    info.className = 'form-row-info';
    const label = document.createElement('div');
    label.className = 'form-row-label';
    label.textContent = form.l;
    info.appendChild(label);

    const tags = document.createElement('div');
    tags.className = 'form-row-tags';
    if (form.m) tags.appendChild(makeTag('Mega'));
    if (form.b) tags.appendChild(makeTag('Battle only'));
    if (form.g) tags.appendChild(makeTag('Gender diff'));
    if (tags.children.length) info.appendChild(tags);

    row.appendChild(info);

    const checks = document.createElement('div');
    checks.className = 'form-row-checks';

    const p = getFormProgress(form.k);

    if (form.g) {
      const maleGroup = document.createElement('div');
      maleGroup.className = 'gender-pair';
      maleGroup.appendChild(makeCheckBtn('ti-mars', 'Male', p.maleCaught, () => toggleField(form.k, 'maleCaught')));
      maleGroup.appendChild(makeCheckBtn('ti-sparkles', 'M Shiny', p.maleShiny, () => toggleField(form.k, 'maleShiny'), true));
      checks.appendChild(maleGroup);

      const femaleGroup = document.createElement('div');
      femaleGroup.className = 'gender-pair';
      femaleGroup.appendChild(makeCheckBtn('ti-venus', 'Female', p.femaleCaught, () => toggleField(form.k, 'femaleCaught')));
      femaleGroup.appendChild(makeCheckBtn('ti-sparkles', 'F Shiny', p.femaleShiny, () => toggleField(form.k, 'femaleShiny'), true));
      checks.appendChild(femaleGroup);
    } else {
      checks.appendChild(makeCheckBtn('ti-check', 'Caught', p.caught, () => toggleField(form.k, 'caught')));
      checks.appendChild(makeCheckBtn('ti-sparkles', 'Shiny', p.shiny, () => toggleField(form.k, 'shiny'), true));
    }

    row.appendChild(checks);
    return row;
  }

  function makeTag(text) {
    const t = document.createElement('span');
    t.className = 'form-tag';
    t.textContent = text;
    return t;
  }

  function makeCheckBtn(icon, label, active, onClick, isShiny) {
    const btn = document.createElement('button');
    btn.className = 'check-btn' + (active ? ' active' : '') + (isShiny ? ' shiny-btn' : '');
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    btn.innerHTML = `<i class="ti ${icon}" aria-hidden="true"></i><span>${label}</span>`;
    btn.addEventListener('click', onClick);
    return btn;
  }

  function toggleField(formKey, field) {
    const current = getFormProgress(formKey);
    setFormProgress(formKey, { [field]: !current[field] });
    renderModalForms();
    // live-update header stats without closing modal
    renderProgress();
  }

  // ---------- Toast ----------

  let toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
  }

  // ---------- Export / Import ----------

  function exportData() {
    const payload = {
      app: 'living-dex',
      version: 1,
      exportedAt: new Date().toISOString(),
      progress,
      settings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `living-dex-backup-${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Backup downloaded');
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || typeof parsed.progress !== 'object') {
          throw new Error('Invalid file format');
        }
        progress = parsed.progress;
        if (parsed.settings) {
          settings = { ...settings, ...parsed.settings };
          saveSettings();
          applySettingsToUI();
        }
        saveProgress();
        applyGenTheme();
        render();
        showToast('Backup restored');
      } catch (e) {
        console.error(e);
        showToast('Could not read that file');
      }
    };
    reader.readAsText(file);
  }

  // ---------- Settings UI ----------

  function applySettingsToUI() {
    document.getElementById('battleOnlyToggle').checked = settings.showBattleOnly;
    document.getElementById('themingToggle').checked = settings.theming;
  }

  // ---------- Menu ----------

  function openMenu() {
    document.getElementById('menuOverlay').hidden = false;
    document.getElementById('menuBtn').setAttribute('aria-expanded', 'true');
  }
  function closeMenu() {
    document.getElementById('menuOverlay').hidden = true;
    document.getElementById('menuBtn').setAttribute('aria-expanded', 'false');
  }

  // ---------- Main render ----------

  function render() {
    renderGenTabs();
    renderGrid();
    renderProgress();
  }

  // ---------- Event wiring ----------

  function wireEvents() {
    document.getElementById('menuBtn').addEventListener('click', openMenu);
    document.getElementById('closeMenuBtn').addEventListener('click', closeMenu);
    document.getElementById('menuOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'menuOverlay') closeMenu();
    });

    document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'modalOverlay') closeModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!document.getElementById('modalOverlay').hidden) closeModal();
        else if (!document.getElementById('menuOverlay').hidden) closeMenu();
      }
    });

    let searchDebounce = null;
    document.getElementById('searchInput').addEventListener('input', (e) => {
      clearTimeout(searchDebounce);
      const val = e.target.value;
      searchDebounce = setTimeout(() => {
        state.search = val;
        renderGrid();
      }, 120);
    });

    document.getElementById('filterToggle').addEventListener('click', (e) => {
      state.missingOnly = !state.missingOnly;
      e.currentTarget.setAttribute('aria-pressed', String(state.missingOnly));
      renderGrid();
    });

    document.getElementById('exportBtn').addEventListener('click', exportData);
    document.getElementById('importBtn').addEventListener('click', () => {
      document.getElementById('importFile').click();
    });
    document.getElementById('importFile').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) importData(file);
      e.target.value = '';
    });

    document.getElementById('battleOnlyToggle').addEventListener('change', (e) => {
      settings.showBattleOnly = e.target.checked;
      saveSettings();
      render();
    });
    document.getElementById('themingToggle').addEventListener('change', (e) => {
      settings.theming = e.target.checked;
      saveSettings();
      applyGenTheme();
    });

    document.getElementById('resetBtn').addEventListener('click', () => {
      if (confirm('Reset all progress? This cannot be undone.')) {
        progress = {};
        saveProgress();
        render();
        closeMenu();
        showToast('Progress reset');
      }
    });
  }

  // ---------- Init ----------

  async function init() {
    loadProgress();
    loadSettings();
    applySettingsToUI();
    try {
      await loadData();
    } catch (e) {
      console.error('Failed to load pokemon data', e);
      document.getElementById('dexGrid').innerHTML = '<p style="padding:40px;text-align:center;color:var(--gen-text-soft)">Could not load Pokémon data. Check your connection and reload.</p>';
      return;
    }
    wireEvents();
    applyGenTheme();
    render();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  init();
})();
