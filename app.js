'use strict';

/* Scan stock : scanner des codes, garder la liste sur l'appareil, exporter en .xlsx.
   Aucune donnée ne quitte le téléphone : pas de serveur, pas de service externe. */

const STORAGE_KEY = 'scan-stock.scans.v1';
const MAX_LENGTH = 200;

const FORMAT_LABELS = {
  code_128: 'Code 128',
  code_39: 'Code 39',
  code_93: 'Code 93',
  codabar: 'Codabar',
  ean_13: 'EAN-13',
  ean_8: 'EAN-8',
  upc_a: 'UPC-A',
  upc_e: 'UPC-E',
  itf: 'ITF',
  qr_code: 'QR code',
  data_matrix: 'DataMatrix',
  pdf417: 'PDF417',
  aztec: 'Aztec',
  manual: 'Saisie manuelle',
};
const SCAN_FORMATS = Object.keys(FORMAT_LABELS).filter((f) => f !== 'manual');

// Réglages du scan en direct.
const TICK_MS = 120; // pause entre deux analyses d'image
const MIN_HITS = 2; // un code doit être lu sur 2 images pour être retenu (évite les fausses lectures)
const SETTLE_MS = 450; // délai pour laisser apparaître les autres codes de la même étiquette
const STALE_MS = 1200; // un code plus vu depuis ce délai est oublié
const COOLDOWN_MS = 2500; // un code traité n'est pas relu tant qu'il reste devant la caméra

const $ = (id) => document.getElementById(id);
const el = {
  count: $('count'),
  scanBtn: $('scanBtn'),
  photoBtn: $('photoBtn'),
  photoInput: $('photoInput'),
  manualForm: $('manualForm'),
  manualInput: $('manualInput'),
  clearBtn: $('clearBtn'),
  empty: $('empty'),
  list: $('list'),
  bar: $('bar'),
  exportBtn: $('exportBtn'),
  shareBtn: $('shareBtn'),
  scanner: $('scanner'),
  video: $('video'),
  torchBtn: $('torchBtn'),
  closeBtn: $('closeBtn'),
  scanStatus: $('scanStatus'),
  ignoredInfo: $('ignoredInfo'),
  ignoredText: $('ignoredText'),
  ignoredReset: $('ignoredReset'),
  chooser: $('chooser'),
  choices: $('choices'),
  chooserCancel: $('chooserCancel'),
  toast: $('toast'),
  toastText: $('toastText'),
  toastAction: $('toastAction'),
};

/* ---------- Données ---------- */

/** @type {{id: string, value: string, format: string, at: string}[]} du plus ancien au plus récent */
let scans = loadScans();
let freshId = null;

function loadScans() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (s) => s && typeof s.value === 'string' && s.value && typeof s.at === 'string' && !Number.isNaN(Date.parse(s.at)),
    );
  } catch {
    return [];
  }
}

function saveScans() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scans));
  } catch {
    showToast("Impossible d'enregistrer sur cet appareil : télécharge l'Excel avant de fermer la page.");
  }
}

/** Retire les caractères de contrôle (présents dans certains codes GS1) et les espaces autour. */
function cleanValue(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, MAX_LENGTH);
}

const keyOf = (value) => value.toUpperCase();
const hasValue = (value) => scans.some((s) => keyOf(s.value) === keyOf(value));

/** @returns {'added' | 'duplicate' | 'empty'} */
function addScan(rawValue, format) {
  const value = cleanValue(rawValue);
  if (!value) return 'empty';
  if (hasValue(value)) return 'duplicate';
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  scans.push({ id, value, format, at: new Date().toISOString() });
  freshId = id;
  saveScans();
  render();
  return 'added';
}

/* ---------- Affichage de la liste ---------- */

const dateFormat = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const formatLabel = (format) => FORMAT_LABELS[format] || format || 'Code';

