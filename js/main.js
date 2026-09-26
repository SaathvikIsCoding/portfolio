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

  // URL-safe id from a title, e.g. "Game Art & 3D Environments" -> "game-art-3d-environments".
  function slugify(text) {
    return String(text || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item';
  }

  // Give every item a unique id (stored id, else from its title). The admin uses the same
  // rules when saving, so links to project/certificate pages stay stable.
  function withIds(items, titleKey) {
    var seen = {};
    return items.map(function (item) {
      var base = slugify(item.id || item[titleKey]);
      var id = base;
      for (var n = 2; seen[id]; n++) id = base + '-' + n;
      seen[id] = true;
      return Object.assign({}, item, { id: id });
    });
  }

  function projectsOf(data) {
    return withIds((data.projects || []).filter(function (pr) { return pr && pr.title; }), 'title');
  }

  function certsOf(data) {
    return withIds((data.certifications || []).filter(function (c) { return c && c.name; }), 'name');
  }

  function loadContent() {
    return fetch('content/content.json?v=' + Date.now(), { cache: 'no-store' })
      .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); });
  }

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
      var a = externalLink(safeUrl(s.url), s.label);
      a.className = 'pixel-btn pixel-btn-sm';
      return el('li', null, [a]);
    }));

    // About
    var paragraphs = String(p.about || '').split(/\n\s*\n/).map(function (t) { return t.trim(); }).filter(Boolean);
    slot('about').replaceChildren.apply(slot('about'), paragraphs.map(function (t) { return el('p', { text: t }); }));

    var facts = [];
    if (p.location) facts.push(['Location', el('span', { class: 'fact-value', text: p.location })]);
    if (p.email) facts.push(['Email', el('a', { class: 'fact-value', href: 'mailto:' + p.email, text: p.email })]);
    if (safeUrl(p.resume)) {
      var resumeLink = externalLink(safeUrl(p.resume), 'View resume');
      resumeLink.className = 'fact-value'; // same style as the Location and Email values
      facts.push(['Resume', resumeLink]);
    }
    slot('facts').replaceChildren.apply(slot('facts'), facts.map(function (f) {
      return el('li', null, [el('div', { class: 'fact-label', text: f[0] }), f[1]]);
    }));

    // Skills
    var skills = (data.skills || []).filter(Boolean);
    hideSection('skills', skills.length === 0);
    var slotColors = ['var(--color-accent)', 'var(--color-accent-2)', 'var(--color-gold)', 'var(--color-success)'];
    slot('skills').replaceChildren.apply(slot('skills'), skills.map(function (s, i) {
      var icon = el('span', { class: 'slot-icon', 'aria-hidden': 'true', text: skillIcon(s) });
      icon.style.setProperty('--slot-color', slotColors[i % slotColors.length]);
      return el('li', { class: 'slot' }, [icon, el('span', { text: s })]);
    }));

    // Projects: each card opens its own quest page
    var projects = projectsOf(data);
    hideSection('projects', projects.length === 0);
    slot('projects').replaceChildren.apply(slot('projects'), projects.map(function (pr, i) {
      var img = safeUrl(pr.image);
      var media = el('div', { class: 'project-media' + (img ? '' : ' no-image') }, [
        img
          ? el('img', { src: img, alt: 'Screenshot of ' + pr.title, loading: 'lazy', width: '640', height: '400' })
          : el('span', { class: 'project-media-letter', 'aria-hidden': 'true', text: pr.title.trim()[0] || '?' }),
        el('span', { class: 'quest-tag pixel', 'aria-hidden': 'true', text: 'Quest ' + pad(i + 1) })
      ]);
      var tech = (pr.tech || []).filter(Boolean);
      // "Open quest" is stretched over the whole card (CSS), so clicking anywhere opens the page.
      // All three are small pixel buttons, like every other action on the site.
      var links = [el('a', { class: 'quest-open pixel-btn pixel-btn-sm pixel-btn-primary', href: 'project.html?id=' + encodeURIComponent(pr.id), text: 'Open quest' })];
      [[pr.live, 'Live'], [pr.repo, 'Source']].forEach(function (l) {
        if (!safeUrl(l[0])) return;
        var a = externalLink(safeUrl(l[0]), l[1]);
        a.className = 'pixel-btn pixel-btn-sm';
        links.push(a);
      });
      return el('article', { class: 'project-card panel reveal' }, [
        media,
        el('div', { class: 'project-body' }, [
          el('h3', { text: pr.title }),
          pr.description ? el('p', { text: pr.description }) : null,
          tech.length ? el('ul', { class: 'tags', 'aria-label': 'Technologies' }, tech.map(function (t) { return el('li', { text: t }); })) : null,
          el('div', { class: 'project-links' }, links)
        ])
      ]);
    }));

    if (projects.length) firstRowOnly(slot('projects'), 'projects');

    // Hero actions: 8-bit pixel buttons
    var actions = [];
    if (projects.length) actions.push(['#projects', 'View my work']);
    if (safeUrl(p.resume)) actions.push([safeUrl(p.resume), 'Resume']);
    actions.push(['#contact', 'Contact me']);
    slot('actions').replaceChildren.apply(slot('actions'), pixelButtons(actions));

    // Experience and education share one quest-log timeline entry.
    function logEntry(title, details, period, description) {
      var active = /present|current|now/i.test(period || '');
      var meta = details.filter(Boolean).join(', ');
      return el('li', { class: 'reveal' }, [
        el('div', { class: 'log-head' }, [
          el('span', { class: 'quest-status pixel ' + (active ? 'is-active' : 'is-done'), text: active ? 'In progress' : 'Completed' }),
          period ? el('span', { class: 'log-date pixel', text: period }) : null
        ]),
        el('h3', { text: title }),
        meta ? el('p', { class: 'meta', text: meta }) : null,
        descriptionNode(description)
      ]);
    }

    var exp = (data.experience || []).filter(function (x) { return x && (x.role || x.org); });
    hideSection('experience', exp.length === 0);
    slot('experience').replaceChildren.apply(slot('experience'), exp.map(function (x) {
      return logEntry(x.role || x.org, [x.role ? x.org : '', x.location], x.period, x.description);
    }));

    // Education & certifications
    var edu = (data.education || []).filter(function (e) { return e && (e.degree || e.school); });
    var certs = certsOf(data);
    hideSection('education', edu.length === 0 && certs.length === 0);
    // One heading per block: "Education" on top, "Certifications" as its own sub-heading.
    document.getElementById('education-title').textContent = edu.length ? 'Education' : 'Certifications';
    slot('education').replaceChildren.apply(slot('education'), edu.map(function (e) {
      return logEntry(e.degree || e.school, [e.degree ? e.school : ''], e.period, '');
    }));
    slot('certifications').replaceChildren.apply(slot('certifications'), certs.length ? [
      edu.length ? el('h3', { class: 'certs-title', text: 'Certifications' }) : null,
      // Certificate cards: thumbnail of the certificate + name; each links to its page.
      el('ul', { class: 'cert-grid' }, certs.map(function (c) {
        var meta = [c.issuer, c.date].filter(Boolean).join(', ');
        return el('li', { class: 'reveal' }, [
          el('a', { class: 'cert-card', href: 'certificate.html?id=' + encodeURIComponent(c.id) }, [
            el('div', { class: 'cert-thumb' }, [certPreview(c)]),
            el('span', { class: 'cert-card-name', text: c.name }),
            meta ? el('span', { class: 'meta', text: meta }) : null
          ])
        ]);
      }))
    ] : []);
    if (certs.length) firstRowOnly(document.querySelector('.cert-grid'), 'certifications');

    // Player stats (all derived from real content)
    var stats = [];
    var xp = experienceLength(exp);
    if (xp) stats.push(['Experience', xp, /mo$/.test(xp) ? '' : 'yrs']);
    // Labels match the section names in the menu and headings.
    if (projects.length) stats.push(['Projects', pad(projects.length)]);
    if (skills.length) stats.push(['Skills', pad(skills.length)]);
    if (certs.length) stats.push(['Certifications', pad(certs.length)]);
    slot('stats').replaceChildren.apply(slot('stats'), stats.map(function (s) {
      return el('div', { class: 'stat' }, [
        el('dt', { text: s[0] }),
        el('dd', null, [document.createTextNode(s[1]), s[2] ? el('small', { text: s[2] }) : null])
      ]);
    }));

    // Level numbers follow the visible sections, so hidden ones don't leave gaps.
    var level = 0;
    document.querySelectorAll('main > section.section').forEach(function (section) {
      var tag = section.querySelector('.level-tag');
      if (section.hidden) { delete section.dataset.level; return; }
      level += 1;
      section.dataset.level = level;
      if (tag) tag.textContent = 'Level ' + pad(level) + ' · ' + tag.getAttribute('data-level-name');
    });

    renderStructuredData(data);

    // Contact: same 8-bit pixel buttons
    var contact = [];
    if (p.email) contact.push(['mailto:' + p.email, 'Email me']);
    socials.forEach(function (s) { contact.push([safeUrl(s.url), s.label]); });
    slot('contact').replaceChildren.apply(slot('contact'), pixelButtons(contact));
  }

  // 8-bit pixel buttons: the first is the filled main action, the rest are outlined.
  function pixelButtons(items) {
    return items.map(function (item, i) {
      var a = externalLink(item[0], item[1]);
      a.className = 'pixel-btn' + (i === 0 ? ' pixel-btn-primary' : '');
      return a;
    });
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // Show only the first row of a grid (as many items as fit the current width), with a
  // "See all (N)" pixel button to expand it and "Show less" to collapse it again.
  function firstRowOnly(grid, noun) {
    var old = grid.nextElementSibling;
    if (old && old.classList.contains('see-all')) old.remove();
    var expanded = false;
    var button = el('button', { type: 'button', class: 'pixel-btn pixel-btn-sm', 'aria-expanded': 'false' });
    var wrap = el('div', { class: 'pixel-btns see-all' }, [button]);
    grid.after(wrap);

    function update() {
      var items = Array.prototype.slice.call(grid.children);
      var perRow = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
      items.forEach(function (item, i) { item.hidden = !expanded && i >= perRow; });
      wrap.hidden = items.length <= perRow;
      button.textContent = expanded ? 'Show less' : 'See all ' + noun + ' (' + items.length + ')';
      button.setAttribute('aria-expanded', String(expanded));
    }
    button.addEventListener('click', function () {
      expanded = !expanded;
      update();
      if (!expanded) grid.scrollIntoView({ block: 'nearest' });
    });
    window.addEventListener('resize', update);
    update();
  }

  // What a certificate looks like in lists: its preview image, the certificate image itself,
  // or (for PDFs without a preview, or nothing uploaded yet) a paper-certificate stand-in.
  function isPdf(path) { return /\.pdf($|[?#])/i.test(path || ''); }

  function certPreview(c) {
    var src = safeUrl(c.thumb) || (c.file && !isPdf(c.file) ? safeUrl(c.file) : '');
    if (src) return el('img', { src: src, alt: c.name + ' certificate', loading: 'lazy' });
    return certPaper(c);
  }

  function certPaper(c) {
    return el('div', { class: 'cert-paper', 'aria-hidden': 'true' }, [
      el('span', { class: 'cert-paper-label pixel', text: 'Certificate' }),
      el('span', { class: 'cert-paper-name', text: c.name }),
      c.issuer ? el('span', { class: 'cert-paper-issuer', text: c.issuer }) : null,
      isPdf(c.file) ? el('span', { class: 'cert-paper-badge pixel', text: 'PDF' }) : null
    ]);
  }

  function skillIcon(name) {
    var words = name.replace(/[^\w\s.+#]/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    var text = words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2);
    return text.toUpperCase();
  }

  // "2+" years from the earliest start date found in experience periods (e.g. "Aug 2024 – Present").
  function experienceLength(items) {
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
    var total = (new Date().getFullYear() - earliest.getFullYear()) * 12 + new Date().getMonth() - earliest.getMonth();
    if (total < 1) return '';
    return total < 12 ? total + ' mo' : Math.floor(total / 12) + '+';
  }

  // Multi-line descriptions become bullet lists; single lines stay a paragraph.
  function descriptionNode(text) {
    var lines = String(text || '').split('\n').map(function (l) { return l.replace(/^\s*[•\-*]\s*/, '').trim(); }).filter(Boolean);
    if (!lines.length) return null;
    if (lines.length === 1) return el('p', { text: lines[0] });
    return el('ul', { class: 'bullets' }, lines.map(function (l) { return el('li', { text: l }); }));
  }

  // schema.org Person data, read by search engines and recruiting tools.
  function renderStructuredData(data) {
    var p = data.profile || {};
    var socials = (data.socials || []).map(function (s) { return safeUrl(s && s.url); }).filter(function (u) { return /^https?:/i.test(u); });
    var current = (data.experience || []).find(function (x) { return x && /present/i.test(x.period || ''); });
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
    window.matchMedia('(min-width: 1200px)').addEventListener('change', close);
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

  // Shared with the project/certificate pages (js/detail.js).
  window.Portfolio = {
    safeUrl: safeUrl, el: el, externalLink: externalLink, pixelButtons: pixelButtons, pad: pad,
    certPaper: certPaper, isPdf: isPdf, projectsOf: projectsOf, certsOf: certsOf, loadContent: loadContent
  };

  setupNav();

  // Everything below renders the home page only.
  if (!slot('about')) return;

  loadContent()
    .then(function (data) { render(data); setupReveal(); document.dispatchEvent(new CustomEvent('portfolio:rendered')); })
    .catch(function (err) {
      console.error('Could not load content:', err);
      slot('about').replaceChildren(el('p', { text: 'Content could not be loaded. Please refresh the page.' }));
    })
    .finally(function () { document.body.classList.remove('is-loading'); });
})();
