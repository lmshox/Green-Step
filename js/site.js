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