function render() {
  const n = scans.length;
  el.count.textContent = n === 0 ? '' : n === 1 ? '1 code' : `${n} codes`;
  el.empty.hidden = n > 0;
  el.clearBtn.hidden = n === 0;
  el.bar.hidden = n === 0;
  el.exportBtn.textContent = n > 1 ? `Télécharger l'Excel (${n} codes)` : "Télécharger l'Excel";

  const items = [];
  for (let i = scans.length - 1; i >= 0; i--) {
    const scan = scans[i];
    const li = document.createElement('li');
    li.className = scan.id === freshId ? 'item fresh' : 'item';

    const main = document.createElement('div');
    main.className = 'item-main';
    const value = document.createElement('div');
    value.className = 'value';
    value.textContent = scan.value;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${formatLabel(scan.format)} · ${dateFormat.format(new Date(scan.at))}`;
    main.append(value, meta);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.setAttribute('aria-label', `Supprimer ${scan.value}`);
    remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    remove.addEventListener('click', () => removeScan(scan.id));

    li.append(main, remove);
    items.push(li);
  }
  el.list.replaceChildren(...items);
  freshId = null;
}

function removeScan(id) {
  const index = scans.findIndex((s) => s.id === id);
  if (index < 0) return;
  const [removed] = scans.splice(index, 1);
  saveScans();
  render();
  showToast(`${removed.value} supprimé`, {
    action: 'Annuler',
    onAction: () => {
      if (hasValue(removed.value)) return;
      scans.splice(Math.min(index, scans.length), 0, removed);
      saveScans();
      render();
    },
  });
}

el.clearBtn.addEventListener('click', () => {
  const n = scans.length;
  const what = n > 1 ? `les ${n} codes` : 'le code';
  if (!confirm(`Vider la liste ? Cela supprime ${what} de cet appareil. Télécharge l'Excel avant si tu en as besoin.`)) return;
  scans = [];
  saveScans();
  render();
});

/* ---------- Messages ---------- */

let toastTimer = 0;

function showToast(text, { action, onAction, duration = 4000 } = {}) {
  clearTimeout(toastTimer);
  el.toastText.textContent = text;
  el.toastAction.hidden = !action;
  el.toastAction.textContent = action || '';
  el.toastAction.onclick = action
    ? () => {
        hideToast();
        onAction();
      }
    : null;
  el.toast.hidden = false;
  toastTimer = setTimeout(hideToast, action ? 6000 : duration);
}

function hideToast() {
  clearTimeout(toastTimer);
  el.toast.hidden = true;
}

let audio = null;

/** Bip + vibration. À appeler une première fois depuis un geste utilisateur pour débloquer le son. */
function feedback(kind) {
  try {
    navigator.vibrate?.(kind === 'ok' ? 60 : [40, 60, 40]);
  } catch {
    /* vibration indisponible */
  }
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    if (audio.state === 'suspended') audio.resume();
    if (kind === 'prime') return;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = kind === 'ok' ? 1150 : 300;
    gain.gain.setValueAtTime(0.12, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.14);
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.15);
  } catch {
    /* son indisponible */
  }
}

/* ---------- Lecture des codes ---------- */

let detector = null;

function getDetector() {
  if (detector) return detector;
  const api = window.BarcodeDetectionAPI;
  if (!api) throw new Error('Lecteur de codes non chargé');
  // Le moteur de lecture (WebAssembly) est servi avec l'app, pas depuis un CDN.
  api.prepareZXingModule({
    overrides: {
      locateFile: (path, prefix) =>
        path.endsWith('.wasm') ? new URL(`vendor/${path}`, document.baseURI).href : prefix + path,
    },
  });
  detector = new api.BarcodeDetector({ formats: SCAN_FORMATS });
  return detector;
}

/** Codes lus mais écartés par l'utilisateur (référence produit, adresse MAC…), jusqu'au rechargement. */
const ignored = new Set();

function updateIgnoredInfo() {
  const n = ignored.size;
  el.ignoredInfo.hidden = n === 0;
  el.ignoredText.textContent = n > 1 ? `${n} codes ignorés.` : '1 code ignoré.';
}

el.ignoredReset.addEventListener('click', () => {
  ignored.clear();
  updateIgnoredInfo();
});

