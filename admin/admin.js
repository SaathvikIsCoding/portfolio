(function () {
  'use strict';

  // Used when the admin is opened somewhere other than <user>.github.io (e.g. localhost).
  const DEFAULT_REPO = { owner: 'SaathvikIsCoding', repo: 'portfolio', branch: 'main' };
  const CONTENT_PATH = 'content/content.json';
  const UPLOAD_DIR = 'assets/uploads';
  const API = 'https://api.github.com';
  const STORE_KEY = 'portfolio-admin';
  const PROFILE_KEYS = ['name', 'role', 'tagline', 'about', 'summary', 'photo', 'location', 'email', 'resume'];

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
        title: str(pr && pr.title),
        description: str(pr && pr.description),
        tech: arr(pr && pr.tech).map(str).filter(Boolean),
        image: str(pr && pr.image),
        live: str(pr && pr.live),
        repo: str(pr && pr.repo)
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
        name: str(c && c.name),
        issuer: str(c && c.issuer)
      }))
    };
  }

  function cleaned(c) {
    const trim = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
    return {
      profile: trim(c.profile),
      socials: c.socials.map(trim).filter((s) => s.label && s.url),
      skills: c.skills.map((s) => s.trim()).filter(Boolean),
      projects: c.projects.map(trim).filter((p) => p.title),
      experience: c.experience.map(trim).filter((x) => x.role || x.org),
      education: c.education.map(trim).filter((e) => e.degree || e.school),
      certifications: c.certifications.map(trim).filter((x) => x.name)
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
      const used = new Set([data.profile.photo, ...data.projects.map((p) => p.image)].filter(Boolean));
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

  function imagePicker(label, obj, key, { shape = '', maxSize = 1600 } = {}) {
    const slot = h('span');
    const fileInput = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif,image/avif', class: 'file-input', tabindex: '-1', 'aria-hidden': 'true' });
    const uploadBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => fileInput.click() });
    const removeBtn = h('button', {
      type: 'button', class: 'btn btn-danger btn-sm', text: 'Remove',
      onclick: () => { obj[key] = ''; markDirty(); refresh(); }
    });

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      fileInput.value = '';
      if (!file) return;
      try {
        uploadBtn.disabled = true;
        const { blob, ext } = await prepareImage(file, maxSize);
        const path = `${UPLOAD_DIR}/${Date.now()}-${slug(file.name)}.${ext}`;
        pending.set(path, blob);
        previews.set(path, URL.createObjectURL(blob));
        obj[key] = path;
        markDirty();
        refresh();
      } catch (e) {
        toast(e && e.message ? e.message : 'Could not read that image.', true);
      } finally {
        uploadBtn.disabled = false;
      }
    });

    function refresh() {
      const src = previewSrc(obj[key]);
      slot.replaceChildren(src
        ? h('img', { class: `image-preview ${shape}`, src, alt: '' })
        : h('div', { class: `image-preview ${shape}`, text: 'No image' }));
      uploadBtn.textContent = obj[key] ? 'Change image' : 'Upload image';
      removeBtn.hidden = !obj[key];
    }
    refresh();

    return h('div', { class: 'field' },
      h('span', { text: label }),
      h('div', { class: 'image-picker' }, slot, h('div', { class: 'image-actions' }, uploadBtn, removeBtn, fileInput)));
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
        intro: 'Your work. The first project appears first on your site.',
        addText: 'Add project',
        emptyText: 'No projects yet. Click "Add project" to add your first one.',
        create: () => ({ title: '', description: '', tech: [], image: '', live: '', repo: '' }),
        summary: (p) => p.title || 'Untitled project',
        body: (p, refresh) => [
          field('Project name', p, 'title', { onChange: refresh }),
          field('Description', p, 'description', { multiline: true, rows: 4, hint: 'What it does and what you built. 1–3 sentences works best.' }),
          listField('Technologies', p, 'tech', { placeholder: 'React, Node.js, MongoDB', hint: 'Separate with commas.' }),
          grid2(
            field('Live site URL', p, 'live', { type: 'url', placeholder: 'https://…' }),
            field('Source code URL', p, 'repo', { type: 'url', placeholder: 'https://github.com/…' })
          ),
          imagePicker('Screenshot', p, 'image', { shape: 'wide', maxSize: 1600 })
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
        intro: 'Courses and certificates you have completed.',
        addText: 'Add certification',
        emptyText: 'No certifications yet.',
        create: () => ({ name: '', issuer: '' }),
        summary: (c) => c.name || 'New certification',
        body: (c, refresh) => [
          grid2(
            field('Certificate name', c, 'name', { onChange: refresh }),
            field('Issued by', c, 'issuer', { placeholder: 'e.g. Coursera, Udemy, Epic Games' })
          )
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
