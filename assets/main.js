/* =============================================================
   Technic Games — behaviour
     1) theme toggle (light / dark), persisted
     2) mobile nav toggle
     3) sticky-header state + back-to-top  (ONE rAF-throttled listener)
     4) in-page scrollspy
     5) scroll reveal
     6) renders window.GAMES into #games-list, with a screenshot
        carousel and a progressive lightbox
     7) structured data, generated from the same GAMES array

   No dependencies. Works from file:// and from a static server.
   Everything is progressive enhancement: with JS off, or without
   <dialog> / IntersectionObserver, the page still reads and works.

   Performance rules enforced here (see PERFORMANCE.md):
     - exactly one scroll listener, passive, rAF-throttled
     - carousel geometry is measured on resize, never per scroll event
     - no layout reads inside scroll handlers beyond scrollY/scrollLeft
   ============================================================= */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var scrollBehavior = function () {
    return reduceMotion.matches ? "auto" : "smooth";
  };

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
      if (kid) node.appendChild(kid);
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
  var ICON_CLOSE = ["M6 6l12 12", "M18 6L6 18"];
  var ICON_UP = ["M12 19V5", "M5 12l7-7 7 7"];
  var ICON_MOON = ["M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.6 6.6 0 0 0 9.7 9.7z"];
  var ICON_SUN = [
    "M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z",
    "M12 1.8v2.1", "M12 20.1v2.1", "M4.8 4.8l1.5 1.5", "M17.7 17.7l1.5 1.5",
    "M1.8 12h2.1", "M20.1 12h2.1", "M4.8 19.2l1.5-1.5", "M17.7 6.3l1.5-1.5"
  ];

  /* ---------- 1. Theme ----------
     <head> already resolved the theme before first paint (stored pref, else
     system) and stamped data-theme on <html>. This only handles switching. */
  (function theme() {
    var btn = document.querySelector(".theme-toggle");
    if (!btn) return;

    var KEY = "tg-theme";
    var META = { light: "#FCF9F4", dark: "#1A1320" };
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

  observeReveal(document); // must run before the #games-list guard below

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

  /* ---------- 6. Game cards ---------- */
  var mount = document.getElementById("games-list");
  if (!mount || !Array.isArray(window.GAMES)) return;

  /** Only ever emit http(s) links — never javascript:, data:, etc. */
  function safeUrl(value) {
    if (typeof value !== "string") return "";
    var url = value.trim();
    return /^https?:\/\//i.test(url) ? url : "";
  }

  var STORES = [
    { key: "ios", name: "App Store", badge: "assets/appstore.svg", alt: "Download on the App Store", w: 144, h: 48 },
    { key: "android", name: "Google Play", badge: "assets/googleplay.svg", alt: "Get it on Google Play", w: 161, h: 48 }
  ];

  // Intrinsic size of the thumbnails written by tools/optimize-assets.py.
  // Present so the browser reserves the box before the image lands (zero CLS).
  var THUMB_W = 440;
  var THUMB_H = 952;

  /** One platform, rendered independently of the other. */
  function storeSlot(store, rawUrl) {
    var url = safeUrl(rawUrl);

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

  /** Game logo. Decorative by default — the title is announced right after it. */
  function gameIcon(game) {
    if (!game.icon) return null;
    return el("img", {
      class: "game__icon",
      src: game.icon,
      alt: game.iconAlt || "",
      width: 192,
      height: 192,
      loading: "lazy",
      decoding: "async"
    });
  }

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

    if ("ResizeObserver" in window) new ResizeObserver(remeasure).observe(viewport);
    else window.addEventListener("resize", remeasure);

    requestAnimationFrame(remeasure);
    return wrap;
  }

  function card(game) {
    var isOut = Boolean(safeUrl(game.ios) || safeUrl(game.android));
    var titleId = "game-" + game.id + "-title";

    var head = el("header", { class: "game__head" }, [
      gameIcon(game),
      el("div", { class: "game__headings" }, [
        el("p", {
          class: "tag " + (isOut ? "tag--out" : "tag--soon"),
          text: isOut ? "Out now" : "Coming soon"
        }),
        el("h3", { class: "game__title", id: titleId, text: game.title }),
        el("p", { class: "game__one", text: game.oneLiner || "" })
      ])
    ]);

    var body = el("div", { class: "game__body" }, [
      el("p", { class: "game__desc", text: game.description || "" }),
      el("ul", { class: "features" }, (game.features || []).map(function (f) {
        return el("li", { text: f });
      })),
      el("div", { class: "stores" }, STORES.map(function (store) {
        return storeSlot(store, game[store.key]);
      }))
    ]);

    return el("article", {
      class: "game",
      id: "game-" + game.id,
      "aria-labelledby": titleId,
      "data-reveal": ""
    }, [el("div", { class: "game__text" }, [head, body]), screenshots(game)]);
  }

  var frag = document.createDocumentFragment();
  window.GAMES.forEach(function (game) { frag.appendChild(card(game)); });
  mount.appendChild(frag);

  observeReveal(mount);

  /* ---------- 7. Structured data, from the same source of truth ---------- */
  (function schema() {
    if (!/^https?:$/.test(location.protocol)) return; // file:// yields junk URLs
    var abs = function (p) { return new URL(p, location.href).href; };

    var games = window.GAMES.map(function (g) {
      var platforms = [];
      if (safeUrl(g.ios)) platforms.push("iOS");
      if (safeUrl(g.android)) platforms.push("Android");

      var node = {
        "@type": "VideoGame",
        name: g.title,
        description: g.description,
        applicationCategory: "GameApplication"
      };
      if (g.icon) node.image = abs(g.icon);
      if (platforms.length) node.operatingSystem = platforms.join(", ");
      var install = safeUrl(g.android) || safeUrl(g.ios);
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