/**
 * Traite les codes lus ensemble (une image ou une étiquette) : un seul → ajouté directement,
 * plusieurs → l'utilisateur choisit lequel est le numéro de série.
 * @param {{value: string, format: string}[]} codes
 * @returns {Promise<{kind: 'added' | 'duplicate' | 'none' | 'cancelled', value?: string}>}
 */
async function commit(codes) {
  const unique = [];
  for (const code of codes) {
    const value = cleanValue(code.value);
    if (!value || ignored.has(keyOf(value))) continue;
    if (!unique.some((u) => keyOf(u.value) === keyOf(value))) unique.push({ value, format: code.format });
  }
  if (unique.length === 0) return { kind: 'none' };

  let picked = unique[0];
  if (unique.length > 1) {
    picked = await choose(unique);
    if (!picked) return { kind: 'cancelled' };
    for (const other of unique) {
      if (other !== picked) ignored.add(keyOf(other.value));
    }
    updateIgnoredInfo();
  }

  const result = addScan(picked.value, picked.format);
  feedback(result === 'added' ? 'ok' : 'warn');
  return { kind: result === 'added' ? 'added' : 'duplicate', value: picked.value };
}

let resolveChoice = null;

function choose(codes) {
  return new Promise((resolve) => {
    const rows = codes.map((code) => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'choice';
      const already = hasValue(code.value);
      const value = document.createElement('div');
      value.className = 'value';
      value.textContent = code.value;
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = already ? `${formatLabel(code.format)} · déjà dans la liste` : formatLabel(code.format);
      button.append(value, meta);
      button.disabled = already;
      button.addEventListener('click', () => closeChooser(code));
      li.append(button);
      return li;
    });
    el.choices.replaceChildren(...rows);
    resolveChoice = resolve;
    el.chooser.hidden = false;
    (el.choices.querySelector('button:not(:disabled)') || el.chooserCancel).focus();
  });
}

function closeChooser(picked) {
  el.chooser.hidden = true;
  const resolve = resolveChoice;
  resolveChoice = null;
  resolve?.(picked || null);
}

el.chooserCancel.addEventListener('click', () => closeChooser(null));

/* ---------- Scan en direct ---------- */

const live = {
  active: false,
  busy: false,
  stream: null,
  timer: 0,
  /** @type {Map<string, {value: string, format: string, hits: number, first: number, last: number}>} */
  candidates: new Map(),
  /** @type {Map<string, number>} clé → dernier instant où le code traité a été vu */
  handled: new Map(),
  statusTimer: 0,
};

const liveAvailable = () => Boolean(window.isSecureContext && navigator.mediaDevices?.getUserMedia);

el.scanBtn.addEventListener('click', openScanner);
el.closeBtn.addEventListener('click', closeScanner);

async function openScanner() {
  if (live.active) return;
  feedback('prime');
  if (!liveAvailable()) {
    showToast('Le scan en direct demande une adresse en https. Utilise « Lire depuis une photo » ou la saisie.', {
      duration: 7000,
    });
    return;
  }

  el.scanBtn.disabled = true;
  try {
    getDetector();
    live.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
  } catch (error) {
    el.scanBtn.disabled = false;
    showToast(cameraErrorMessage(error), { duration: 7000 });
    return;
  }
  el.scanBtn.disabled = false;

  live.active = true;
  live.candidates.clear();
  live.handled.clear();
  el.video.srcObject = live.stream;
  el.scanner.hidden = false;
  setStatus('Place le code dans le cadre');
  updateIgnoredInfo();
  setupTorch();
  try {
    await el.video.play();
  } catch {
    /* la lecture démarre dès que le flux est prêt */
  }
  el.closeBtn.focus();
  scheduleTick();
}

function cameraErrorMessage(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return "Accès à la caméra refusé. Autorise la caméra pour ce site dans les réglages du navigateur, ou utilise « Lire depuis une photo ».";
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Aucune caméra trouvée sur cet appareil. Utilise la saisie.';
    case 'NotReadableError':
      return 'La caméra est utilisée par une autre application. Ferme-la puis réessaie.';
    default:
      return "Impossible de démarrer la caméra. Utilise « Lire depuis une photo » ou la saisie.";
  }
}

