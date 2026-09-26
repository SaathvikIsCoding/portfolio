// Visitor survey pop-up: appears once, 45 seconds into a visit (counted across pages),
// asks for a name and two dropdown answers, and saves them to Supabase.
// Only runs when the owner has switched it on and connected Supabase in the admin (content.survey).
(function () {
  'use strict';

  var P = window.Portfolio;
  var el = P.el;
  var DELAY_MS = 45000;
  var DONE_KEY = 'portfolio-survey';        // localStorage: "sent" or "dismissed" → never show again
  var START_KEY = 'portfolio-survey-start'; // sessionStorage: when this visit started

  var PURPOSES = ['Hiring / recruiting', 'A project or collaboration', 'Networking', 'Just exploring', 'Fellow designer or student', 'Other'];
  var SOURCES = ['LinkedIn', 'ArtStation', 'GitHub', 'My resume or a job application', 'A friend or colleague', 'Google search', 'Other'];

  function lget(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lset(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function sget(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function sset(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } }

  if (lget(DONE_KEY)) return;

  // Only show the pop-up when it can actually save: a real Supabase URL and a public
  // (publishable or legacy anon) key — never something else pasted by mistake.
  var PUBLIC_KEY = /^(sb_publishable_[\w-]{10,}|eyJ[\w-]+\.[\w-]+\.[\w-]+)$/;
  function configured(s) {
    return s && s.enabled && /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(s.url || '') && PUBLIC_KEY.test(s.key || '');
  }

  function headers(key) {
    var h = { apikey: key, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
    if (/^eyJ/.test(key)) h.Authorization = 'Bearer ' + key; // legacy anon JWT keys
    return h;
  }

  function select(name, label, options) {
    var sel = el('select', { name: name, required: '' }, [el('option', { value: '', text: 'Choose one…' })]
      .concat(options.map(function (o) { return el('option', { value: o, text: o }); })));
    return el('label', { class: 'survey-field' }, [el('span', { class: 'survey-label', text: label }), sel]);
  }

  function open(settings) {
    var nameInput = el('input', { name: 'name', type: 'text', maxlength: '80', required: '', autocomplete: 'name', placeholder: 'Your name' });
    var status = el('p', { class: 'survey-status', role: 'status' });
    var send = el('button', { type: 'submit', class: 'pixel-btn pixel-btn-primary', text: 'Send' });
    var later = el('button', { type: 'button', class: 'pixel-btn pixel-btn-sm', text: 'Maybe later' });

    var form = el('form', { class: 'survey-form', novalidate: '' }, [
      el('label', { class: 'survey-field' }, [el('span', { class: 'survey-label', text: "What's your name?" }), nameInput]),
      select('purpose', 'What brings you here?', PURPOSES),
      select('source', 'How did you find me?', SOURCES),
      status,
      el('div', { class: 'pixel-btns survey-actions' }, [send, later])
    ]);

    var dialog = el('dialog', { class: 'survey', 'aria-labelledby': 'survey-title' }, [
      el('p', { class: 'level-tag pixel', text: 'Side quest' }),
      el('h2', { class: 'survey-title', id: 'survey-title', text: settings.greeting || "Hey, I'm Saathvik!" }),
      el('p', { class: 'survey-intro', text: 'A tiny 3-question survey so I know who stops by. Takes about 10 seconds.' }),
      form,
      el('p', { class: 'survey-note', text: 'Only I can see your answers.' })
    ]);
    document.body.appendChild(dialog);

    var sent = false;
    dialog.addEventListener('close', function () {
      if (!sent) lset(DONE_KEY, 'dismissed');
      setTimeout(function () { dialog.remove(); }, 0);
    });
    later.addEventListener('click', function () { dialog.close(); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = {
        name: nameInput.value.trim().slice(0, 80),
        purpose: form.elements.purpose.value,
        source: form.elements.source.value,
        page: (location.pathname + location.search).slice(0, 200)
      };
      if (!data.name || !data.purpose || !data.source) {
        status.textContent = 'Please fill in all three.';
        (!data.name ? nameInput : !data.purpose ? form.elements.purpose : form.elements.source).focus();
        return;
      }
      send.disabled = true;
      status.textContent = 'Sending…';
      fetch(settings.url.replace(/\/$/, '') + '/rest/v1/survey_responses', {
        method: 'POST', headers: headers(settings.key), body: JSON.stringify(data)
      }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        sent = true;
        lset(DONE_KEY, 'sent');
        form.replaceChildren(el('p', { class: 'survey-thanks', text: 'Thanks, ' + data.name + '! GG.' }));
        document.dispatchEvent(new CustomEvent('portfolio:unlock', { detail: 'survey' }));
        setTimeout(function () { if (dialog.open) dialog.close(); }, 2200);
      }).catch(function (err) {
        console.error('Survey not sent:', err);
        send.disabled = false;
        status.textContent = "Couldn't send that right now. Please try again in a moment.";
      });
    });

    dialog.showModal();
    nameInput.focus();
  }

  P.loadContent().then(function (data) {
    var settings = data.survey;
    if (!configured(settings)) return;
    var start = Number(sget(START_KEY)) || Date.now();
    sset(START_KEY, String(start));
    (function wait(ms) {
      setTimeout(function () {
        if (lget(DONE_KEY)) return;
        if (document.querySelector('dialog[open]')) return wait(5000); // e.g. the image viewer is open
        open(settings);
      }, ms);
    })(Math.max(0, DELAY_MS - (Date.now() - start)));
  }).catch(function () { /* no survey if content can't load */ });
})();
