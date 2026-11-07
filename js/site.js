// Shared behaviour: sticky header border, mobile menu, reveal on scroll, before/after slider.
(function () {
  const header = document.querySelector(".site-header");
  if (header) {
    const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const toggle = header.querySelector(".menu-toggle");
    if (toggle) {
      toggle.addEventListener("click", () => {
        const open = header.classList.toggle("open");
        toggle.setAttribute("aria-expanded", String(open));
      });
      header.querySelectorAll(".nav a").forEach((a) =>
        a.addEventListener("click", () => {
          header.classList.remove("open");
          toggle.setAttribute("aria-expanded", "false");
        })
      );
    }
  }

  const items = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && items.length) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    items.forEach((el) => io.observe(el));
  } else {
    items.forEach((el) => el.classList.add("in"));
  }

  document.querySelectorAll(".compare").forEach((box) => {
    const input = box.querySelector("input[type=range]");
    if (!input) return;
    const set = () => box.style.setProperty("--pos", input.value + "%");
    input.addEventListener("input", set);
    set();
  });

  // Green-to-mist sections: the green ends right under the heading, whatever its height.
  const mists = document.querySelectorAll(".mist");
  function sizeMist() {
    mists.forEach((m) => {
      const head = [...m.querySelectorAll("[data-mist-head]")].find((h) => h.offsetHeight > 0);
      if (!head) return;
      const bottom = head.getBoundingClientRect().bottom - m.getBoundingClientRect().top;
      m.style.setProperty("--m", Math.round(bottom + 28) + "px");
    });
  }
  if (mists.length) {
    sizeMist();
    window.addEventListener("resize", sizeMist);
    document.addEventListener("langchange", () => requestAnimationFrame(sizeMist));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(sizeMist);
    if ("ResizeObserver" in window) {
      const ro = new ResizeObserver(sizeMist);
      document.querySelectorAll("[data-mist-head]").forEach((h) => ro.observe(h));
    }
    // Headings slide in slightly when revealed; measure again once they've settled.
    document.querySelectorAll("[data-mist-head]").forEach((h) => h.addEventListener("transitionend", sizeMist));
  }

  // Header previews: after a link inside one is used, close it until the mouse leaves.
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      if (!e.target.closest("a")) return;
      item.classList.add("shut");
      if (document.activeElement) document.activeElement.blur();
    });
    item.addEventListener("mouseleave", () => item.classList.remove("shut"));
  });

  // Questions in the "Savollar" preview open that answer in the FAQ.
  document.addEventListener("click", (e) => {
    const link = e.target.closest("[data-faq-open]");
    if (!link) return;
    const all = document.querySelectorAll(".faq details");
    const d = all[+link.getAttribute("data-faq-open")];
    if (d) { all.forEach((x) => (x.open = x === d)); }
  });

  // Language list that opens on hover (the small select still works on touch screens).
  const LANG_NAMES = [["uz", "O‘zbekcha"], ["ru", "Русский"], ["en", "English"]];
  document.querySelectorAll("label.lang").forEach((label) => {
    const select = label.querySelector("select");
    if (!select) return;
    const wrap = document.createElement("div");
    wrap.className = "lang-wrap";
    label.parentNode.insertBefore(wrap, label);
    wrap.appendChild(label);
    const pop = document.createElement("div");
    pop.className = "lang-pop";
    pop.innerHTML = "<ul>" + LANG_NAMES.map(([code, name]) =>
      `<li><button type="button" data-lang="${code}">${name}<span>${code.toUpperCase()}</span></button></li>`).join("") + "</ul>";
    wrap.appendChild(pop);
    const mark = () => pop.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.lang === select.value));
    pop.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-lang]");
      if (!b) return;
      if (window.I18N) window.I18N.setLang(b.dataset.lang);
      mark();
      wrap.classList.add("shut");
      b.blur();
    });
    wrap.addEventListener("mouseleave", () => wrap.classList.remove("shut"));
    document.addEventListener("langchange", mark);
    mark();
  });

  // Offline support and "add to home screen" (see sw.js).
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();
})();