function closeScanner() {
  if (!live.active) return;
  live.active = false;
  clearTimeout(live.timer);
  clearTimeout(live.statusTimer);
  if (resolveChoice) closeChooser(null);
  live.stream?.getTracks().forEach((track) => track.stop());
  live.stream = null;
  el.video.srcObject = null;
  el.scanner.hidden = true;
  el.scanner.classList.remove('ok', 'warn');
  el.torchBtn.hidden = true;
  el.scanBtn.focus();
}

// La caméra ne reste pas allumée quand l'app passe en arrière-plan.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) closeScanner();
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (resolveChoice) closeChooser(null);
  else closeScanner();
});

function scheduleTick() {
  clearTimeout(live.timer);
  if (live.active) live.timer = setTimeout(tick, TICK_MS);
}

async function tick() {
  if (!live.active) return;
  if (!live.busy && el.video.readyState >= 2) {
    try {
      const results = await detector.detect(el.video);
      if (live.active && !live.busy) await onFrame(results);
    } catch (error) {
      console.error(error);
    }
  }
  scheduleTick();
}

async function onFrame(results) {
  const now = performance.now();

  for (const [key, last] of live.handled) {
    if (now - last > COOLDOWN_MS) live.handled.delete(key);
  }

  for (const result of results) {
    const value = cleanValue(result.rawValue);
    if (!value) continue;
    const key = keyOf(value);
    if (ignored.has(key)) continue;
    if (live.handled.has(key)) {
      live.handled.set(key, now);
      continue;
    }
    const candidate = live.candidates.get(key);
    if (candidate) {
      candidate.hits += 1;
      candidate.last = now;
    } else {
      live.candidates.set(key, { value, format: result.format, hits: 1, first: now, last: now });
    }
  }

  for (const [key, candidate] of live.candidates) {
    if (now - candidate.last > STALE_MS) live.candidates.delete(key);
  }

  const confirmed = [...live.candidates.values()].filter((c) => c.hits >= MIN_HITS);
  if (confirmed.length === 0) return;
  const oldest = Math.min(...confirmed.map((c) => c.first));
  if (now - oldest < SETTLE_MS) return;

  live.busy = true;
  try {
    const outcome = await commit(confirmed);
    const end = performance.now();
    for (const candidate of confirmed) live.handled.set(keyOf(candidate.value), end);
    live.candidates.clear();
    if (!live.active) return;
    if (outcome.kind === 'added') flashStatus('ok', `Ajouté : ${outcome.value}`);
    else if (outcome.kind === 'duplicate') flashStatus('warn', `Déjà dans la liste : ${outcome.value}`);
  } finally {
    live.busy = false;
  }
}

function setStatus(text) {
  el.scanStatus.textContent = text;
}

function flashStatus(kind, text) {
  clearTimeout(live.statusTimer);
  el.scanner.classList.remove('ok', 'warn');
  el.scanner.classList.add(kind);
  setStatus(text);
  live.statusTimer = setTimeout(() => {
    el.scanner.classList.remove('ok', 'warn');
    const n = scans.length;
    setStatus(n > 0 ? `Code suivant (${n} dans la liste)` : 'Place le code dans le cadre');
  }, 1800);
}

function setupTorch() {
  const track = live.stream?.getVideoTracks()[0];
  const supported = Boolean(track?.getCapabilities?.().torch);
  el.torchBtn.hidden = !supported;
  el.torchBtn.setAttribute('aria-pressed', 'false');
}

el.torchBtn.addEventListener('click', async () => {
  const track = live.stream?.getVideoTracks()[0];
  if (!track) return;
  const on = el.torchBtn.getAttribute('aria-pressed') !== 'true';
  try {
    await track.applyConstraints({ advanced: [{ torch: on }] });
    el.torchBtn.setAttribute('aria-pressed', String(on));
  } catch {
    el.torchBtn.hidden = true;
  }
});

/* ---------- Lecture depuis une photo ---------- */

el.photoBtn.addEventListener('click', () => {
  feedback('prime');
  el.photoInput.click();
});

