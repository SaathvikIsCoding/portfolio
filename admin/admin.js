(function () {
  'use strict';

  // Used when the admin is opened somewhere other than <user>.github.io (e.g. localhost).
  const DEFAULT_REPO = { owner: 'SaathvikIsCoding', repo: 'portfolio', branch: 'main' };
  const CONTENT_PATH = 'content/content.json';
  const UPLOAD_DIR = 'assets/uploads';
  const API = 'https://api.github.com';
  const STORE_KEY = 'portfolio-admin';
  const PROFILE_KEYS = ['name', 'role', 'tagline', 'about', 'summary', 'photo', 'location', 'email', 'resume'];

  // Project page section types (the dropdown in the admin). Keep in sync with js/detail.js.
  const SECTION_TYPES = [
    ['text', 'Text only'],
    ['images-1', 'Text + 1 image'],
    ['images-2', 'Text + 2 images'],
    ['images-3', 'Text + 3 images'],
    ['images-4', 'Text + 4 images'],
    ['html', 'Text + HTML embed'],
    ['figma', 'Text + Figma embed']
  ];
  const imageCount = (type) => { const m = /^images-([1-4])$/.exec(type || ''); return m ? Number(m[1]) : 0; };

  const $ = (sel) => document.querySelector(sel);

  let session = null;        // { owner, repo, branch, token }
  let content = null;        // the content.json being edited
  const pending = new Map(); // repo path -> Blob, images waiting to be committed
  const previews = new Map(); // repo path -> object URL, so fresh uploads preview before Pages rebuilds
  const openItems = new WeakSet();
  let dirty = false;
  let saving = false;
  let activeTab = 'profile';

  // ---------- Storage ----------
  function stores() {
    const out = [];
    try { out.push(sessionStorage); } catch (e) { /* blocked */ }
    try { out.push(localStorage); } catch (e) { /* blocked */ }
    return out;
  }

  function readSaved() {
    for (const store of stores()) {
      try {
        const raw = store.getItem(STORE_KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) { /* ignore */ }
    }
    return null;
  }

  function writeSaved(s, remember) {
    clearSaved();
    const target = safeStore(remember ? 'localStorage' : 'sessionStorage');
    try { if (target) target.setItem(STORE_KEY, JSON.stringify({ ...s, remember })); } catch (e) { /* ignore */ }
  }

  function clearSaved() {
    for (const store of stores()) { try { store.removeItem(STORE_KEY); } catch (e) { /* ignore */ } }
  }

  function safeStore(name) { try { return window[name]; } catch (e) { return null; } }

  function detectRepo() {
    const m = location.hostname.match(/^([^.]+)\.github\.io$/i);
    if (!m) return { ...DEFAULT_REPO };
    const owner = m[1];
    const first = location.pathname.split('/').filter(Boolean)[0];
    const repo = first && first !== 'admin' ? first : owner + '.github.io';
    return { owner, repo, branch: DEFAULT_REPO.branch };
  }

  // ---------- GitHub API ----------
  class GhError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }

  const enc = (s) => String(s).split('/').map(encodeURIComponent).join('/');
  const repoPath = () => `/repos/${enc(session.owner)}/${enc(session.repo)}`;

  async function gh(path, { method = 'GET', body, raw = false } = {}) {
    let res;
    try {
      res = await fetch(API + path, {
        method,
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${session.token}`,
          Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (e) {
      throw new GhError(0, 'Network error. Check your internet connection and try again.');
    }
    if (!res.ok) {
      let message = '';
      try { message = (await res.json()).message || ''; } catch (e) { /* ignore */ }
      throw new GhError(res.status, message);
    }
    if (res.status === 204) return null;
    return raw ? res.text() : res.json();
  }

  function explain(err) {
    if (!(err instanceof GhError)) return err && err.message ? err.message : 'Something went wrong.';
    switch (err.status) {
      case 0: return err.message;
      case 401: return 'GitHub rejected this token. It may be mistyped, revoked or expired.';
      case 403: return /rate limit/i.test(err.message)
        ? 'GitHub rate limit reached. Wait a few minutes and try again.'
        : 'This token can only read your repository. Edit it on GitHub: set Repository access to "Only select repositories" → your portfolio repo, then set Contents to "Read and write". Then sign in again.';
      case 404: return 'Repository or branch not found, or this token has no access to it. Check the repository settings and the token\'s repository access.';
      case 409: return 'The repository is empty. Push the site to GitHub first.';
      case 422: return /fast forward/i.test(err.message)
        ? 'The site changed on GitHub while you were editing. Copy any unsaved text, reload this page, and try again.'
        : 'GitHub refused the change: ' + err.message;
      default: return `GitHub error (${err.status})${err.message ? ': ' + err.message : ''}`;
    }
  }

  // ---------- Content ----------
  const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
  const arr = (v) => (Array.isArray(v) ? v : []);

  function normalize(d) {
    d = d && typeof d === 'object' ? d : {};
    const p = d.profile && typeof d.profile === 'object' ? d.profile : {};
    return {
      profile: Object.fromEntries(PROFILE_KEYS.map((k) => [k, str(p[k])])),
      socials: arr(d.socials).map((s) => ({ label: str(s && s.label), url: str(s && s.url) })),
      skills: arr(d.skills).map(str).filter(Boolean),
      projects: arr(d.projects).map((pr) => ({
        id: str(pr && pr.id),
        title: str(pr && pr.title),
        description: str(pr && pr.description),
        role: str(pr && pr.role),
        period: str(pr && pr.period),
        tech: arr(pr && pr.tech).map(str).filter(Boolean),
        image: str(pr && pr.image),
        live: str(pr && pr.live),
        repo: str(pr && pr.repo),
        process: str(pr && pr.process),
        sections: arr(pr && pr.sections).map((s) => ({
          type: SECTION_TYPES.some(([v]) => v === (s && s.type)) ? s.type : 'text',
          heading: str(s && s.heading),
          text: str(s && s.text),
          images: arr(s && s.images).map((g) => ({ src: str(g && g.src), caption: str(g && g.caption) })),
          html: str(s && s.html),
          figma: str(s && s.figma)
        })),
        gallery: arr(pr && pr.gallery).map((g) => ({ src: str(g && g.src), caption: str(g && g.caption) }))
      })),
      experience: arr(d.experience).map((x) => ({
        role: str(x && x.role),
        org: str(x && x.org),
        location: str(x && x.location),
        period: str(x && x.period),
        description: str(x && x.description)
      })),
      education: arr(d.education).map((e) => ({
        degree: str(e && e.degree),
        school: str(e && e.school),
        period: str(e && e.period)
      })),
      certifications: arr(d.certifications).map((c) => ({
        id: str(c && c.id),
        name: str(c && c.name),
        issuer: str(c && c.issuer),
        date: str(c && c.date),
        url: str(c && c.url),
        file: str(c && c.file)
      }))
    };
  }

  // Same rules as js/main.js on the public site, so project/certificate page links match.
  function slugify(text) {
    return String(text || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item';
  }

  // Keeps an existing id (so links survive a rename); new items get one from their title.
  function withIds(items, titleKey) {
    const seen = new Set();
    return items.map((item) => {
      const base = slugify(item.id || item[titleKey]);
      let id = base;
      for (let n = 2; seen.has(id); n++) id = `${base}-${n}`;
      seen.add(id);
      return { ...item, id };
    });
  }

  // Only keep the fields that matter for the section's type (e.g. no leftover images on a text section).
  function cleanSection(s) {
    const out = { type: s.type, heading: s.heading.trim(), text: s.text.trim() };
    const n = imageCount(s.type);
    if (n) out.images = s.images.slice(0, n).map((g) => ({ src: g.src.trim(), caption: g.caption.trim() })).filter((g) => g.src);
    if (s.type === 'html') out.html = s.html.trim();
    if (s.type === 'figma') out.figma = s.figma.trim();
    return out;
  }

  function cleaned(c) {
    const trim = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
    const projects = c.projects.map((p) => ({
      ...trim(p),
      gallery: p.gallery.map(trim).filter((g) => g.src),
      sections: p.sections.map(cleanSection).filter((s) => s.heading || s.text || (s.images && s.images.length) || s.html || s.figma)
    })).filter((p) => p.title);
    return {
      profile: trim(c.profile),
      socials: c.socials.map(trim).filter((s) => s.label && s.url),
      skills: c.skills.map((s) => s.trim()).filter(Boolean),
      projects: withIds(projects, 'title'),
      experience: c.experience.map(trim).filter((x) => x.role || x.org),
      education: c.education.map(trim).filter((e) => e.degree || e.school),
      certifications: withIds(c.certifications.map(trim).filter((x) => x.name), 'name')
    };
  }

  async function loadContent() {
    let text = null;
    try {
      text = await gh(`${repoPath()}/contents/${CONTENT_PATH}?ref=${encodeURIComponent(session.branch)}`, { raw: true });
    } catch (e) {
      if (e.status !== 404) throw e;
    }
    content = normalize(text ? JSON.parse(text) : {});
  }

  // ---------- Images ----------
  function slug(name) {
    return name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'image';
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

  async function prepareImage(file, maxSize) {
    if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(file.type)) throw new Error('Please choose a JPG, PNG, WebP or GIF image.');
    if (file.type === 'image/gif') return { blob: file, ext: 'gif' }; // keep animation
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      let blob = await toBlob(canvas, 'image/webp', 0.85);
      if (blob && blob.type === 'image/webp') return { blob, ext: 'webp' };
      blob = await toBlob(canvas, 'image/jpeg', 0.88);
      return { blob, ext: 'jpg' };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const IMAGE_TYPES = 'image/jpeg,image/png,image/webp,image/gif,image/avif';
  const MAX_PDF_BYTES = 10 * 1024 * 1024;
  let uploadSeq = 0;

  // Prepares a picked file for the next save and returns the repo path it will live at.
  // Images are resized to WebP; PDFs (certificates) are kept as they are.
  async function stageFile(file, { maxSize = 1600, allowPdf = false } = {}) {
    let blob;
    let ext;
    if (allowPdf && file.type === 'application/pdf') {
      if (file.size > MAX_PDF_BYTES) throw new Error('That PDF is over 10 MB. Please export a smaller one.');
      blob = file;
      ext = 'pdf';
    } else {
      ({ blob, ext } = await prepareImage(file, maxSize));
    }
    const path = `${UPLOAD_DIR}/${Date.now()}-${++uploadSeq}-${slug(file.name)}.${ext}`;
    pending.set(path, blob);
    previews.set(path, URL.createObjectURL(blob));
    return path;
  }

  const isPdf = (path) => /\.pdf$/i.test(path || '');

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function previewSrc(path) {
    if (!path) return '';
    if (previews.has(path)) return previews.get(path);
    if (/^https?:\/\//i.test(path)) return path;
    return '../' + path.replace(/^\/+/, '');
  }

  // ---------- Save ----------
  async function save() {
    if (saving || !dirty) return;
    saving = true;
    updateStatus();
    try {
      const base = repoPath();
      const branch = enc(session.branch);
      const ref = await gh(`${base}/git/ref/heads/${branch}`);
      const headSha = ref.object.sha;
      const head = await gh(`${base}/git/commits/${headSha}`);

      const data = cleaned(content);
      const used = new Set([
        data.profile.photo,
        ...data.projects.map((p) => p.image),
        ...data.projects.flatMap((p) => p.gallery.map((g) => g.src)),
        ...data.projects.flatMap((p) => p.sections.flatMap((s) => (s.images || []).map((g) => g.src))),
        ...data.certifications.map((c) => c.file)
      ].filter(Boolean));
      const tree = [];
      for (const [path, blob] of pending) {
        if (!used.has(path)) continue;
        const created = await gh(`${base}/git/blobs`, { method: 'POST', body: { content: await blobToBase64(blob), encoding: 'base64' } });
        tree.push({ path, mode: '100644', type: 'blob', sha: created.sha });
      }
      tree.push({ path: CONTENT_PATH, mode: '100644', type: 'blob', content: JSON.stringify(data, null, 2) + '\n' });

      const newTree = await gh(`${base}/git/trees`, { method: 'POST', body: { base_tree: head.tree.sha, tree } });
      const commit = await gh(`${base}/git/commits`, {
        method: 'POST',
        body: { message: 'Update portfolio content from admin', tree: newTree.sha, parents: [headSha] }
      });
      await gh(`${base}/git/refs/heads/${branch}`, { method: 'PATCH', body: { sha: commit.sha } });

      pending.clear();
      dirty = false;
      toast('Published! Your live site updates in about a minute.');
    } catch (e) {
      toast(explain(e), true);
    } finally {
      saving = false;
      updateStatus();
    }
  }

  // ---------- UI helpers ----------
  function h(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (k === 'text') node.textContent = v;
      else if (v === true) node.setAttribute(k, '');
      else node.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c != null && c !== false) node.append(c);
    return node;
  }

  function markDirty() {
    dirty = true;
    updateStatus();
  }

  function updateStatus() {
    const status = $('#status');
    status.textContent = saving ? 'Publishing…' : dirty ? 'Unsaved changes' : 'All changes published';
    status.classList.toggle('is-dirty', dirty && !saving);
    $('#save').disabled = saving || !dirty;
  }

  let toastTimer;
  function toast(message, isError) {
    const t = $('#toast');
    t.textContent = message;
    t.classList.toggle('is-error', !!isError);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, isError ? 8000 : 4000);
  }

  function field(label, obj, key, opts = {}) {
    const { type = 'text', multiline = false, rows = 5, hint, placeholder, cls, onChange } = opts;
    const input = multiline
      ? h('textarea', { rows, placeholder })
      : h('input', { type, placeholder, spellcheck: type === 'url' || type === 'email' ? 'false' : null });
    input.value = obj[key] || '';
    input.addEventListener('input', () => {
      obj[key] = input.value;
      markDirty();
      if (onChange) onChange(input.value);
    });
    return h('label', { class: 'field' + (cls ? ' ' + cls : '') }, h('span', { text: label }), input, hint ? h('small', { text: hint }) : null);
  }

  function listField(label, obj, key, opts = {}) {
    const input = h('input', { type: 'text', placeholder: opts.placeholder });
    input.value = obj[key].join(', ');
    input.addEventListener('input', () => {
      obj[key] = input.value.split(',').map((s) => s.trim()).filter(Boolean);
      markDirty();
    });
    return h('label', { class: 'field' }, h('span', { text: label }), input, opts.hint ? h('small', { text: opts.hint }) : null);
  }

  // One image (or, with allowPdf, an image or PDF) stored at obj[key].
  function imagePicker(label, obj, key, { shape = '', maxSize = 1600, allowPdf = false, hint } = {}) {
    const slot = h('span');
    const fileInput = h('input', { type: 'file', accept: IMAGE_TYPES + (allowPdf ? ',application/pdf' : ''), class: 'file-input', tabindex: '-1', 'aria-hidden': 'true' });
    const uploadBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => fileInput.click() });
    const removeBtn = h('button', {
      type: 'button', class: 'btn btn-danger btn-sm', text: 'Remove',
      onclick: () => { obj[key] = ''; markDirty(); refresh(); }
    });
    const noun = allowPdf ? 'file' : 'image';

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      fileInput.value = '';
      if (!file) return;
      try {
        uploadBtn.disabled = true;
        obj[key] = await stageFile(file, { maxSize, allowPdf });
        markDirty();
        refresh();
      } catch (e) {
        toast(e && e.message ? e.message : `Could not read that ${noun}.`, true);
      } finally {
        uploadBtn.disabled = false;
      }
    });

    function refresh() {
      const path = obj[key];
      const src = previewSrc(path);
      let preview;
      if (src && isPdf(path)) {
        preview = h('a', { class: `image-preview file-preview ${shape}`, href: src, target: '_blank', rel: 'noopener', text: 'PDF · open ↗' });
      } else if (src) {
        preview = h('img', { class: `image-preview ${shape}`, src, alt: '' });
      } else {
        preview = h('div', { class: `image-preview ${shape}`, text: `No ${noun}` });
      }
      slot.replaceChildren(preview);
      uploadBtn.textContent = path ? `Change ${noun}` : `Upload ${noun}`;
      removeBtn.hidden = !path;
    }
    refresh();

    return h('div', { class: 'field' },
      h('span', { text: label }),
      h('div', { class: 'image-picker' }, slot, h('div', { class: 'image-actions' }, uploadBtn, removeBtn, fileInput)),
      hint ? h('small', { text: hint }) : null);
  }

  // Project page builder: a list of sections, each with a type (dropdown), heading, description,
  // and — depending on the type — 1–4 images, an HTML embed or a Figma link.
  function sectionsEditor(p) {
    const list = h('div', { class: 'sections-edit' });
    const newSection = () => ({ type: 'text', heading: '', text: '', images: [], html: '', figma: '' });

    function card(s, i) {
      const specific = h('div', { class: 'section-specific' });
      const typeSelect = h('select', { 'aria-label': `Section ${i + 1} type` },
        SECTION_TYPES.map(([value, label]) => h('option', { value, text: label })));
      typeSelect.value = s.type;
      typeSelect.addEventListener('change', () => { s.type = typeSelect.value; markDirty(); drawSpecific(); });

      function drawSpecific() {
        const n = imageCount(s.type);
        if (n) {
          while (s.images.length < n) s.images.push({ src: '', caption: '' });
          specific.replaceChildren(h('div', { class: `section-images cols-${n}` },
            s.images.slice(0, n).map((img, k) => h('div', { class: 'section-image' },
              imagePicker(`Image ${k + 1}`, img, 'src', { shape: 'wide', maxSize: 2000 }),
              field('Caption', img, 'caption', { placeholder: 'Optional' })))));
        } else if (s.type === 'html') {
          specific.replaceChildren(field('HTML / embed code', s, 'html', {
            multiline: true, rows: 8, cls: 'code-field', placeholder: '<iframe src="https://www.youtube.com/embed/…"></iframe>',
            hint: 'Paste embed code (YouTube, Vimeo, Sketchfab, itch.io, CodePen…) or your own HTML. It runs in an isolated frame, so it can’t break the rest of your site.'
          }));
        } else if (s.type === 'figma') {
          specific.replaceChildren(field('Figma link', s, 'figma', {
            type: 'url', placeholder: 'https://www.figma.com/design/…',
            hint: 'In Figma: Share → set access to "Anyone with the link can view" → Copy link, then paste it here. Works for design files and prototypes.'
          }));
        } else {
          specific.replaceChildren();
        }
      }
      drawSpecific();

      const move = (dir) => () => {
        const j = i + dir;
        if (j < 0 || j >= p.sections.length) return;
        [p.sections[i], p.sections[j]] = [p.sections[j], p.sections[i]];
        markDirty();
        draw();
      };

      return h('div', { class: 'section-card' },
        h('div', { class: 'section-card-head' },
          h('strong', { text: `Section ${i + 1}` }),
          h('div', { class: 'item-tools' },
            h('button', { type: 'button', class: 'btn btn-ghost btn-sm btn-icon', 'aria-label': 'Move section up', title: 'Move up', text: '↑', disabled: i === 0, onclick: move(-1) }),
            h('button', { type: 'button', class: 'btn btn-ghost btn-sm btn-icon', 'aria-label': 'Move section down', title: 'Move down', text: '↓', disabled: i === p.sections.length - 1, onclick: move(1) }),
            h('button', {
              type: 'button', class: 'btn btn-danger btn-sm btn-icon', 'aria-label': 'Delete section', title: 'Delete', text: '✕',
              onclick: () => {
                if (!confirm(`Delete section ${i + 1}${s.heading ? ` ("${s.heading}")` : ''}?`)) return;
                p.sections.splice(i, 1);
                markDirty();
                draw();
              }
            }))),
        h('label', { class: 'field' }, h('span', { text: 'Section type' }), typeSelect),
        field('Heading', s, 'heading', { placeholder: 'e.g. Research, Level blockout, Final renders' }),
        field('Description', s, 'text', {
          multiline: true, rows: 5,
          hint: 'Empty line = new paragraph. Start a line with "## " for a sub-heading or "- " for a bullet.'
        }),
        specific);
    }

    function draw() {
      list.replaceChildren(...(p.sections.length
        ? p.sections.map(card)
        : [h('p', { class: 'muted', text: 'No sections yet. Add one to build out the project page.' })]));
    }
    draw();

    const addBtn = h('button', {
      type: 'button', class: 'btn btn-primary btn-sm', text: 'Add section',
      onclick: () => {
        p.sections.push(newSection());
        markDirty();
        draw();
        const cards = list.querySelectorAll('.section-card');
        const last = cards[cards.length - 1];
        if (last) { last.scrollIntoView({ block: 'center' }); last.querySelector('select').focus(); }
      }
    });

    return h('div', { class: 'field' },
      h('span', { text: 'Sections' }),
      h('small', { text: 'Build the project page from blocks, in order. Pick a type for each: text only, text with 1–4 images, an HTML embed, or a Figma embed.' }),
      list,
      h('div', { class: 'image-actions' }, addBtn));
  }

  // Several images with captions (project gallery): add many at once, reorder, remove.
  function galleryEditor(p) {
    const list = h('div', { class: 'gallery-edit' });
    const fileInput = h('input', { type: 'file', accept: IMAGE_TYPES, multiple: true, class: 'file-input', tabindex: '-1', 'aria-hidden': 'true' });
    const addBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Add images', onclick: () => fileInput.click() });

    fileInput.addEventListener('change', async () => {
      const files = [...fileInput.files];
      fileInput.value = '';
      if (!files.length) return;
      addBtn.disabled = true;
      addBtn.textContent = 'Adding…';
      for (const file of files) {
        try {
          p.gallery.push({ src: await stageFile(file, { maxSize: 2000 }), caption: '' });
        } catch (e) {
          toast(`${file.name}: ${e && e.message ? e.message : 'could not read this image.'}`, true);
        }
      }
      addBtn.disabled = false;
      addBtn.textContent = 'Add images';
      markDirty();
      draw();
    });

    function row(g, i) {
      const caption = h('input', { type: 'text', placeholder: 'Caption (optional)', 'aria-label': `Caption for image ${i + 1}` });
      caption.value = g.caption;
      caption.addEventListener('input', () => { g.caption = caption.value; markDirty(); });
      const move = (dir) => () => {
        const j = i + dir;
        if (j < 0 || j >= p.gallery.length) return;
        [p.gallery[i], p.gallery[j]] = [p.gallery[j], p.gallery[i]];
        markDirty();
        draw();
      };
      return h('div', { class: 'gallery-row' },
        h('img', { class: 'gallery-thumb', src: previewSrc(g.src), alt: '' }),
        caption,
        h('div', { class: 'item-tools' },
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm btn-icon', 'aria-label': 'Move up', title: 'Move up', text: '↑', disabled: i === 0, onclick: move(-1) }),
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm btn-icon', 'aria-label': 'Move down', title: 'Move down', text: '↓', disabled: i === p.gallery.length - 1, onclick: move(1) }),
          h('button', {
            type: 'button', class: 'btn btn-danger btn-sm btn-icon', 'aria-label': 'Remove image', title: 'Remove', text: '✕',
            onclick: () => { p.gallery.splice(i, 1); markDirty(); draw(); }
          })));
    }

    function draw() {
      list.replaceChildren(...(p.gallery.length
        ? p.gallery.map(row)
        : [h('p', { class: 'muted', text: 'No images yet.' })]));
    }
    draw();

    return h('div', { class: 'field' },
      h('span', { text: 'Gallery' }),
      h('small', { text: 'Screenshots, sketches, work-in-progress shots. Shown on the project page, where visitors can click to view them full size. You can pick several at once.' }),
      list,
      h('div', { class: 'image-actions' }, addBtn, fileInput));
  }

  const card = (...children) => h('div', { class: 'card section-card' }, ...children);
  const grid2 = (...children) => h('div', { class: 'grid-2' }, ...children);

  function panelHead(title, text, action) {
    return h('div', { class: 'panel-head' },
      h('div', null, h('h2', { text: title }), text ? h('p', { class: 'muted', text }) : null),
      action || null);
  }

  // A collapsible, reorderable list of items (projects, experience).
  function repeatable(items, { title, intro, addText, emptyText, create, summary, body }) {
    const addBtn = h('button', {
      type: 'button', class: 'btn btn-primary', text: addText,
      onclick: () => {
        const item = create();
        items.push(item);
        openItems.add(item);
        markDirty();
        renderPanel();
        const last = $('#panel .item:last-of-type input');
        if (last) last.focus();
      }
    });

    const list = items.map((item, i) => {
      const titleEl = h('span', { class: 'item-title', text: summary(item) });
      const refreshSummary = () => { titleEl.textContent = summary(item); };
      const move = (dir) => (e) => {
        e.preventDefault();
        const j = i + dir;
        if (j < 0 || j >= items.length) return;
        [items[i], items[j]] = [items[j], items[i]];
        markDirty();
        renderPanel();
      };
      const details = h('details', { class: 'item', open: openItems.has(item) },
        h('summary', null,
          titleEl,
          h('span', { class: 'item-tools' },
            h('button', { type: 'button', class: 'btn btn-ghost btn-sm btn-icon', 'aria-label': 'Move up', title: 'Move up', text: '↑', disabled: i === 0, onclick: move(-1) }),
            h('button', { type: 'button', class: 'btn btn-ghost btn-sm btn-icon', 'aria-label': 'Move down', title: 'Move down', text: '↓', disabled: i === items.length - 1, onclick: move(1) }),
            h('button', {
              type: 'button', class: 'btn btn-danger btn-sm btn-icon', 'aria-label': 'Delete', title: 'Delete', text: '✕',
              onclick: (e) => {
                e.preventDefault();
                if (!confirm(`Delete "${summary(item)}"?`)) return;
                items.splice(i, 1);
                markDirty();
                renderPanel();
              }
            }))),
        h('div', { class: 'item-body' }, body(item, refreshSummary)));
      details.addEventListener('toggle', () => { if (details.open) openItems.add(item); else openItems.delete(item); });
      return details;
    });

    return [
      panelHead(title, intro, addBtn),
      list.length ? list : h('p', { class: 'empty', text: emptyText })
    ];
  }

  // ---------- Tabs ----------
  const tabs = {
    profile() {
      const p = content.profile;
      return [
        panelHead('Profile', 'Your name, photo, and the text at the top of your site and in "About me".'),
        card(
          imagePicker('Photo', p, 'photo', { shape: 'round', maxSize: 800 }),
          grid2(
            field('Name', p, 'name'),
            field('Role / title', p, 'role', { placeholder: 'e.g. Full-stack developer' })
          ),
          field('Tagline', p, 'tagline', { hint: 'One sentence shown under your name.' }),
          field('About me', p, 'about', { multiline: true, rows: 8, hint: 'Leave an empty line between paragraphs.' }),
          field('Resume summary', p, 'summary', {
            multiline: true, rows: 5,
            hint: 'The Summary on your resume page. Keep it to 3–4 lines, avoid "I"/"my", and use keywords from job posts. If empty, "About me" is used.'
          })
        ),
        card(
          h('h3', { text: 'Contact details' }),
          grid2(
            field('Email', p, 'email', { type: 'email', hint: 'Shown publicly. Leave empty to hide.' }),
            field('Location', p, 'location', { placeholder: 'e.g. City, Country' })
          ),
          field('Resume link', p, 'resume', { type: 'url', placeholder: 'https://…', hint: 'Use "resume.html" for the ATS-friendly resume built automatically from this admin, or paste a link to your own PDF. Leave empty to hide the Resume button.' })
        )
      ];
    },

    links() {
      const socials = content.socials;
      const rows = socials.map((s, i) => h('div', { class: 'link-row' },
        field('Label', s, 'label', { placeholder: 'e.g. LinkedIn', cls: 'lr-label' }),
        field('URL', s, 'url', { type: 'url', placeholder: 'https://…', cls: 'lr-url' }),
        h('button', {
          type: 'button', class: 'btn btn-danger btn-icon lr-del', 'aria-label': 'Remove link', title: 'Remove', text: '✕',
          onclick: () => { socials.splice(i, 1); markDirty(); renderPanel(); }
        })));
      const add = h('button', {
        type: 'button', class: 'btn btn-primary', text: 'Add link',
        onclick: () => {
          socials.push({ label: '', url: '' });
          markDirty();
          renderPanel();
          const inputs = document.querySelectorAll('#panel .lr-label input');
          if (inputs.length) inputs[inputs.length - 1].focus();
        }
      });
      return [
        panelHead('Links', 'Social profiles shown in the header and contact section: GitHub, LinkedIn, and so on.', add),
        rows.length ? card(...rows) : h('p', { class: 'empty', text: 'No links yet.' })
      ];
    },

    skills() {
      const skills = content.skills;
      const input = h('input', { type: 'text', placeholder: 'e.g. React', 'aria-label': 'New skill' });
      const addSkill = () => {
        const values = input.value.split(',').map((s) => s.trim()).filter(Boolean);
        const fresh = values.filter((v) => !skills.some((s) => s.toLowerCase() === v.toLowerCase()));
        if (!fresh.length) { input.value = ''; return; }
        skills.push(...fresh);
        markDirty();
        renderPanel();
        const next = $('#panel .chip-add input');
        if (next) next.focus();
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } });

      return [
        panelHead('Skills', 'Languages, frameworks and tools. Press Enter to add; you can paste several separated by commas.'),
        card(
          h('div', { class: 'chip-add' }, input, h('button', { type: 'button', class: 'btn btn-primary', text: 'Add', onclick: addSkill })),
          h('ul', { class: 'chip-list' }, skills.map((s, i) => h('li', { class: 'chip' },
            s,
            h('button', {
              type: 'button', 'aria-label': `Remove ${s}`, text: '×',
              onclick: () => { skills.splice(i, 1); markDirty(); renderPanel(); }
            })))),
          skills.length ? null : h('p', { class: 'muted', text: 'No skills yet. The Skills section is hidden on your site until you add some.' })
        )
      ];
    },

    projects() {
      return repeatable(content.projects, {
        title: 'Projects',
        intro: 'Your work. Each project gets its own page with your process and gallery. The first project appears first on your site.',
        addText: 'Add project',
        emptyText: 'No projects yet. Click "Add project" to add your first one.',
        create: () => ({ id: '', title: '', description: '', role: '', period: '', tech: [], image: '', live: '', repo: '', process: '', sections: [], gallery: [] }),
        summary: (p) => p.title || 'Untitled project',
        body: (p, refresh) => [
          field('Project name', p, 'title', { onChange: refresh }),
          field('Short summary', p, 'description', { multiline: true, rows: 3, hint: 'Shown on the project card and at the top of its page. 1–2 sentences.' }),
          grid2(
            field('Your role', p, 'role', { placeholder: 'e.g. Level designer, solo project' }),
            field('When', p, 'period', { placeholder: 'e.g. Jan – Apr 2025' })
          ),
          listField('Tools / technologies', p, 'tech', { placeholder: 'Unreal Engine 5, Maya, Photoshop', hint: 'Separate with commas.' }),
          grid2(
            field('Live / portfolio link', p, 'live', { type: 'url', placeholder: 'https://…' }),
            field('Source code link', p, 'repo', { type: 'url', placeholder: 'https://github.com/…' })
          ),
          imagePicker('Cover image', p, 'image', { shape: 'wide', maxSize: 2000, hint: 'Shown on the card and at the top of the project page.' }),
          field('The process', p, 'process', {
            multiline: true, rows: 12,
            hint: 'Walk visitors through how you made it: the brief, research, sketches, iterations, problems you solved, what you learned. Leave an empty line between paragraphs. Start a line with "## " for a sub-heading and "- " for a bullet point.'
          }),
          sectionsEditor(p),
          galleryEditor(p)
        ]
      });
    },

    experience() {
      return repeatable(content.experience, {
        title: 'Experience',
        intro: 'Jobs, internships and freelance work, newest first. Hidden on your site while empty.',
        addText: 'Add entry',
        emptyText: 'No experience yet. The Experience section is hidden on your site until you add some.',
        create: () => ({ role: '', org: '', location: '', period: '', description: '' }),
        summary: (x) => [x.role, x.org].filter(Boolean).join(' at ') || 'New entry',
        body: (x, refresh) => [
          grid2(
            field('Role / title', x, 'role', { placeholder: 'e.g. Junior Designer', onChange: refresh }),
            field('Company', x, 'org', { onChange: refresh })
          ),
          grid2(
            field('Dates', x, 'period', { placeholder: 'e.g. Jun 2025 – Present' }),
            field('Location', x, 'location', { placeholder: 'e.g. Pune, India' })
          ),
          field('What you did', x, 'description', {
            multiline: true, rows: 7,
            hint: 'One achievement per line; each line becomes a bullet point. Start with an action verb and include numbers where you can (e.g. "Managed ₹1 crore in ad spend…").'
          })
        ]
      });
    },

    education() {
      return repeatable(content.education, {
        title: 'Education',
        intro: 'Degrees and courses of study. Shown on your site and resume.',
        addText: 'Add education',
        emptyText: 'No education yet.',
        create: () => ({ degree: '', school: '', period: '' }),
        summary: (e) => e.degree || e.school || 'New entry',
        body: (e, refresh) => [
          field('Degree', e, 'degree', { placeholder: 'e.g. Master of Design (M.Des), Digital Game Design', onChange: refresh }),
          grid2(
            field('School / university', e, 'school', { onChange: refresh }),
            field('Dates', e, 'period', { placeholder: 'e.g. 2025 – Present' })
          )
        ]
      });
    },

    certifications() {
      return repeatable(content.certifications, {
        title: 'Certifications',
        intro: 'Courses and certificates you have completed. Each one gets its own page on your site.',
        addText: 'Add certification',
        emptyText: 'No certifications yet.',
        create: () => ({ id: '', name: '', issuer: '', date: '', url: '', file: '' }),
        summary: (c) => c.name || 'New certification',
        body: (c, refresh) => [
          grid2(
            field('Certificate name', c, 'name', { onChange: refresh }),
            field('Issued by', c, 'issuer', { placeholder: 'e.g. Coursera, Udemy, Epic Games' })
          ),
          grid2(
            field('Date', c, 'date', { placeholder: 'e.g. Mar 2024' }),
            field('Credential link', c, 'url', { type: 'url', placeholder: 'https://… (optional verify link)' })
          ),
          imagePicker('Certificate', c, 'file', {
            shape: 'wide', maxSize: 2400, allowPdf: true,
            hint: 'Upload the certificate as an image (JPG/PNG) or a PDF up to 10 MB. Visitors see it on the certificate page.'
          })
        ]
      });
    }
  };

  function renderPanel() {
    const panel = $('#panel');
    panel.replaceChildren(...[tabs[activeTab]()].flat(Infinity));
    document.querySelectorAll('.tabs [role="tab"]').forEach((b) => {
      const selected = b.dataset.tab === activeTab;
      b.setAttribute('aria-selected', String(selected));
      b.tabIndex = selected ? 0 : -1;
    });
  }

  function setupTabs() {
    const buttons = [...document.querySelectorAll('.tabs [role="tab"]')];
    buttons.forEach((b, i) => {
      b.addEventListener('click', () => { activeTab = b.dataset.tab; renderPanel(); });
      b.addEventListener('keydown', (e) => {
        const dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!dir) return;
        e.preventDefault();
        const next = buttons[(i + dir + buttons.length) % buttons.length];
        next.focus();
        next.click();
      });
    });
  }

  // ---------- Views ----------
  function showApp() {
    $('#login-view').hidden = true;
    $('#app-view').hidden = false;
    document.title = `Admin: ${content.profile.name || session.repo}`;
    dirty = false;
    updateStatus();
    renderPanel();
  }

  function showLogin(error) {
    $('#app-view').hidden = true;
    $('#login-view').hidden = false;
    const defaults = readSaved() || detectRepo();
    $('#login-owner').value = defaults.owner || '';
    $('#login-repo').value = defaults.repo || '';
    $('#login-branch').value = defaults.branch || 'main';
    const errorEl = $('#login-error');
    errorEl.textContent = error || '';
    errorEl.hidden = !error;
    $('#login-token').focus();
  }

  async function signIn(s, remember) {
    session = s;
    const info = await gh(repoPath());
    if (info.permissions && info.permissions.push === false) throw new GhError(403, '');
    await loadContent();
    writeSaved(s, remember);
  }

  function setupLogin() {
    $('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const s = {
        owner: $('#login-owner').value.trim(),
        repo: $('#login-repo').value.trim(),
        branch: $('#login-branch').value.trim() || 'main',
        token: $('#login-token').value.trim()
      };
      const errorEl = $('#login-error');
      if (!s.token || !s.owner || !s.repo) {
        errorEl.textContent = !s.token ? 'Paste your GitHub access token.' : 'Fill in the repository settings.';
        errorEl.hidden = false;
        if (s.token) $('#repo-settings').open = true;
        return;
      }
      const btn = $('#login-submit');
      btn.disabled = true;
      btn.textContent = 'Signing in…';
      try {
        await signIn(s, $('#login-remember').checked);
        $('#login-token').value = '';
        showApp();
      } catch (err) {
        session = null;
        errorEl.textContent = err instanceof SyntaxError ? 'content/content.json in your repository is not valid JSON.' : explain(err);
        errorEl.hidden = false;
        if (err.status === 404) $('#repo-settings').open = true;
      } finally {
        btn.disabled = false;
        btn.textContent = 'Sign in';
      }
    });
  }

  function logout() {
    if (dirty && !confirm('You have unsaved changes. Sign out anyway?')) return;
    clearSaved();
    session = null;
    content = null;
    pending.clear();
    dirty = false;
    showLogin();
  }

  // ---------- Boot ----------
  setupLogin();
  setupTabs();
  $('#save').addEventListener('click', save);
  $('#logout').addEventListener('click', logout);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && content) { e.preventDefault(); save(); }
  });
  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  const saved = readSaved();
  if (saved && saved.token) {
    $('#login-view').hidden = true;
    const { remember, ...s } = saved;
    signIn(s, !!remember)
      .then(showApp)
      .catch((err) => { clearSaved(); session = null; showLogin(explain(err)); });
  } else {
    showLogin();
  }
})();
