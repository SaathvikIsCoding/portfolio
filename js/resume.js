(function () {
  'use strict';

  function safeUrl(url) {
    if (typeof url !== 'string') return '';
    url = url.trim();
    if (!url) return '';
    if (/^(https?:|mailto:|tel:)/i.test(url)) return url;
    if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return '';
    return url;
  }

  // Shown as plain text so ATS parsers read the address even from a printed PDF.
  function prettyUrl(url) {
    return url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false || v === '') return;
      if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return node;
  }

  function link(href, text) {
    return el('a', { href: href, text: text || prettyUrl(href) });
  }

  function bullets(text) {
    var lines = String(text || '').split('\n').map(function (l) { return l.replace(/^\s*[•\-*]\s*/, '').trim(); }).filter(Boolean);
    if (!lines.length) return null;
    if (lines.length === 1) return el('p', { text: lines[0] });
    return el('ul', null, lines.map(function (l) { return el('li', { text: l }); }));
  }

  function section(title, children) {
    children = children.filter(Boolean);
    if (!children.length) return [];
    return [el('h2', { text: title })].concat(children);
  }

  function join(parts, sep) {
    var out = [];
    parts.filter(Boolean).forEach(function (part, i) {
      if (i) out.push(sep);
      out.push(part);
    });
    return out;
  }

  function render(data) {
    var p = data.profile || {};
    var name = p.name || 'Your Name';
    document.title = name.replace(/\s+/g, '_') + '_Resume';
    var desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', 'Resume of ' + name + (p.role ? ', ' + p.role : ''));

    var portfolioUrl = /^https?:/.test(location.href) && !/localhost|127\.0\.0\.1/.test(location.hostname)
      ? location.href.replace(/resume\.html.*$/, '') : safeUrl(p.website);
    var socials = (data.socials || []).filter(function (s) { return s && safeUrl(s.url) && /^https?:/i.test(s.url); });

    var contact = join([
      p.location || null,
      p.email ? link('mailto:' + p.email, p.email) : null,
      p.phone ? link('tel:' + p.phone.replace(/[^\d+]/g, ''), p.phone) : null,
      portfolioUrl ? link(portfolioUrl) : null
    ].concat(socials.map(function (s) { return link(safeUrl(s.url)); })), ' | ');

    var summary = String(p.summary || p.about || p.tagline || '').split(/\n\s*\n/).map(function (t) { return t.trim(); }).filter(Boolean).join(' ');

    var skills = (data.skills || []).filter(Boolean);

    var experience = (data.experience || []).filter(function (x) { return x && (x.role || x.org); }).map(function (x) {
      return el('div', { class: 'entry' }, [
        el('div', { class: 'entry-head' }, [
          el('p', { class: 'entry-title', text: [x.role, x.org].filter(Boolean).join(', ') }),
          x.period ? el('span', { class: 'entry-date', text: x.period }) : null
        ]),
        x.location ? el('p', { class: 'entry-sub', text: x.location }) : null,
        bullets(x.description)
      ]);
    });

    var education = (data.education || []).filter(function (e) { return e && (e.degree || e.school); }).map(function (e) {
      return el('div', { class: 'entry' }, [
        el('div', { class: 'entry-head' }, [
          el('p', { class: 'entry-title', text: e.degree || e.school }),
          e.period ? el('span', { class: 'entry-date', text: e.period }) : null
        ]),
        e.degree && e.school ? el('p', { class: 'entry-sub', text: e.school }) : null
      ]);
    });

    var certs = (data.certifications || []).filter(function (c) { return c && c.name; });

    var projects = (data.projects || []).filter(function (pr) { return pr && pr.title; }).map(function (pr) {
      var url = safeUrl(pr.live) || safeUrl(pr.repo);
      var tech = (pr.tech || []).filter(Boolean);
      return el('div', { class: 'entry' }, [
        el('div', { class: 'entry-head' }, [
          el('p', { class: 'entry-title', text: pr.title }),
          url && /^https?:/i.test(url) ? el('span', { class: 'entry-date' }, [link(url)]) : null
        ]),
        pr.description ? el('p', { text: pr.description }) : null,
        tech.length ? el('p', { class: 'entry-sub', text: 'Tools: ' + tech.join(', ') }) : null
      ]);
    });

    var nodes = [
      el('h1', { text: name }),
      p.role ? el('p', { class: 'headline', text: p.role }) : null,
      contact.length ? el('p', { class: 'contact' }, contact) : null
    ]
      .concat(section('Summary', [summary ? el('p', { class: 'summary', text: summary }) : null]))
      .concat(section('Skills', [skills.length ? el('p', { class: 'skills', text: skills.join(', ') }) : null]))
      .concat(section('Experience', experience))
      .concat(section('Education', education))
      .concat(section('Certifications', [certs.length ? el('ul', null, certs.map(function (c) {
        return el('li', { text: c.name + (c.issuer ? ', ' + c.issuer : '') });
      })) : null]))
      .concat(section('Projects', projects));

    var page = document.getElementById('resume');
    page.replaceChildren.apply(page, nodes.filter(Boolean));
  }

  document.getElementById('download').addEventListener('click', function () { window.print(); });

  var load = window.RESUME_DATA
    ? Promise.resolve(window.RESUME_DATA)
    : fetch('content/content.json?v=' + Date.now(), { cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });

  load.then(render).catch(function (err) {
    console.error('Could not load resume:', err);
    document.getElementById('resume').replaceChildren(el('p', { text: 'The resume could not be loaded. Please refresh the page.' }));
  });
})();
