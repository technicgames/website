/* =============================================================
   Technic Games — behaviour
     1) theme toggle (light / dark), persisted
     2) mobile nav toggle
     3) sticky-header state + back-to-top  (ONE rAF-throttled listener)
     4) in-page scrollspy
     5) scroll reveal
     6) footer game links, launch bar and the "Just launched" card,
        all from window.GAMES
     7) featured launch: countdown, store slots, worlds strip, trailer
     8) hero parallax
     9) renders window.GAMES into #games-list: filterable cards, and a
        details sheet with a screenshot carousel and a progressive lightbox
    10) structured data, generated from the same GAMES array

   No dependencies. Works from file:// and from a static server.
   Everything is progressive enhancement: with JS off, or without
   <dialog> / IntersectionObserver, the page still reads and works.

   Performance rules enforced here (see PERFORMANCE.md):
     - exactly one window scroll listener, passive, rAF-throttled
     - carousel geometry is measured on resize, never per scroll event
     - no layout reads inside scroll handlers beyond scrollY/scrollLeft
     - the countdown and the worlds strip only run while on screen
   ============================================================= */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var scrollBehavior = function () {
    return reduceMotion.matches ? "auto" : "smooth";
  };
  var GAMES = Array.isArray(window.GAMES) ? window.GAMES : [];

  /** Build an element. `text` sets textContent — never innerHTML. */
  function el(tag, attrs, kids) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (attrs[key] == null || attrs[key] === false) return;
        if (key === "text") node.textContent = attrs[key];
        else node.setAttribute(key, attrs[key]);
      });
    }
    (kids || []).forEach(function (kid) {
      if (kid) node.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
    });
    return node;
  }

  /** Inline stroke icon from one or more path definitions. */
  function icon(paths) {
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2.2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    paths.forEach(function (d) {
      var p = document.createElementNS(NS, "path");
      p.setAttribute("d", d);
      svg.appendChild(p);
    });
    return svg;
  }

  var ICON_PREV = ["M15 5l-7 7 7 7"];
  var ICON_NEXT = ["M9 5l7 7-7 7"];
  var ICON_ARROW = ["M5 12h14", "M13 6l6 6-6 6"];
  var ICON_CLOSE = ["M6 6l12 12", "M18 6L6 18"];
  var ICON_UP = ["M12 19V5", "M5 12l7-7 7 7"];
  var ICON_MOON = ["M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.6 6.6 0 0 0 9.7 9.7z"];
  var ICON_SUN = [
    "M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z",
    "M12 1.8v2.1", "M12 20.1v2.1", "M4.8 4.8l1.5 1.5", "M17.7 17.7l1.5 1.5",
    "M1.8 12h2.1", "M20.1 12h2.1", "M4.8 19.2l1.5-1.5", "M17.7 6.3l1.5-1.5"
  ];

  /* ---------- Game data helpers (shared by every section below) ---------- */

  /** Only ever emit http(s) links — never javascript:, data:, etc. */
  function safeUrl(value) {
    if (typeof value !== "string") return "";
    var url = value.trim();
    return /^https?:\/\//i.test(url) ? url : "";
  }

  var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];

  /** Local midnight of a "YYYY-MM-DD" string, or 0. */
  function dayStart(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
    return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : 0;
  }
  /** Local midnight of `releaseDate`, or 0 when the game has none. */
  function launchAt(game) { return dayStart(game.releaseDate); }
  function isReleased(game) { return Date.now() >= launchAt(game); }
  function longDate(game) {
    var d = new Date(launchAt(game));
    return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear();
  }
  function shortDate(game) {
    var d = new Date(launchAt(game));
    return d.getDate() + " " + MONTHS[d.getMonth()].slice(0, 3);
  }

  /** A store link counts only once the game's release date has passed. */
  function storeUrl(game, key) { return isReleased(game) ? safeUrl(game[key]) : ""; }

  function status(game) {
    if (storeUrl(game, "ios") || storeUrl(game, "android")) return { key: "out", cls: "tag--out", text: "Out now" };
    if (launchAt(game) && !isReleased(game)) return { key: "soon", cls: "tag--date", text: "Arrives " + shortDate(game) };
    return { key: "soon", cls: "tag--soon", text: "Coming soon" };
  }

  function byId(id) {
    for (var i = 0; i < GAMES.length; i++) if (GAMES[i].id === id) return GAMES[i];
    return null;
  }

  /* "Just launched": a live game, for 30 days from launchedOn (or releaseDate). */
  var NEW_FOR = 30 * 864e5;
  function liveSince(game) { return dayStart(game.launchedOn) || launchAt(game); }
  function isNew(game) {
    var t = liveSince(game);
    return Boolean(t) && status(game).key === "out" && Date.now() < t + NEW_FOR;
  }

  /** The newest just-launched game, skipping the one the featured banner
      already shows (it announces its own launch). */
  function justLaunched() {
    var box = document.querySelector("[data-featured]");
    var featured = box ? box.getAttribute("data-featured") : "";
    return GAMES.filter(function (g) { return isNew(g) && g.id !== featured; })
      .sort(function (a, b) { return liveSince(b) - liveSince(a); })[0] || null;
  }

  /** The next game with a release date still ahead. */
  function nextUp() {
    return GAMES.filter(function (g) { return launchAt(g) && !isReleased(g); })
      .sort(function (a, b) { return launchAt(a) - launchAt(b); })[0] || null;
  }

  function shortTitle(game) { return game.title.split(":")[0]; }

  var STORES = [
    { key: "ios", name: "App Store", badge: "assets/appstore.svg", alt: "Download on the App Store", w: 144, h: 48 },
    { key: "android", name: "Google Play", badge: "assets/googleplay.svg", alt: "Get it on Google Play", w: 161, h: 48 }
  ];

  /** One platform, rendered independently of the other. */
  function storeSlot(store, game) {
    var url = storeUrl(game, store.key);

    if (!url) {
      // Non-interactive, badge-shaped. Reads as "Coming soon, App Store".
      return el("span", { class: "chip" }, [
        el("span", { class: "chip__dot", "aria-hidden": "true" }),
        el("span", { class: "chip__text" }, [
          el("span", { class: "chip__kicker", text: "Coming soon" }),
          el("span", { class: "chip__name", text: store.name })
        ])
      ]);
    }

    return el("a", { class: "badge", href: url, target: "_blank", rel: "noopener" }, [
      el("img", {
        src: store.badge,
        alt: store.alt,
        width: store.w,
        height: store.h,
        loading: "lazy",
        decoding: "async"
      })
    ]);
  }

  function stores(game) {
    return el("div", { class: "stores" }, STORES.map(function (s) { return storeSlot(s, game); }));
  }

  /* ---------- 1. Theme ----------
     <head> already resolved the theme before first paint (stored pref, else
     system) and stamped data-theme on <html>. This only handles switching. */
  (function theme() {
    var btn = document.querySelector(".theme-toggle");
    if (!btn) return;

    var KEY = "tg-theme";
    var META = { light: "#FCF9F4", dark: "#120D16" };
    var root = document.documentElement;
    var meta = document.querySelector('meta[name="theme-color"]');
    var system = window.matchMedia("(prefers-color-scheme: dark)");

    function current() {
      return root.getAttribute("data-theme") === "dark" ? "dark" : "light";
    }

    function apply(mode) {
      root.setAttribute("data-theme", mode);
      if (meta) meta.setAttribute("content", META[mode]);

      var next = mode === "dark" ? "light" : "dark";
      btn.setAttribute("aria-label", "Switch to " + next + " theme");
      btn.setAttribute("title", "Switch to " + next + " theme");
      btn.replaceChildren(icon(mode === "dark" ? ICON_SUN : ICON_MOON));
    }

    apply(current());

    btn.addEventListener("click", function () {
      var next = current() === "dark" ? "light" : "dark";
      try { localStorage.setItem(KEY, next); } catch (e) { /* private mode */ }
      apply(next);
    });

    // Follow the OS only while the visitor hasn't chosen explicitly.
    var onSystem = function (e) {
      var stored = null;
      try { stored = localStorage.getItem(KEY); } catch (err) { /* ignore */ }
      if (stored !== "light" && stored !== "dark") apply(e.matches ? "dark" : "light");
    };
    if (system.addEventListener) system.addEventListener("change", onSystem);
    else if (system.addListener) system.addListener(onSystem);
  })();

  /* ---------- 2. Mobile nav ---------- */
  (function nav() {
    var toggle = document.querySelector(".nav-toggle");
    var menu = document.getElementById("site-nav");
    if (!toggle || !menu) return;

    function setOpen(open) {
      menu.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
    }

    toggle.addEventListener("click", function () {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });

    menu.addEventListener("click", function (e) {
      if (e.target.closest("a")) setOpen(false);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && menu.classList.contains("is-open")) {
        setOpen(false);
        toggle.focus();
      }
    });
  })();

  /* ---------- 3. Header state + back-to-top ----------
     One passive, rAF-throttled listener drives both. Reads scrollY only. */
  (function scrollUi() {
    var bar = document.querySelector(".site-header");
    var top = document.querySelector(".to-top");
    if (top) top.appendChild(icon(ICON_UP));

    var ticking = false;
    var wasScrolled = null;
    var wasFar = null;

    function frame() {
      ticking = false;
      var y = window.scrollY;

      var scrolled = y > 8;
      if (bar && scrolled !== wasScrolled) {
        bar.classList.toggle("is-scrolled", scrolled);
        wasScrolled = scrolled;
      }

      var far = y >= 700;
      if (top && far !== wasFar) {
        top.hidden = !far;
        wasFar = far;
      }
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(frame);
    }

    frame();
    window.addEventListener("scroll", onScroll, { passive: true });

    if (top) {
      top.addEventListener("click", function () {
        window.scrollTo({ top: 0, behavior: scrollBehavior() });
        var skip = document.querySelector(".skip-link");
        if (skip) skip.focus({ preventScroll: true });
      });
    }
  })();

  /* ---------- 4. Scrollspy ---------- */
  (function spy() {
    if (!("IntersectionObserver" in window)) return;

    var links = {};
    document.querySelectorAll('.nav a[href*="#"]').forEach(function (a) {
      var id = a.getAttribute("href").split("#")[1];
      if (id) links[id] = a;
    });

    var targets = Object.keys(links)
      .map(function (id) { return document.getElementById(id); })
      .filter(Boolean);
    if (!targets.length) return;

    var visible = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        visible[entry.target.id] = entry.isIntersecting ? entry.intersectionRatio : 0;
      });

      var best = null;
      Object.keys(visible).forEach(function (id) {
        if (visible[id] > 0 && (!best || visible[id] > visible[best])) best = id;
      });

      Object.keys(links).forEach(function (id) {
        // Leave the "current page" marker on subpages alone.
        if (links[id].getAttribute("aria-current") === "page") return;
        if (id === best) links[id].setAttribute("aria-current", "location");
        else links[id].removeAttribute("aria-current");
      });
    }, { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.25, 0.5, 1] });

    targets.forEach(function (t) { io.observe(t); });
  })();

  /* ---------- 5. Scroll reveal ----------
     One observer, reused: static sections register now, JS-rendered game
     cards register after they mount. */
  var observeReveal = (function () {
    if (!("IntersectionObserver" in window) || reduceMotion.matches) {
      return function () {}; // no-op: content stays visible, never hidden
    }
    document.documentElement.classList.add("has-reveal");

    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        obs.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });

    return function (root) {
      (root || document).querySelectorAll("[data-reveal]").forEach(function (node) {
        io.observe(node);
      });
    };
  })();

  observeReveal(document);

  /** Run `fn(true/false)` as `node` enters / leaves the viewport. */
  function whileVisible(node, fn) {
    if (!("IntersectionObserver" in window)) { fn(true); return; }
    new IntersectionObserver(function (entries) {
      fn(entries[entries.length - 1].isIntersecting);
    }).observe(node);
  }

  /* ---------- 6. Footer game links + launch bar (every page) ---------- */
  (function footerGames() {
    var list = document.getElementById("footer-games");
    if (!list) return;
    GAMES.forEach(function (g) {
      list.appendChild(el("li", null, [
        el("a", { href: "index.html#game-" + g.id, text: g.title.split(":")[0] })
      ]));
    });
  })();

  /* Up to two items: what just launched, then what launches next. Narrow
     screens show only the first (CSS), so the bar stays one or two lines. */
  (function announce() {
    var bar = document.getElementById("announce");
    if (!bar) return;
    var items = [];

    var fresh = justLaunched();
    if (fresh) {
      items.push(el("span", { class: "announce__item" }, [
        "New: ", el("strong", { text: shortTitle(fresh) }), " is out now · ",
        el("a", { href: document.getElementById("just-launched") ? "#just-launched" : "#game-" + fresh.id, text: "Get it now" })
      ]));
    }

    // Upcoming, or launched within the month (the featured banner's game).
    var soon = nextUp() || GAMES.filter(function (g) { return launchAt(g) && isNew(g); })[0];
    if (soon) {
      var out = isReleased(soon);
      var anchor = document.getElementById(soon.id) ? soon.id : "game-" + soon.id;
      items.push(el("span", { class: "announce__item" }, [
        out ? "New: " : (fresh ? "" : "New game: "), el("strong", { text: shortTitle(soon) }),
        out ? " is out now · " : " launches " + longDate(soon) + " · ",
        el("a", { href: "#" + anchor, text: out ? "Get it now" : "See what's coming" })
      ]));
    }
    if (!items.length) return;

    var kids = [el("span", { class: "announce__dot", "aria-hidden": "true" })];
    items.forEach(function (item, i) {
      if (i) kids.push(el("span", { class: "announce__sep", "aria-hidden": "true" }));
      kids.push(item);
    });
    bar.replaceChildren.apply(bar, kids);
    bar.hidden = false;
  })();

  /* Small status texts in the hand-curated hero, kept true by the data. */
  (function heroStatus() {
    document.querySelectorAll("[data-status-of]").forEach(function (n) {
      var g = byId(n.getAttribute("data-status-of"));
      if (!g) return;
      var s = status(g);
      n.textContent = s.text;
      n.classList.toggle("is-live", s.key === "out");
    });
    var count = document.querySelector("[data-game-count]");
    if (count && GAMES.length) count.textContent = String(GAMES.length);
  })();

  /* ---------- 7. Featured launch ---------- */
  (function featured() {
    var box = document.querySelector("[data-featured]");
    var game = box && byId(box.getAttribute("data-featured"));
    if (!game) return;

    var eyebrow = box.querySelector("[data-eyebrow]");
    var count = box.querySelector("[data-countdown]");
    var storeBox = box.querySelector("[data-stores]");
    var cells = {};
    box.querySelectorAll("[data-cd]").forEach(function (n) { cells[n.getAttribute("data-cd")] = n; });

    function paintState() {
      var out = isReleased(game);
      if (eyebrow) eyebrow.textContent = out ? "New game · Out now" : "New game · Coming soon";
      if (count) count.hidden = out;
      if (storeBox) {
        var fresh = stores(game);
        storeBox.replaceWith(fresh);
        storeBox = fresh;
      }
      return out;
    }

    if (paintState() || !count) return;

    var timer = 0;
    var last = {};
    function pad(n) { return n < 10 ? "0" + n : String(n); }
    function tick() {
      var s = Math.max(0, Math.floor((launchAt(game) - Date.now()) / 1000));
      var next = { d: String(Math.floor(s / 86400)), h: pad(Math.floor(s / 3600) % 24), m: pad(Math.floor(s / 60) % 60), s: pad(s % 60) };
      Object.keys(next).forEach(function (k) {
        if (cells[k] && last[k] !== next[k]) cells[k].textContent = next[k];   // write only on change
      });
      last = next;
      if (s === 0) { clearInterval(timer); timer = 0; paintState(); }
    }
    tick();
    // Only tick while the banner is on screen.
    whileVisible(box, function (on) {
      if (on && !timer && !isReleased(game)) { tick(); timer = setInterval(tick, 1000); }
      if (!on && timer) { clearInterval(timer); timer = 0; }
    });
  })();

  (function worlds() {
    var strip = document.querySelector("[data-marquee]");
    if (!strip || reduceMotion.matches) return;   // stays a plain swipeable row
    var track = strip.querySelector(".marquee__track");
    var toggle = document.querySelector("[data-marquee-toggle]");

    // A second copy makes the loop seamless; it is hidden from assistive tech.
    Array.prototype.slice.call(track.children).forEach(function (li) {
      var copy = li.cloneNode(true);
      copy.setAttribute("aria-hidden", "true");
      track.appendChild(copy);
    });
    strip.classList.add("is-marquee");

    var userPaused = false;
    var offscreen = false;
    function sync() { strip.classList.toggle("is-paused", userPaused || offscreen); }

    // Moving content needs a way to stop it (WCAG 2.2.2).
    if (toggle) {
      toggle.hidden = false;
      toggle.addEventListener("click", function () {
        userPaused = !userPaused;
        toggle.setAttribute("aria-pressed", String(userPaused));
        toggle.textContent = userPaused ? "Play" : "Pause";
        sync();
      });
    }
    whileVisible(strip, function (on) { offscreen = !on; sync(); });
  })();

  (function trailer() {
    var dlg = document.getElementById("trailer");
    if (!dlg || typeof dlg.showModal !== "function") return;   // links fall back to the MP4
    var video = dlg.querySelector("video");
    var close = dlg.querySelector(".vmodal__close");
    close.appendChild(icon(ICON_CLOSE));

    document.querySelectorAll("[data-trailer]").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        dlg.showModal();
        var p = video.play();   // inside the click, so it counts as a user gesture
        if (p && p.catch) p.catch(function () { /* autoplay refused: controls remain */ });
      });
    });
    close.addEventListener("click", function () { dlg.close(); });
    dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener("close", function () { video.pause(); });
  })();

  /* ---------- 8. Hero parallax ----------
     Pointer only, never touch, never with Reduce Motion. The stage rect is
     cached on enter/resize, so pointermove does no layout reads. */
  (function parallax() {
    var hero = document.querySelector(".hero");
    var stage = hero && hero.querySelector(".stage");
    if (!stage || reduceMotion.matches || !window.matchMedia("(pointer: fine)").matches) return;

    var phones = stage.querySelectorAll("[data-depth]");
    var rect = null;
    var raf = 0;
    var px = 0;
    var py = 0;

    function measure() { rect = stage.getBoundingClientRect(); }
    function paint() {
      raf = 0;
      phones.forEach(function (p) {
        var d = +p.getAttribute("data-depth");
        p.style.transform = "translate(" + (px * d).toFixed(1) + "px, " + (py * d).toFixed(1) + "px) var(--tilt)";
      });
    }

    hero.addEventListener("pointerenter", measure);
    window.addEventListener("resize", function () { rect = null; });
    hero.addEventListener("pointermove", function (e) {
      if (!rect) measure();
      px = (e.clientX - rect.left) / rect.width - 0.5;
      py = (e.clientY - rect.top) / rect.height - 0.5;
      if (!raf) raf = requestAnimationFrame(paint);
    });
    hero.addEventListener("pointerleave", function () {
      phones.forEach(function (p) { p.style.transform = ""; });
    });
  })();

  /* ---------- Lightbox ---------- */
  var lightbox = (function () {
    var dlg = document.getElementById("lightbox");
    var supported = dlg && typeof dlg.showModal === "function";
    if (!supported) return null;

    var imgEl = dlg.querySelector(".lightbox__img");
    var capEl = dlg.querySelector(".lightbox__cap");
    var countEl = dlg.querySelector(".lightbox__count");
    var closeEl = dlg.querySelector(".lightbox__close");
    var navEls = dlg.querySelectorAll(".lightbox__nav");

    closeEl.appendChild(icon(ICON_CLOSE));
    navEls[0].appendChild(icon(ICON_PREV));
    navEls[1].appendChild(icon(ICON_NEXT));

    var shots = [];
    var index = 0;
    var opener = null;
    var token = 0; // guards against a stale full-res image landing late

    function paint() {
      var shot = shots[index];
      var thumb = shot.thumb || shot.src;
      var full = shot.full || thumb;
      var mine = ++token;

      // Show the already-cached thumbnail instantly, then upgrade.
      imgEl.src = thumb;
      imgEl.alt = shot.alt || "";
      capEl.textContent = shot.alt || "";
      countEl.textContent = index + 1 + " / " + shots.length;

      if (full !== thumb) {
        var pre = new Image();
        pre.decoding = "async";
        pre.onload = function () { if (mine === token) imgEl.src = full; };
        pre.src = full;
      }

      navEls[0].disabled = shots.length < 2;
      navEls[1].disabled = shots.length < 2;
    }

    function step(dir) {
      if (shots.length < 2) return;
      index = (index + dir + shots.length) % shots.length;
      paint();
    }

    closeEl.addEventListener("click", function () { dlg.close(); });
    navEls.forEach(function (b) {
      b.addEventListener("click", function () { step(Number(b.dataset.dir)); });
    });

    dlg.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
      if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    });

    // Click outside the image column closes.
    dlg.addEventListener("click", function (e) {
      if (e.target === dlg) dlg.close();
    });

    dlg.addEventListener("close", function () {
      token++;
      if (opener && document.contains(opener)) opener.focus();
      imgEl.removeAttribute("src");
    });

    return function open(list, startIndex, fromEl) {
      shots = list;
      index = startIndex;
      opener = fromEl || null;
      paint();
      dlg.showModal();
      closeEl.focus();
    };
  })();

  /* ---------- 9. Game cards ---------- */
  var mount = document.getElementById("games-list");
  if (!mount || !GAMES.length) return;

  // Intrinsic size of the thumbnails written by tools/optimize-assets.py.
  // Present so the browser reserves the box before the image lands (zero CLS).
  var THUMB_W = 440;
  var THUMB_H = 952;

  /** Game logo. Decorative by default — the title is announced right after it. */
  function gameIcon(game) {
    if (!game.icon) return null;
    return el("img", {
      class: "gcard__icon",
      src: game.icon,
      alt: game.iconAlt || "",
      width: 192,
      height: 192,
      loading: "lazy",
      decoding: "async"
    });
  }

  function pill(game) {
    var s = status(game);
    return el("span", { class: "tag " + s.cls, text: s.text });
  }

  /** The screenshot carousel. Returns the node plus a cleanup for its observer. */
  function screenshots(game) {
    var shots = game.screenshots || [];
    if (!shots.length) return null;

    var items = shots.map(function (shot, i) {
      var img = el("img", {
        src: shot.thumb || shot.src,
        // Inside a button the alt would double up with the button's label.
        alt: lightbox ? "" : (shot.alt || ""),
        width: THUMB_W,
        height: THUMB_H,
        loading: "lazy",
        decoding: "async"
      });

      if (!lightbox) return el("li", null, [img]);

      var btn = el("button", {
        type: "button",
        class: "shot",
        "aria-label": "View larger: " + (shot.alt || "screenshot " + (i + 1))
      }, [img]);

      btn.addEventListener("click", function () { lightbox(shots, i, btn); });
      return el("li", null, [btn]);
    });

    var list = el("ul", { class: "shots__list" }, items);
    var viewport = el("div", {
      class: "shots__viewport",
      role: "group",
      "aria-label": "Screenshots of " + game.title
    }, [list]);

    var prev = el("button", { type: "button", class: "shots__nav", "data-dir": "-1", "aria-label": "Previous screenshot" }, [icon(ICON_PREV)]);
    var next = el("button", { type: "button", class: "shots__nav", "data-dir": "1", "aria-label": "Next screenshot" }, [icon(ICON_NEXT)]);

    var dots = el("ul", { class: "shots__dots" }, shots.map(function (_, i) {
      var b = el("button", { type: "button", "aria-label": "Go to screenshot " + (i + 1) });
      b.addEventListener("click", function () { scrollToIndex(i); });
      return el("li", null, [b]);
    }));

    var controls = el("div", { class: "shots__controls" }, [prev, dots, next]);
    controls.hidden = true;

    var wrap = el("div", { class: "shots" }, [viewport, controls]);

    /* Geometry is measured here and cached. Scroll handlers read scrollLeft
       and nothing else — measuring per scroll event would force a reflow on
       every frame of a touch drag. */
    var snaps = [];
    var maxScroll = 0;

    function measure() {
      maxScroll = viewport.scrollWidth - viewport.clientWidth;
      snaps = [];
      for (var i = 0; i < list.children.length; i++) {
        var li = list.children[i];
        /* Snap offset for a CENTRED item, clamped to the scrollable range.
           Do NOT derive this by dividing scrollLeft by a fixed item width:
           the last item can never scroll a full step, so it would be
           unreachable and its dot would never activate. */
        var raw = li.offsetLeft - list.offsetLeft + li.offsetWidth / 2 - viewport.clientWidth / 2;
        snaps.push(Math.max(0, Math.min(raw, maxScroll)));
      }
    }

    function currentIndex() {
      var best = 0;
      var bestDist = Infinity;
      for (var i = 0; i < snaps.length; i++) {
        var dist = Math.abs(snaps[i] - viewport.scrollLeft);
        if (dist < bestDist) { bestDist = dist; best = i; }
      }
      return best;
    }

    function scrollToIndex(i) {
      viewport.scrollTo({ left: snaps[i], behavior: scrollBehavior() });
    }

    function sync() {
      var overflows = maxScroll > 2;
      controls.hidden = !overflows;
      if (!overflows) return;

      var i = currentIndex();
      prev.disabled = viewport.scrollLeft <= 1;
      next.disabled = viewport.scrollLeft >= maxScroll - 1;

      Array.prototype.forEach.call(dots.children, function (li, n) {
        if (n === i) li.firstChild.setAttribute("aria-current", "true");
        else li.firstChild.removeAttribute("aria-current");
      });
    }

    function remeasure() { measure(); sync(); }

    prev.addEventListener("click", function () { scrollToIndex(Math.max(0, currentIndex() - 1)); });
    next.addEventListener("click", function () { scrollToIndex(Math.min(shots.length - 1, currentIndex() + 1)); });

    var t = 0;
    viewport.addEventListener("scroll", function () {
      clearTimeout(t);
      t = setTimeout(sync, 60);
    }, { passive: true });

    var ro = null;
    if ("ResizeObserver" in window) { ro = new ResizeObserver(remeasure); ro.observe(viewport); }
    else window.addEventListener("resize", remeasure);

    requestAnimationFrame(remeasure);
    return {
      node: wrap,
      destroy: function () { if (ro) ro.disconnect(); else window.removeEventListener("resize", remeasure); }
    };
  }

  /* The details sheet: one <dialog>, refilled per game. Thumbnails inside it
     only download when it opens. */
  var sheet = (function () {
    var dlg = document.getElementById("game-sheet");
    if (!dlg || typeof dlg.showModal !== "function") return null;
    var opener = null;
    var carousel = null;

    dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener("close", function () {
      if (carousel) carousel.destroy();
      carousel = null;
      dlg.replaceChildren();
      if (opener && document.contains(opener)) opener.focus();
    });

    return function open(game, fromEl) {
      opener = fromEl;
      carousel = screenshots(game);
      var close = el("button", { type: "button", class: "icon-btn sheet__close", "aria-label": "Close" }, [icon(ICON_CLOSE)]);
      close.addEventListener("click", function () { dlg.close(); });

      dlg.style.setProperty("--c", game.color || "");
      dlg.setAttribute("aria-labelledby", "sheet-title");
      dlg.replaceChildren(close, el("div", { class: "sheet__in" }, [
        el("div", null, [
          el("div", { class: "sheet__head" }, [
            gameIcon(game),
            el("div", null, [
              pill(game),
              el("h3", { id: "sheet-title", text: game.title }),
              el("p", { class: "game__one", text: game.oneLiner || "" })
            ])
          ]),
          el("p", { class: "sheet__desc", text: game.description || "" }),
          el("ul", { class: "features" }, (game.features || []).map(function (f) {
            return el("li", { text: f });
          })),
          stores(game)
        ]),
        carousel && carousel.node
      ]));
      dlg.showModal();
      close.focus();
    };
  })();

  function card(game) {
    var s = status(game);
    var titleId = "game-" + game.id + "-title";
    var shots = game.screenshots || [];
    var hero = shots[(game.cardShot || 1) - 1] || shots[0];

    var actions = el("div", { class: "gcard__actions" });
    if (s.key === "out") actions.appendChild(stores(game));
    if (sheet) {
      var more = el("button", { type: "button", class: "more", "aria-haspopup": "dialog" }, [
        "Details",
        el("span", { class: "sr-only", text: " about " + game.title }),
        icon(ICON_ARROW)
      ]);
      more.addEventListener("click", function () { sheet(game, more); });
      actions.appendChild(more);
    }

    var text = el("div", { class: "gcard__text" }, [
      el("div", { class: "gcard__top" }, [
        gameIcon(game), pill(game),
        isNew(game) ? el("span", { class: "tag tag--new", text: "New" }) : null
      ]),
      el("h3", { id: titleId, text: game.title }),
      el("p", { class: "game__one", text: game.oneLiner || "" }),
      (game.tags || []).length ? el("ul", { class: "gcard__tags" }, game.tags.map(function (t) {
        return el("li", { text: t });
      })) : null,
      // No <dialog>: show the details in the card instead of hiding them.
      sheet ? null : el("p", { class: "sheet__desc", text: game.description || "" }),
      actions
    ]);

    var node = el("article", {
      class: "gcard",
      id: "game-" + game.id,
      "aria-labelledby": titleId,
      "data-status": s.key,
      "data-reveal": ""
    }, [
      text,
      hero ? el("div", { class: "gcard__phone", "aria-hidden": "true" }, [
        el("img", { src: hero.thumb || hero.src, alt: "", width: THUMB_W, height: THUMB_H, loading: "lazy", decoding: "async" })
      ]) : null
    ]);
    if (game.color) node.style.setProperty("--c", game.color);
    return node;
  }

  var frag = document.createDocumentFragment();
  GAMES.forEach(function (game) { frag.appendChild(card(game)); });
  mount.appendChild(frag);
  observeReveal(mount);

  /* "Just launched" card: shown for 30 days after a game goes live, then the
     section simply stays hidden. Text is the game's own data, nothing new. */
  (function spotlight() {
    var section = document.getElementById("just-launched");
    var box = section && section.querySelector(".spotlight");
    var game = justLaunched();
    if (!box || !game) return;

    var shots = (game.screenshots || []).slice(0, 2);
    var desc = /^.*?[.!?](\s|$)/.exec(game.description || "");
    var actions = el("div", { class: "spotlight__actions" }, [stores(game)]);
    if (sheet) {
      var more = el("button", { type: "button", class: "more", "aria-haspopup": "dialog" }, [
        "Details", el("span", { class: "sr-only", text: " about " + game.title }), icon(ICON_ARROW)
      ]);
      more.addEventListener("click", function () { sheet(game, more); });
      actions.appendChild(more);
    }

    if (game.color) box.style.setProperty("--c", game.color);
    box.replaceChildren(
      el("div", { class: "spotlight__text" }, [
        el("span", { class: "tag tag--out", text: "Just launched" }),
        el("div", { class: "spotlight__head" }, [
          gameIcon(game),
          el("div", null, [
            el("h2", { id: "spotlight-title", text: shortTitle(game) + " is out now" }),
            el("p", { class: "game__one", text: game.oneLiner || "" })
          ])
        ]),
        desc ? el("p", { class: "spotlight__desc", text: desc[0].trim() }) : null,
        (game.tags || []).length ? el("ul", { class: "gcard__tags" }, game.tags.map(function (t) {
          return el("li", { text: t });
        })) : null,
        actions
      ]),
      el("div", { class: "spotlight__art", "aria-hidden": "true" }, shots.map(function (shot) {
        return el("div", { class: "spotlight__phone" }, [
          el("img", { src: shot.thumb || shot.src, alt: "", width: THUMB_W, height: THUMB_H, loading: "lazy", decoding: "async" })
        ]);
      }))
    );
    section.hidden = false;
  })();

  /* Filter chips: counts derived from the data, so they can't go stale. */
  (function filters() {
    var box = document.getElementById("game-filters");
    var live = document.getElementById("games-live");
    if (!box) return;
    var cards = mount.querySelectorAll(".gcard");
    var counts = { all: cards.length, out: 0, soon: 0 };
    cards.forEach(function (c) { counts[c.getAttribute("data-status")]++; });
    if (!counts.out || !counts.soon) return;   // one bucket only: nothing to filter

    [["all", "All"], ["out", "Out now"], ["soon", "Coming soon"]].forEach(function (f) {
      var b = el("button", { type: "button", "aria-pressed": String(f[0] === "all") }, [
        f[1], el("span", { text: String(counts[f[0]]) })
      ]);
      b.addEventListener("click", function () {
        box.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        cards.forEach(function (c) {
          c.hidden = !(f[0] === "all" || c.getAttribute("data-status") === f[0]);
          c.classList.add("is-in");   // never leave a filtered-in card unrevealed
        });
        if (live) live.textContent = "Showing " + counts[f[0]] + " game" + (counts[f[0]] === 1 ? "" : "s");
      });
      box.appendChild(b);
    });
    box.hidden = false;
  })();

  /* ---------- 10. Structured data, from the same source of truth ---------- */
  (function schema() {
    if (!/^https?:$/.test(location.protocol)) return; // file:// yields junk URLs
    var abs = function (p) { return new URL(p, location.href).href; };

    var games = GAMES.map(function (g) {
      var platforms = [];
      if (storeUrl(g, "ios")) platforms.push("iOS");
      if (storeUrl(g, "android")) platforms.push("Android");

      var node = {
        "@type": "VideoGame",
        name: g.title,
        description: g.description,
        applicationCategory: "GameApplication"
      };
      if (g.icon) node.image = abs(g.icon);
      if (platforms.length) node.operatingSystem = platforms.join(", ");
      var install = storeUrl(g, "android") || storeUrl(g, "ios");
      if (install) node.installUrl = install;
      return node;
    });

    var data = {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Technic Games",
      url: abs("index.html").replace(/index\.html$/, ""),
      logo: abs("assets/logo.svg"),
      email: "support@technicgames.com",
      sameAs: [
        "https://youtube.com/@playtechnicgames",
        "https://instagram.com/playtechnicgames"
      ],
      makesOffer: games.map(function (g) {
        return { "@type": "Offer", itemOffered: g };
      })
    };

    var tag = document.createElement("script");
    tag.type = "application/ld+json";
    tag.textContent = JSON.stringify(data);
    document.head.appendChild(tag);
  })();
})();
