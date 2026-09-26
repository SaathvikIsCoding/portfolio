// Renders project.html?id=… and certificate.html?id=… from content/content.json.
// Shared helpers come from main.js (window.Portfolio).
(function () {
  'use strict';

  var P = window.Portfolio;
  var el = P.el;
  var safeUrl = P.safeUrl;
  var page = document.body.dataset.page;
  var root = document.querySelector('[data-slot="detail"]');
  var id = new URLSearchParams(location.search).get('id') || '';
  var ownerName = 'Portfolio';

  function bindProfile(p) {
    ownerName = p.name || ownerName;
    document.querySelectorAll('[data-bind]').forEach(function (node) {
      var key = node.getAttribute('data-bind');
      if (key === 'year') node.textContent = new Date().getFullYear();
      else if (key === 'name') node.textContent = ownerName;
    });
  }

  function setMeta(title, description) {
    document.title = title + ' | ' + ownerName;
    var meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', description || title);
  }

  function back(href, text) {
    return el('div', { class: 'pixel-btns detail-back' }, [el('a', { class: 'pixel-btn pixel-btn-sm', href: href, text: text })]);
  }

  function metaStrip(rows) {
    return el('dl', { class: 'detail-meta' }, rows.map(function (r) {
      return el('div', null, [el('dt', { text: r[0] }), el('dd', { text: r[1] })]);
    }));
  }

  function section(tag, title, content) {
    return el('section', { class: 'detail-section' }, [
      el('p', { class: 'level-tag pixel', text: tag }),
      el('h2', { class: 'section-title', text: title }),
      content
    ]);
  }

  // Light formatting for the process write-up, built as DOM (never innerHTML):
  // blank line = new paragraph, "## Heading" = sub-heading, "- item" = bullet.
  function prose(text) {
    var nodes = [];
    var para = [];
    var list = null;
    function flush() { if (para.length) { nodes.push(el('p', { text: para.join(' ') })); para = []; } }
    String(text || '').split('\n').forEach(function (raw) {
      var line = raw.trim();
      if (!line) { flush(); list = null; return; }
      if (/^#{1,3}\s+/.test(line)) { flush(); list = null; nodes.push(el('h3', { text: line.replace(/^#{1,3}\s+/, '') })); return; }
      if (/^[-*•]\s+/.test(line)) {
        flush();
        if (!list) { list = el('ul'); nodes.push(list); }
        list.appendChild(el('li', { text: line.replace(/^[-*•]\s+/, '') }));
        return;
      }
      list = null;
      para.push(line);
    });
    flush();
    return el('div', { class: 'prose' }, nodes);
  }

  function pager(list, index, base, noun) {
    var prev = list[index - 1];
    var next = list[index + 1];
    if (!prev && !next) return null;
    return el('nav', { class: 'detail-pager', 'aria-label': noun + ' navigation' }, [
      prev ? el('a', { class: 'pixel-btn pixel-btn-sm', href: base + encodeURIComponent(prev.id), text: '< Prev ' + noun }) : el('span'),
      next ? el('a', { class: 'pixel-btn pixel-btn-sm', href: base + encodeURIComponent(next.id), text: 'Next ' + noun + ' >' }) : el('span')
    ]);
  }

  function notFound(backHref, backText, what) {
    setMeta(what + ' not found', '');
    root.replaceChildren(
      back(backHref, backText),
      el('h1', { class: 'detail-title', text: what + ' not found' }),
      el('p', { class: 'detail-summary', text: 'This link may be out of date. Head back and pick another one.' })
    );
  }

  // ---------- Lightbox (native <dialog>: Esc closes, focus is trapped) ----------
  var lb = null;
  function lightbox() {
    if (lb) return lb;
    var img = el('img', { class: 'lightbox-img', alt: '' });
    var caption = el('p', { class: 'lightbox-caption' });
    var count = el('span', { class: 'lightbox-count pixel' });
    var prev = el('button', { type: 'button', class: 'pixel-btn pixel-btn-sm', text: '< Prev' });
    var next = el('button', { type: 'button', class: 'pixel-btn pixel-btn-sm', text: 'Next >' });
    var close = el('button', { type: 'button', class: 'pixel-btn pixel-btn-sm', text: 'Close X' });
    var dialog = el('dialog', { class: 'lightbox', 'aria-label': 'Image viewer' }, [
      el('div', { class: 'lightbox-bar' }, [count, close]),
      el('figure', { class: 'lightbox-figure' }, [img, caption]),
      el('div', { class: 'lightbox-nav' }, [prev, next])
    ]);
    document.body.appendChild(dialog);

    lb = { dialog: dialog, items: [], index: 0 };
    lb.show = function (i) {
      var n = lb.items.length;
      lb.index = (i + n) % n;
      var item = lb.items[lb.index];
      img.src = item.src;
      img.alt = item.alt;
      caption.textContent = item.caption || '';
      caption.hidden = !item.caption;
      count.textContent = (lb.index + 1) + ' / ' + n;
      prev.hidden = next.hidden = n < 2;
    };
    prev.addEventListener('click', function () { lb.show(lb.index - 1); });
    next.addEventListener('click', function () { lb.show(lb.index + 1); });
    close.addEventListener('click', function () { dialog.close(); });
    dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); }); // backdrop
    dialog.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') lb.show(lb.index - 1);
      if (e.key === 'ArrowRight') lb.show(lb.index + 1);
    });
    return lb;
  }

  function openLightbox(items, index) {
    var box = lightbox();
    box.items = items;
    box.show(index);
    if (!box.dialog.open) box.dialog.showModal();
  }

  function galleryGrid(items) {
    return el('ul', { class: 'gallery' }, items.map(function (item, i) {
      var button = el('button', { type: 'button', class: 'gallery-item', 'aria-label': 'Open image ' + (i + 1) + (item.caption ? ': ' + item.caption : '') }, [
        el('img', { src: item.src, alt: item.alt, loading: 'lazy' }),
        item.caption ? el('span', { class: 'gallery-caption', text: item.caption }) : null
      ]);
      button.addEventListener('click', function () { openLightbox(items, i); });
      return el('li', null, [button]);
    }));
  }

  // ---------- Project sections (built in the admin from blocks) ----------
  function imageCount(type) {
    var m = /^images-([1-4])$/.exec(type || '');
    return m ? Number(m[1]) : 0;
  }

  function figmaEmbedUrl(url) {
    if (!/^https:\/\/([\w-]+\.)?figma\.com\//i.test(url || '')) return '';
    return 'https://www.figma.com/embed?embed_host=share&url=' + encodeURIComponent(url);
  }

  // Custom HTML runs inside a sandboxed data: URL frame. data: frames always get their own
  // opaque origin, so the HTML can't touch this site (cookies, storage, page), while embeds
  // inside it (YouTube, Sketchfab, CodePen…) still work. A tiny script reports its height.
  function htmlEmbed(html, title) {
    var doc = '<!doctype html><html><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><base target="_blank">' +
      // color-scheme must match the dark site, or the browser paints a white backdrop behind the frame.
      '<style>:root{color-scheme:dark}html,body{margin:0;padding:0;background:transparent;color:#f2f2f2;font:16px/1.6 system-ui,sans-serif}' +
      'img,video,iframe,canvas{max-width:100%}a{color:#22d3ee}</style></head><body>' + html +
      '<script>(function(){function s(){parent.postMessage({portfolioEmbedHeight:Math.ceil(document.documentElement.scrollHeight)},"*")}' +
      'addEventListener("load",s);if(window.ResizeObserver)new ResizeObserver(s).observe(document.body);s()})()<\/script></body></html>';
    return el('div', { class: 'embed embed-html' }, [el('iframe', {
      src: 'data:text/html;charset=utf-8,' + encodeURIComponent(doc),
      title: title,
      loading: 'lazy',
      sandbox: 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation allow-forms',
      allow: 'fullscreen; autoplay; encrypted-media; picture-in-picture; clipboard-write'
    })]);
  }

  // Resize HTML embeds to fit their content.
  window.addEventListener('message', function (e) {
    var h = e.data && e.data.portfolioEmbedHeight;
    if (typeof h !== 'number') return;
    document.querySelectorAll('.embed-html iframe').forEach(function (frame) {
      if (frame.contentWindow === e.source) frame.style.height = Math.min(Math.max(h, 60), 4000) + 'px';
    });
  });

  function shotGrid(images, title) {
    var items = images.map(function (g, i) {
      return { src: g.src, caption: g.caption || '', alt: g.caption || title + ', image ' + (i + 1) };
    });
    return el('div', { class: 'shot-grid shots-' + items.length }, items.map(function (item, i) {
      var button = el('button', { type: 'button', class: 'gallery-item', 'aria-label': 'Open image' + (item.caption ? ': ' + item.caption : ' ' + (i + 1)) }, [
        el('img', { src: item.src, alt: item.alt, loading: 'lazy' }),
        item.caption ? el('span', { class: 'gallery-caption', text: item.caption }) : null
      ]);
      button.addEventListener('click', function () { openLightbox(items, i); });
      return button;
    }));
  }

  function projectSections(pr) {
    return (pr.sections || []).map(function (s, i) {
      var heading = s.heading || '';
      var images = (s.images || []).slice(0, imageCount(s.type)).filter(function (g) { return g && safeUrl(g.src); })
        .map(function (g) { return { src: safeUrl(g.src), caption: g.caption || '' }; });
      var media = null;
      if (images.length) media = shotGrid(images, heading || pr.title);
      else if (s.type === 'html' && s.html) media = htmlEmbed(s.html, heading || pr.title + ' embed');
      else if (s.type === 'figma' && figmaEmbedUrl(s.figma)) {
        media = el('div', null, [
          el('div', { class: 'embed embed-figma' }, [el('iframe', { src: figmaEmbedUrl(s.figma), title: (heading || pr.title) + ' (Figma)', loading: 'lazy', allowfullscreen: '' })]),
          el('div', { class: 'pixel-btns embed-links' }, [P.externalLink(s.figma, 'Open in Figma')])
        ]);
        media.querySelector('.embed-links a').className = 'pixel-btn pixel-btn-sm';
      }
      if (!heading && !s.text && !media) return null;
      return el('section', { class: 'detail-section' }, [
        el('p', { class: 'level-tag pixel', text: 'Part ' + P.pad(i + 1) }),
        heading ? el('h2', { class: 'section-title', text: heading }) : null,
        s.text ? prose(s.text) : null,
        media
      ]);
    }).filter(Boolean);
  }

  // ---------- Project page ----------
  function renderProject(data) {
    var list = P.projectsOf(data);
    var index = list.map(function (x) { return x.id; }).indexOf(id);
    if (index < 0) return notFound('./#projects', '< Back to projects', 'Quest');
    var pr = list[index];
    var label = 'Quest ' + P.pad(index + 1);
    document.body.dataset.hud = label;
    setMeta(pr.title, pr.description);

    var tech = (pr.tech || []).filter(Boolean);
    var rows = [];
    if (pr.role) rows.push(['Role', pr.role]);
    if (pr.period) rows.push(['When', pr.period]);
    if (tech.length) rows.push(['Made with', tech.join(', ')]);

    var links = [];
    if (safeUrl(pr.live)) links.push([safeUrl(pr.live), 'Open project']);
    if (safeUrl(pr.repo)) links.push([safeUrl(pr.repo), 'Source code']);

    var gallery = (pr.gallery || []).filter(function (g) { return g && safeUrl(g.src); }).map(function (g, i) {
      return { src: safeUrl(g.src), caption: g.caption || '', alt: g.caption || pr.title + ', image ' + (i + 1) };
    });
    var cover = safeUrl(pr.image);

    root.replaceChildren.apply(root, [
      back('./#projects', '< Back to projects'),
      el('p', { class: 'level-tag pixel', text: label }),
      el('h1', { class: 'detail-title', text: pr.title }),
      pr.description ? el('p', { class: 'detail-summary', text: pr.description }) : null,
      rows.length ? metaStrip(rows) : null,
      links.length ? el('div', { class: 'pixel-btns detail-links' }, P.pixelButtons(links)) : null,
      cover ? el('figure', { class: 'detail-cover' }, [el('img', { src: cover, alt: 'Cover image of ' + pr.title })]) : null,
      pr.process ? section('Walkthrough', 'The process', prose(pr.process)) : null
    ].concat(projectSections(pr), [
      gallery.length ? section('Screenshots', 'Gallery', galleryGrid(gallery)) : null,
      pager(list, index, 'project.html?id=', 'quest')
    ]).filter(Boolean));
  }

  // ---------- Certificate page ----------
  function renderCertificate(data) {
    var list = P.certsOf(data);
    var index = list.map(function (x) { return x.id; }).indexOf(id);
    if (index < 0) return notFound('./#education', '< Back to certifications', 'Certificate');
    var c = list[index];
    var label = 'Certification ' + P.pad(index + 1);
    document.body.dataset.hud = 'Badge ' + P.pad(index + 1);
    setMeta(c.name, c.issuer ? c.name + ', ' + c.issuer : c.name);

    var rows = [];
    if (c.issuer) rows.push(['Issued by', c.issuer]);
    if (c.date) rows.push(['Date', c.date]);

    var file = safeUrl(c.file);
    var isPdf = /\.pdf($|[?#])/i.test(file);
    var links = [];
    if (safeUrl(c.url)) links.push([safeUrl(c.url), 'Verify credential']);
    if (isPdf) links.push([file, 'Open PDF']);

    // PDF → embedded viewer; image certificate (or its preview image) → large image;
    // nothing uploaded yet → the paper-certificate stand-in.
    var imageSrc = file && !isPdf ? file : safeUrl(c.thumb);
    var viewer;
    if (file && isPdf) {
      viewer = el('div', { class: 'cert-view' }, [el('iframe', { class: 'cert-pdf', src: file, title: c.name + ' (PDF)' })]);
    } else if (imageSrc) {
      var image = el('button', { type: 'button', class: 'gallery-item cert-image', 'aria-label': 'View ' + c.name + ' full size' }, [
        el('img', { src: imageSrc, alt: c.name + ' certificate' })
      ]);
      image.addEventListener('click', function () { openLightbox([{ src: imageSrc, alt: c.name + ' certificate', caption: c.name }], 0); });
      viewer = el('div', { class: 'cert-view' }, [image]);
    } else {
      viewer = el('div', { class: 'cert-solo' }, [P.certPaper(c)]);
    }

    root.replaceChildren.apply(root, [
      back('./#education', '< Back to certifications'),
      el('p', { class: 'level-tag pixel', text: label }),
      el('h1', { class: 'detail-title', text: c.name }),
      rows.length ? metaStrip(rows) : null,
      links.length ? el('div', { class: 'pixel-btns detail-links' }, P.pixelButtons(links)) : null,
      viewer,
      pager(list, index, 'certificate.html?id=', 'certificate')
    ].filter(Boolean));
  }

  P.loadContent()
    .then(function (data) {
      bindProfile(data.profile || {});
      if (page === 'certificate') renderCertificate(data);
      else renderProject(data);
      // Progress blocks under each part of the page, like the level bars on the home page.
      var parts = root.querySelectorAll('.detail-section');
      Array.prototype.forEach.call(parts, function (section, i) { P.placeLevelBar(section, i + 1, parts.length); });
      document.dispatchEvent(new CustomEvent('portfolio:rendered'));
    })
    .catch(function (err) {
      console.error('Could not load content:', err);
      root.replaceChildren(el('p', { class: 'detail-summary', text: 'Content could not be loaded. Please refresh the page.' }));
    })
    .finally(function () { document.body.classList.remove('is-loading'); });
})();