el.photoInput.addEventListener('change', async () => {
  const file = el.photoInput.files?.[0];
  el.photoInput.value = '';
  if (!file) return;

  el.photoBtn.disabled = true;
  showToast('Lecture de la photo…', { duration: 15000 });
  try {
    const results = await getDetector().detect(file);
    hideToast();
    const outcome = await commit(results.map((r) => ({ value: r.rawValue, format: r.format })));
    reportOutcome(outcome, 'Aucun code lisible sur la photo. Réessaie de plus près, bien à plat, ou saisis le numéro.');
  } catch (error) {
    console.error(error);
    showToast("Impossible de lire cette image. Réessaie ou saisis le numéro.");
  } finally {
    el.photoBtn.disabled = false;
  }
});

function reportOutcome(outcome, noneMessage) {
  if (outcome.kind === 'added') showToast(`Ajouté : ${outcome.value}`);
  else if (outcome.kind === 'duplicate') showToast(`Déjà dans la liste : ${outcome.value}`);
  else if (outcome.kind === 'none') showToast(noneMessage, { duration: 6000 });
}

/* ---------- Saisie manuelle ---------- */

el.manualForm.addEventListener('submit', (event) => {
  event.preventDefault();
  feedback('prime');
  const value = cleanValue(el.manualInput.value);
  const result = addScan(value, 'manual');
  if (result === 'empty') {
    el.manualInput.focus();
    return;
  }
  feedback(result === 'added' ? 'ok' : 'warn');
  if (result === 'duplicate') {
    showToast(`Déjà dans la liste : ${value}`);
    el.manualInput.select();
    return;
  }
  el.manualInput.value = '';
  showToast(`Ajouté : ${value}`);
});

/* ---------- Export Excel ---------- */

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const pad = (n) => String(n).padStart(2, '0');

function exportFileName() {
  const d = new Date();
  return `scan-stock_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}h${pad(d.getMinutes())}.xlsx`;
}

/** Excel n'a pas de fuseau horaire : on décale la date pour que la cellule affiche l'heure locale du scan. */
function toSheetDate(iso) {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000);
}

async function buildExcelBlob() {
  const header = ['N° de série / code', 'Type de code', 'Date et heure'].map((value) => ({
    value,
    fontWeight: 'bold',
  }));
  const rows = scans.map((scan) => [
    // Toujours en texte : Excel ne doit ni retirer les zéros de tête ni passer en notation scientifique.
    { value: scan.value, type: String },
    { value: formatLabel(scan.format), type: String },
    { value: toSheetDate(scan.at), type: Date, format: 'dd/mm/yyyy hh:mm' },
  ]);
  const blob = await window
    .writeXlsxFile([header, ...rows], {
      sheet: 'Scans',
      columns: [{ width: 34 }, { width: 18 }, { width: 18 }],
      stickyRowsCount: 1,
    })
    .toBlob();
  return blob.type === XLSX_MIME ? blob : new Blob([blob], { type: XLSX_MIME });
}

async function withExport(button, run) {
  if (scans.length === 0) return;
  button.disabled = true;
  try {
    await run(await buildExcelBlob(), exportFileName());
  } catch (error) {
    if (error?.name === 'AbortError') return; // partage annulé par l'utilisateur
    console.error(error);
    showToast("La création du fichier Excel a échoué. Réessaie.");
  } finally {
    button.disabled = false;
  }
}

el.exportBtn.addEventListener('click', () =>
  withExport(el.exportBtn, (blob, name) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.hidden = true;
    document.body.append(link);
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      link.remove();
    }, 1000);
    showToast(`${name} téléchargé`);
  }),
);

function canShareFiles() {
  try {
    const probe = new File([''], 'scan-stock.xlsx', { type: XLSX_MIME });
    return Boolean(navigator.canShare?.({ files: [probe] }));
  } catch {
    return false;
  }
}

el.shareBtn.hidden = !canShareFiles();
el.shareBtn.addEventListener('click', () =>
  withExport(el.shareBtn, (blob, name) =>
    navigator.share({ files: [new File([blob], name, { type: XLSX_MIME })], title: name }),
  ),
);

/* ---------- Démarrage ---------- */

render();
