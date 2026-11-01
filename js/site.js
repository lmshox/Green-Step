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

  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();
})();
