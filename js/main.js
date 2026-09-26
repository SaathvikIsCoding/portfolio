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
    (children || []).forEach(function (child) {
      if (child) node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function link(href, text, cls) {
    var a = el('a', { href: href, text: text, class: cls });
    if (/^https?:/i.test(href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    return a;
  }

  function fill(name, nodes) {
    var node = document.querySelector('[data-slot="' + name + '"]');
    node.replaceChildren.apply(node, nodes.filter(Boolean));
  }

  function hideSection(id, hide) {
    var section = document.getElementById(id);
    if (section) section.hidden = hide;
    var navItem = document.querySelector('[data-section="' + id + '"]');
    if (navItem) navItem.hidden = hide;
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function lines(text) {
    return String(text || '').split('\n').map(function (l) { return l.replace(/^\s*[•\-*]\s*/, '').trim(); }).filter(Boolean);
  }

  function trophy() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('class', 'trophy');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('shape-rendering', 'crispEdges');
    var path = document.createElementNS(ns, 'path');
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('fill-rule', 'evenodd');
    path.setAttribute('d', 'M4 1h8v2h3v4h-1v1h-2v1h-1v2h-1v1h2v3H4v-3h2v-1H5V9H4V8H2V7H1V3h3zM2 4h2v2H2zm10 0h2v2h-2z');
    svg.appendChild(path);
    return svg;
  }
  window.pixelTrophy = trophy;

  // Time since the earliest start date in the experience list, e.g. "2y 1m".
  function playtime(items) {
    var months = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ');
    var earliest = null;
    items.forEach(function (x) {
      var m = String(x.period || '').match(/(?:([a-z]{3})[a-z]*\.?\s+)?(\d{4})/i);
      if (!m) return;
      var mi = m[1] ? months.indexOf(m[1].toLowerCase()) : 0;
      var d = new Date(Number(m[2]), mi < 0 ? 0 : mi, 1);
      if (!earliest || d < earliest) earliest = d;
    });
    if (!earliest) return '';
    var now = new Date();
    var total = (now.getFullYear() - earliest.getFullYear()) * 12 + now.getMonth() - earliest.getMonth();
    if (total < 1) return '';
    var y = Math.floor(total / 12), mo = total % 12;
    return (y ? y + 'y ' : '') + (mo ? mo + 'm' : '').trim();
  }

  function isCurrent(period) { return /present|current|now/i.test(period || ''); }

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

    var socials = (data.socials || []).filter(function (s) { return s && s.label && safeUrl(s.url); });
    var skills = (data.skills || []).filter(Boolean);
    var projects = (data.projects || []).filter(function (pr) { return pr && pr.title; });
    var exp = (data.experience || []).filter(function (x) { return x && (x.role || x.org); });
    var edu = (data.education || []).filter(function (e) { return e && (e.degree || e.school); });
    var certs = (data.certifications || []).filter(function (c) { return c && c.name; });

    // Hero
    var photo = safeUrl(p.photo);
    fill('photo', [photo
      ? el('img', { class: 'photo', src: photo, alt: 'Photo of ' + name, width: '300', height: '300' })
      : el('div', { class: 'photo photo-initials', 'aria-hidden': 'true', text: name.trim()[0] || '?' })]);

    fill('actions', [
      projects.length ? el('a', { class: 'btn', href: '#projects', text: 'See my work' }) : el('a', { class: 'btn', href: '#contact', text: 'Get in touch' }),
      safeUrl(p.resume) ? link(safeUrl(p.resume), 'Resume ↗', 'text-link') : null
    ]);

    // Save file
    var time = playtime(exp);
    var saveData = [];
    if (p.location) saveData.push(['Location', p.location]);
    if (time) saveData.push(['Playtime', time]);
    fill('savefile', [el('div', { class: 'window save-file' }, [
      el('span', { class: 'save-slot pixel', text: 'File 1' }),
      el('div', { class: 'save-main' }, [el('strong', { text: name }), p.role ? el('span', { text: p.role }) : null]),
      saveData.length ? el('dl', { class: 'save-data' }, saveData.reduce(function (acc, row) {
        return acc.concat([el('dt', { text: row[0] }), el('dd', { text: row[1] })]);
      }, [])) : null
    ])]);

    // About: dialog box
    var paragraphs = String(p.about || '').split(/\n\s*\n/).map(function (t) { return t.trim(); }).filter(Boolean);
    fill('about', paragraphs.length ? [el('div', { class: 'window dialog' }, [
      el('span', { class: 'dialog-name', 'aria-hidden': 'true', text: name }),
      el('div', null, paragraphs.map(function (t) { return el('p', { text: t }); })),
      el('span', { class: 'dialog-next', 'aria-hidden': 'true', text: '▼' })
    ])] : []);

    // Skills
    hideSection('skills', skills.length === 0);
    fill('skills', skills.map(function (s) { return el('li', { text: s }); }));

    // Projects: level select
    hideSection('projects', projects.length === 0);
    fill('projects', projects.map(function (pr, i) {
      var live = safeUrl(pr.live), repo = safeUrl(pr.repo), img = safeUrl(pr.image);
      var primary = live || repo;
      var tech = (pr.tech || []).filter(Boolean);
      var links = [];
      if (live) links.push(link(live, 'Open project ↗'));
      if (repo) links.push(link(repo, 'Source ↗'));
      return el('li', { class: 'level' }, [
        el('span', { class: 'level-num', 'aria-hidden': 'true', text: pad(i + 1) }),
        el('div', { class: 'level-info' }, [
          el('h3', null, [primary ? link(primary, pr.title) : el('span', { text: pr.title })]),
          pr.description ? el('p', { class: 'level-desc', text: pr.description }) : null,
          tech.length ? el('p', { class: 'level-meta' }, [el('b', { text: 'Made with ' }), tech.join(', ')]) : null,
          links.length ? el('div', { class: 'level-links' }, links) : null
        ]),
        img ? el('div', { class: 'level-thumb' }, [el('img', { src: img, alt: 'Screenshot of ' + pr.title, loading: 'lazy', width: '640', height: '400' })]) : null
      ]);
    }));

    // Experience
    hideSection('experience', exp.length === 0);
    fill('experience', exp.map(function (x) {
      var points = lines(x.description);
      return el('li', { class: 'log-row' }, [
        el('div', { class: 'log-date' }, [x.period || '', isCurrent(x.period) ? el('span', { class: 'now', text: '● Current' }) : null]),
        el('div', null, [
          el('h3', { text: x.role || x.org }),
          el('p', { class: 'log-org', text: [x.role ? x.org : '', x.location].filter(Boolean).join(', ') }),
          points.length > 1
            ? el('ul', null, points.map(function (l) { return el('li', { text: l }); }))
            : points.length ? el('p', { class: 'log-text', text: points[0] }) : null
        ])
      ]);
    }));

    // Education & certifications
    hideSection('education', edu.length === 0 && certs.length === 0);
    document.querySelector('#education-title .title-text').textContent = edu.length ? 'Education' : 'Certifications';
    fill('education', edu.map(function (e) {
      return el('li', { class: 'log-row' }, [
        el('div', { class: 'log-date', text: e.period || '' }),
        el('div', null, [
          el('h3', { text: e.degree || e.school }),
          e.degree && e.school ? el('p', { class: 'log-org', text: e.school }) : null
        ])
      ]);
    }));
    fill('certifications', certs.length ? [
      edu.length ? el('h3', { class: 'badges-title', text: 'Certifications' }) : null,
      el('ul', { class: 'badges' }, certs.map(function (c) {
        return el('li', null, [trophy(), el('span', null, [c.name, c.issuer ? el('span', { class: 'meta', text: ', ' + c.issuer }) : null])]);
      }))
    ] : []);

    // Contact
    fill('contact', [
      p.email ? el('p', { class: 'contact-intro', text: 'Email is the quickest way to reach me.' }) : null,
      p.email ? el('a', { class: 'big-email', href: 'mailto:' + p.email, text: p.email }) : null,
      socials.length ? el('ul', { class: 'contact-links' }, socials.map(function (s) {
        return el('li', null, [link(safeUrl(s.url), s.label + ' ↗')]);
      })) : null
    ]);

    // Stage numbers (1-1, 1-2, …) follow the visible sections so hidden ones leave no gaps.
    var stage = 0;
    document.querySelectorAll('main > section.section').forEach(function (section) {
      var tag = section.querySelector('.stage');
      if (section.hidden) { delete section.dataset.level; return; }
      stage += 1;
      section.dataset.level = stage;
      if (tag) tag.textContent = '1-' + stage;
    });

    renderStructuredData(data);
  }

  // schema.org Person data, read by search engines and recruiting tools.
  function renderStructuredData(data) {
    var p = data.profile || {};
    var socials = (data.socials || []).map(function (s) { return safeUrl(s && s.url); }).filter(function (u) { return /^https?:/i.test(u); });
    var current = (data.experience || []).find(function (x) { return x && isCurrent(x.period); });
    var person = {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: p.name || undefined,
      jobTitle: p.role || undefined,
      description: p.tagline || undefined,
      email: p.email ? 'mailto:' + p.email : undefined,
      url: location.href.split('#')[0],
      image: safeUrl(p.photo) ? new URL(safeUrl(p.photo), location.href).href : undefined,
      address: p.location ? { '@type': 'PostalAddress', addressLocality: p.location } : undefined,
      sameAs: socials.length ? socials : undefined,
      knowsAbout: (data.skills || []).length ? data.skills : undefined,
      worksFor: current && current.org ? { '@type': 'Organization', name: current.org } : undefined,
      alumniOf: (data.education || []).filter(function (e) { return e && e.school; })
        .map(function (e) { return { '@type': 'CollegeOrUniversity', name: e.school }; })
    };
    if (!person.alumniOf.length) delete person.alumniOf;
    var script = document.getElementById('person-jsonld') || document.head.appendChild(el('script', { type: 'application/ld+json', id: 'person-jsonld' }));
    script.textContent = JSON.stringify(person);
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
    window.matchMedia('(min-width: 900px)').addEventListener('change', close);
  }

  function setupTheme() {
    var btn = document.querySelector('.theme-toggle');
    var root = document.documentElement;
    function label() {
      var dark = root.dataset.theme !== 'light';
      btn.textContent = dark ? 'Lights on' : 'Lights off';
      btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    }
    btn.addEventListener('click', function () {
      var next = root.dataset.theme === 'light' ? 'dark' : 'light';
      root.dataset.theme = next;
      try { localStorage.setItem('theme', next); } catch (e) {}
      label();
    });
    label();
  }

  setupNav();
  setupTheme();

  fetch('content/content.json?v=' + Date.now(), { cache: 'no-store' })
    .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
    .then(function (data) { render(data); document.dispatchEvent(new CustomEvent('portfolio:rendered')); })
    .catch(function (err) {
      console.error('Could not load content:', err);
      fill('about', [el('p', { text: 'Content could not be loaded. Please refresh the page.' })]);
    })
    .finally(function () { document.body.classList.remove('is-loading'); });
})();
