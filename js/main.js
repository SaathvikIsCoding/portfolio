(function () {
  'use strict';

  // Allow only safe link targets: http(s), mailto, or relative paths.
  function safeUrl(url) {
    if (typeof url !== 'string') return '';
    url = url.trim();
    if (!url) return '';
    if (/^(https?:|mailto:)/i.test(url)) return url;
    if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return '';
    return url;
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value == null || value === false) return;
        if (key === 'text') node.textContent = value;
        else node.setAttribute(key, value);
      });
    }
    (children || []).forEach(function (child) { if (child) node.appendChild(child); });
    return node;
  }

  function externalLink(href, text) {
    var a = el('a', { href: href, text: text });
    if (/^https?:/i.test(href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    return a;
  }

  function initials(name) {
    return (name || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase();
  }

  function slot(name) { return document.querySelector('[data-slot="' + name + '"]'); }

  function hideSection(id, hide) {
    var section = document.getElementById(id);
    if (section) section.hidden = hide;
    var navItem = document.querySelector('[data-section="' + id + '"]');
    if (navItem) navItem.hidden = hide;
  }

  function render(data) {
    var p = data.profile || {};
    var name = p.name || 'Your Name';

    document.querySelectorAll('[data-bind]').forEach(function (node) {
      var key = node.getAttribute('data-bind');
      if (key === 'year') node.textContent = new Date().getFullYear();
      else if (key === 'name') node.textContent = name;
      else node.textContent = p[key] || '';
    });

    var title = p.role ? name + ' | ' + p.role : name;
    document.title = title;
    var desc = p.tagline || title;
    [['meta[name="description"]', desc], ['meta[property="og:title"]', title], ['meta[property="og:description"]', desc]]
      .forEach(function (pair) { var m = document.querySelector(pair[0]); if (m) m.setAttribute('content', pair[1]); });

    // Photo
    var photoSlot = slot('photo');
    var photo = safeUrl(p.photo);
    photoSlot.replaceChildren(photo
      ? el('img', { class: 'avatar', src: photo, alt: 'Photo of ' + name, width: '340', height: '340' })
      : el('div', { class: 'avatar avatar-initials', 'aria-hidden': 'true', text: initials(name) }));

    // Socials
    var socials = (data.socials || []).filter(function (s) { return s && s.label && safeUrl(s.url); });
    slot('socials').replaceChildren.apply(slot('socials'), socials.map(function (s) {
      return el('li', null, [externalLink(safeUrl(s.url), s.label)]);
    }));

    // About
    var paragraphs = String(p.about || '').split(/\n\s*\n/).map(function (t) { return t.trim(); }).filter(Boolean);
    slot('about').replaceChildren.apply(slot('about'), paragraphs.map(function (t) { return el('p', { text: t }); }));

    var facts = [];
    if (p.location) facts.push(['Location', el('span', { class: 'fact-value', text: p.location })]);
    if (p.email) facts.push(['Email', el('a', { class: 'fact-value', href: 'mailto:' + p.email, text: p.email })]);
    if (safeUrl(p.resume)) facts.push(['Resume', externalLink(safeUrl(p.resume), 'View resume')]);
    slot('facts').replaceChildren.apply(slot('facts'), facts.map(function (f) {
      return el('li', null, [el('div', { class: 'fact-label', text: f[0] }), f[1]]);
    }));

    // Skills
    var skills = (data.skills || []).filter(Boolean);
    hideSection('skills', skills.length === 0);
    slot('skills').replaceChildren.apply(slot('skills'), skills.map(function (s) { return el('li', { text: s }); }));

    // Projects
    var projects = (data.projects || []).filter(function (pr) { return pr && pr.title; });
    hideSection('projects', projects.length === 0);
    slot('projects').replaceChildren.apply(slot('projects'), projects.map(function (pr) {
      var img = safeUrl(pr.image);
      var media = el('div', { class: 'project-media' }, [img
        ? el('img', { src: img, alt: 'Screenshot of ' + pr.title, loading: 'lazy', width: '640', height: '400' })
        : el('span', { class: 'project-media-letter', 'aria-hidden': 'true', text: pr.title.trim()[0] || '?' })]);
      var tech = (pr.tech || []).filter(Boolean);
      var links = [];
      if (safeUrl(pr.live)) links.push(externalLink(safeUrl(pr.live), 'Live site →'));
      if (safeUrl(pr.repo)) links.push(externalLink(safeUrl(pr.repo), 'Source code →'));
      return el('article', { class: 'project-card reveal' }, [
        media,
        el('div', { class: 'project-body' }, [
          el('h3', { text: pr.title }),
          pr.description ? el('p', { text: pr.description }) : null,
          tech.length ? el('ul', { class: 'tags', 'aria-label': 'Technologies' }, tech.map(function (t) { return el('li', { text: t }); })) : null,
          links.length ? el('div', { class: 'project-links' }, links) : null
        ])
      ]);
    }));

    // Experience
    var exp = (data.experience || []).filter(function (x) { return x && (x.role || x.org); });
    hideSection('experience', exp.length === 0);
    slot('experience').replaceChildren.apply(slot('experience'), exp.map(function (x) {
      var meta = [x.org, x.period].filter(Boolean).join(' · ');
      return el('li', { class: 'reveal' }, [
        el('h3', { text: x.role || x.org }),
        meta ? el('p', { class: 'meta', text: meta }) : null,
        x.description ? el('p', { text: x.description }) : null
      ]);
    }));

    // Contact
    var contact = [];
    if (p.email) contact.push(el('a', { class: 'btn btn-primary', href: 'mailto:' + p.email, text: 'Email me' }));
    socials.forEach(function (s) {
      var a = externalLink(safeUrl(s.url), s.label);
      a.className = 'btn btn-ghost';
      contact.push(a);
    });
    slot('contact').replaceChildren.apply(slot('contact'), contact);
  }

  function setupNav() {
    var toggle = document.querySelector('.nav-toggle');
    var list = document.getElementById('nav-list');
    function close() { list.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); }
    toggle.addEventListener('click', function () {
      var open = !list.classList.contains('is-open');
      list.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
    });
    list.addEventListener('click', function (e) { if (e.target.closest('a')) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && list.classList.contains('is-open')) { close(); toggle.focus(); } });
    window.matchMedia('(min-width: 768px)').addEventListener('change', close);
  }

  function setupTheme() {
    var btn = document.querySelector('.theme-toggle');
    btn.addEventListener('click', function () {
      var root = document.documentElement;
      var current = root.dataset.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      var next = current === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem('theme', next); } catch (e) {}
    });
  }

  function setupReveal() {
    var items = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) { items.forEach(function (n) { n.classList.add('is-visible'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add('is-visible'); io.unobserve(entry.target); }
      });
    }, { rootMargin: '0px 0px -40px 0px' });
    items.forEach(function (n) { io.observe(n); });
  }

  setupNav();
  setupTheme();

  fetch('content/content.json?v=' + Date.now(), { cache: 'no-store' })
    .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
    .then(function (data) { render(data); setupReveal(); })
    .catch(function (err) {
      console.error('Could not load content:', err);
      slot('about').replaceChildren(el('p', { text: 'Content could not be loaded. Please refresh the page.' }));
    })
    .finally(function () { document.body.classList.remove('is-loading'); });
})();
