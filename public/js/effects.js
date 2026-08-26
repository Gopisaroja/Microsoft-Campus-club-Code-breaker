(() => {
  const canvas = document.getElementById("networkCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const touchDevice = window.matchMedia("(pointer: coarse)");
  let width = 0, height = 0, dpr = 1, nodes = [], raf = 0, lastTime = 0;
  const pointer = { x: 0, y: 0, active: false };
  const palette = [[75, 130, 255], [162, 89, 255], [255, 78, 205], [43, 232, 201]];

  function createNodes() {
    const count = width < 720 ? 44 : 96;
    nodes = Array.from({ length: count }, (_, i) => ({
      x: Math.random() * width, y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.10, vy: (Math.random() - 0.5) * 0.10,
      size: Math.random() * 1.8 + 1.3, phase: Math.random() * Math.PI * 2,
      color: palette[i % palette.length],
    }));
  }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width); height = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * dpr); canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); createNodes();
  }
  function render(time) {
    const dt = Math.min(32, time - lastTime || 16); lastTime = time;
    ctx.clearRect(0, 0, width, height);
    const maxLink = width < 720 ? 110 : 155;
    const mouseRadius = width < 720 ? 125 : 190;
    if (!reduceMotion.matches) {
      for (const n of nodes) {
        n.x += n.vx * dt; n.y += n.vy * dt;
        if (n.x < -20) n.x = width + 20; if (n.x > width + 20) n.x = -20;
        if (n.y < -20) n.y = height + 20; if (n.y > height + 20) n.y = -20;
        if (pointer.active && !touchDevice.matches) {
          const dx = n.x - pointer.x, dy = n.y - pointer.y, distance = Math.hypot(dx, dy);
          if (distance < mouseRadius && distance > 1) {
            const force = (1 - distance / mouseRadius) * 0.045;
            n.x += (dx / distance) * force * dt; n.y += (dy / distance) * force * dt;
          }
        }
      }
    }
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (distance > maxLink) continue;
        let alpha = (1 - distance / maxLink) * 0.34;
        if (pointer.active && !touchDevice.matches) {
          const da = Math.hypot(a.x - pointer.x, a.y - pointer.y);
          const db = Math.hypot(b.x - pointer.x, b.y - pointer.y);
          if (da < mouseRadius || db < mouseRadius) alpha += 0.20;
        }
        const [r, g, bcol] = a.color;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `rgba(${r},${g},${bcol},${Math.min(alpha, 0.58)})`;
        ctx.lineWidth = 0.75; ctx.stroke();
      }
    }
    for (const n of nodes) {
      const pulse = (Math.sin(time * 0.0015 + n.phase) + 1) / 2;
      const radius = n.size + pulse * 0.8; const [r, g, b] = n.color;
      ctx.beginPath(); ctx.fillStyle = `rgba(${r},${g},${b},${0.72 + pulse * 0.22})`;
      ctx.arc(n.x, n.y, radius, 0, Math.PI * 2); ctx.fill();
    }
    if (!reduceMotion.matches) raf = requestAnimationFrame(render);
  }
  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("pointermove", (event) => {
    pointer.x = event.clientX; pointer.y = event.clientY; pointer.active = true;
  }, { passive: true });
  window.addEventListener("pointerleave", () => { pointer.active = false; }, { passive: true });
  resize(); raf = requestAnimationFrame(render);
})();

(function () {
  const canvas = document.getElementById("particleField");
  const core = document.getElementById("heroCore");
  const hero = document.querySelector(".hero");
  if (!canvas || !hero) return;
  const ctx = canvas.getContext("2d");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let particles = [], w = 0, h = 0, pointer = { x: 0, y: 0, active: false };
  function resize() {
    const rect = hero.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    w = rect.width; h = rect.height;
    canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px"; canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = w < 640 ? 38 : 72;
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.12, vy: (Math.random() - 0.5) * 0.12,
      r: Math.random() * 1.4 + 0.35, a: Math.random() * 0.45 + 0.15,
    }));
  }
  function draw() {
    ctx.clearRect(0, 0, w, h);
    const px = pointer.active ? pointer.x : w * 0.5;
    const py = pointer.active ? pointer.y : h * 0.45;
    for (const p of particles) {
      if (!reduce) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < -10) p.x = w + 10; if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10; if (p.y > h + 10) p.y = -10;
      }
      const dist = Math.hypot(px - p.x, py - p.y);
      if (pointer.active && dist < 150 && !reduce) {
        const force = (1 - dist / 150) * 0.018;
        p.x -= (px - p.x) * force; p.y -= (py - p.y) * force;
      }
      ctx.beginPath(); ctx.fillStyle = "rgba(190,198,255," + p.a + ")";
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    if (!reduce) requestAnimationFrame(draw);
  }
  hero.addEventListener("pointermove", (e) => {
    const r = hero.getBoundingClientRect();
    pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; pointer.active = true;
    if (core) {
      const rx = (pointer.x / r.width - 0.5) * 14;
      const ry = (pointer.y / r.height - 0.5) * 10;
      core.style.transform = "translate(calc(-50% + " + rx + "px), calc(-50% + " + ry + "px)) rotateX(" + (-ry * 0.35) + "deg) rotateY(" + (rx * 0.35) + "deg)";
    }
  });
  hero.addEventListener("pointerleave", () => {
    pointer.active = false;
    if (core) core.style.transform = "translate(-50%,-50%)";
  });
  window.addEventListener("resize", resize, { passive: true });
  resize(); draw();
})();
