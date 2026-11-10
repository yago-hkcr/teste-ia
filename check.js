
    (() => {
      'use strict';

      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
      const smooth = t => t * t * (3 - 2 * t);

      /* ==========================================================
         0. SOM SINTETIZADO (Web Audio, sem arquivos externos)
         ========================================================== */
      const Sound = (() => {
        let ctx = null;
        let master = null;
        let noiseBuffer = null;
        let enabled = true;
        try { enabled = localStorage.getItem('nova:sound') !== 'off'; } catch {}

        const SCALE = [196, 220, 246.94, 293.66, 329.63, 392, 440, 493.88];

        function ensure() {
          if (ctx) return ctx;
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return null;
          ctx = new AC();
          master = ctx.createGain();
          master.gain.value = 0.85;
          const compressor = ctx.createDynamicsCompressor();
          master.connect(compressor);
          compressor.connect(ctx.destination);

          const length = Math.floor(ctx.sampleRate * 0.7);
          noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
          const data = noiseBuffer.getChannelData(0);
          for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
          return ctx;
        }

        function wake() {
          if (!enabled) return;
          const c = ensure();
          if (c && c.state === 'suspended') c.resume();
        }

        function tone(freq, opts = {}) {
          if (!enabled) return;
          const c = ensure();
          if (!c || c.state !== 'running') return;
          const {
            dur = 0.16, type = 'sine', vol = 0.045,
            glide = 1, delay = 0, cutoff = 2800
          } = opts;
          const t0 = c.currentTime + delay;
          const osc = c.createOscillator();
          const gain = c.createGain();
          const filter = c.createBiquadFilter();

          osc.type = type;
          osc.frequency.setValueAtTime(freq, t0);
          if (glide !== 1) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * glide), t0 + dur);
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(cutoff, t0);
          gain.gain.setValueAtTime(0.0001, t0);
          gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
          gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(master);
          osc.start(t0);
          osc.stop(t0 + dur + 0.03);
        }

        function air(opts = {}) {
          if (!enabled) return;
          const c = ensure();
          if (!c || c.state !== 'running' || !noiseBuffer) return;
          const { dur = 0.5, vol = 0.045, from = 260, to = 2600, q = 1.3 } = opts;
          const t0 = c.currentTime;
          const src = c.createBufferSource();
          src.buffer = noiseBuffer;
          const band = c.createBiquadFilter();
          band.type = 'bandpass';
          band.Q.value = q;
          band.frequency.setValueAtTime(from, t0);
          band.frequency.exponentialRampToValueAtTime(to, t0 + dur);
          const gain = c.createGain();
          gain.gain.setValueAtTime(0.0001, t0);
          gain.gain.exponentialRampToValueAtTime(vol, t0 + dur * 0.2);
          gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

          src.connect(band);
          band.connect(gain);
          gain.connect(master);
          src.start(t0);
          src.stop(t0 + dur + 0.03);
        }

        return {
          get enabled() { return enabled; },
          wake,
          set(value) {
            enabled = value;
            try { localStorage.setItem('nova:sound', value ? 'on' : 'off'); } catch {}
            if (value) {
              wake();
              tone(523.25, { dur: 0.18, vol: 0.04 });
              setTimeout(() => tone(783.99, { dur: 0.26, vol: 0.03 }), 95);
            }
          },
          /* som de troca de frame (escala pentatônica) */
          frame(index) {
            if (index === 2 || index === 4) air({ dur: 0.55, vol: 0.05, from: 180, to: 2400 });
            const base = SCALE[index % SCALE.length];
            tone(base, { dur: 0.5, vol: 0.05, type: 'triangle', cutoff: 2100 });
            tone(base * 2, { dur: 0.34, vol: 0.02, delay: 0.025 });
          },
          hover() { tone(880, { dur: 0.07, vol: 0.014, cutoff: 2600 }); },
          click() { tone(392, { dur: 0.13, vol: 0.035, type: 'triangle', glide: 1.5 }); },
          scrub() { air({ dur: 0.2, vol: 0.022, from: 520, to: 1500, q: 2.4 }); }
        };
      })();

      /* o navegador exige um gesto para liberar o áudio */
      ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(type => {
        addEventListener(type, () => Sound.wake(), { once: true, passive: true });
      });

      /* ==========================================================
         1. ANIMAÇÕES DE ENTRADA
         ========================================================== */
      const animEls = [...document.querySelectorAll('[data-anim]')];
      animEls.forEach(el => {
        const siblings = el.parentElement ? [...el.parentElement.children].filter(n => n.hasAttribute('data-anim')) : [];
        const i = siblings.indexOf(el);
        el.style.setProperty('--d', `${clamp(i, 0, 6) * 70}ms`);
      });

      const hasObserver = 'IntersectionObserver' in window;

      const reveal = hasObserver ? new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('in');
          reveal.unobserve(entry.target);
        });
      }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' }) : null;
      if (reveal) animEls.forEach(el => reveal.observe(el));
      else animEls.forEach(el => el.classList.add('in'));

      /* contadores */
      const counters = [...document.querySelectorAll('[data-count]')];
      const countObserver = hasObserver ? new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          const target = Number(el.dataset.count) || 0;
          countObserver.unobserve(el);
          if (reduced) { el.textContent = String(target); return; }
          const start = performance.now();
          const tick = now => {
            const t = clamp((now - start) / 1300, 0, 1);
            el.textContent = String(Math.round(target * smooth(t)));
            if (t < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
      }, { threshold: 0.6 }) : null;
      if (countObserver) counters.forEach(el => countObserver.observe(el));
      else counters.forEach(el => { el.textContent = el.dataset.count; });

      /* topo + link ativo */
      const topbar = document.querySelector('#topbar');
      const navLinks = [...document.querySelectorAll('.nav a[href^="#"]')];
      const onTop = () => topbar.classList.toggle('scrolled', scrollY > 32);
      onTop();

      /* botão de som */
      const soundBtn = document.querySelector('#sound');
      const paintSound = () => soundBtn.setAttribute('aria-pressed', String(Sound.enabled));
      paintSound();
      soundBtn.addEventListener('click', () => {
        Sound.set(!Sound.enabled);
        paintSound();
      });

      const sectionForNav = navLinks
        .map(link => ({ link, el: document.querySelector(link.getAttribute('href')) }))
        .filter(item => item.el);

      const navObserver = hasObserver ? new IntersectionObserver(entries => {
        entries.forEach(entry => {
          const match = sectionForNav.find(item => item.el === entry.target);
          if (match) match.link.classList.toggle('active', entry.isIntersecting);
        });
      }, { rootMargin: '-45% 0px -45% 0px' }) : null;
      if (navObserver) sectionForNav.forEach(item => navObserver.observe(item.el));

      /* ==========================================================
         2. MAPA DE FRAMES
         Cada seção é um frame exato: quando o centro da seção
         cruza o centro da tela, a cena está no estado exato.
         ========================================================== */
      const sections = [...document.querySelectorAll('[data-frame]')];
      const FRAME_COUNT = sections.length;
      const hudIndex = document.querySelector('#hudIndex');
      const hudTotal = document.querySelector('#hudTotal');
      const hudStage = document.querySelector('#hudStage');
      const hudCaption = document.querySelector('#hudCaption');
      const hudFill = document.querySelector('#hudFill');
      hudTotal.textContent = String(FRAME_COUNT).padStart(2, '0');

      let anchors = [];
      let target = 0;
      let current = 0;
      let hudFrame = -1;

      function measure() {
        const maxY = Math.max(0, document.documentElement.scrollHeight - innerHeight);
        anchors = sections.map(el => {
          const rect = el.getBoundingClientRect();
          return {
            el,
            frame: Number(el.dataset.frame) || 0,
            /* centro da seção no centro da tela, limitado à rolagem real */
            y: clamp(rect.top + scrollY + rect.height / 2 - innerHeight / 2, 0, maxY)
          };
        }).sort((a, b) => a.frame - b.frame);
        updateHud(true);
      }

      function progressAt(y) {
        if (!anchors.length) return 0;
        const first = anchors[0];
        const last = anchors[anchors.length - 1];
        if (y <= first.y) return first.frame / (FRAME_COUNT - 1);
        if (y >= last.y) return last.frame / (FRAME_COUNT - 1);
        for (let i = 0; i < anchors.length - 1; i++) {
          const a = anchors[i];
          const b = anchors[i + 1];
          if (y >= a.y && y <= b.y) {
            const t = smooth((y - a.y) / Math.max(1, b.y - a.y));
            return (a.frame + (b.frame - a.frame) * t) / (FRAME_COUNT - 1);
          }
        }
        return 1;
      }

      function updateHud(force) {
        /* HUD, rótulo e som seguem o frame que a cena realmente desenha. */
        const p = clamp(current, 0, 1);
        const index = clamp(Math.round(p * (FRAME_COUNT - 1)), 0, FRAME_COUNT - 1);
        hudFill.style.transform = `scaleX(${p.toFixed(3)})`;
        if (!force && index === hudFrame) return;
        hudFrame = index;
        const section = sections[index];
        hudIndex.textContent = String(index + 1).padStart(2, '0');
        hudStage.textContent = section.dataset.label;
        hudCaption.textContent = section.dataset.caption;
        hudStage.animate(
          [{ opacity: 0, transform: 'translateY(7px)' }, { opacity: 1, transform: 'none' }],
          { duration: reduced ? 1 : 520, easing: 'cubic-bezier(.16,1,.3,1)' }
        );
        hudCaption.animate(
          [{ opacity: 0 }, { opacity: 1 }],
          { duration: reduced ? 1 : 640, delay: reduced ? 0 : 70, easing: 'ease-out' }
        );
        if (!force) Sound.frame(index);
      }

      /* ==========================================================
         3. CENA: PLANETA QUE FORMA, EXPLODE E RECONSTRÓI
         ========================================================== */
      const canvas = document.querySelector('#scene');
      const ctx = canvas.getContext('2d', { alpha: true });

      /*
        Oito frames — cada coluna é um estado exato da cena:
        0 Formação · 1 Órbita · 2 Fragmentação · 3 Giro
        4 Explosão · 5 Reconstrução · 6 Colagem · 7 Novo mundo
      */
      const KEYS = {
        explode: [0, 0, 0.22, 0.1, 1, 0.08, 0.08, 0],
        shard:   [0, 0, 1, 0.55, 0.25, 0.04, 0.28, 0],
        spin:    [0.5, 0.7, 1.1, 2.7, 1.5, 0.85, 1.2, 0.55],
        ring:    [0.55, 1, 0.45, 1, 0.12, 0.65, 0.9, 1],
        rim:     [0.5, 0.75, 0.55, 0.95, 0.1, 0.5, 0.7, 1],
        glow:    [0.5, 0.7, 0.55, 0.85, 0.3, 0.55, 0.75, 0.95],
        glitch:  [0, 0, 0.8, 0.15, 1, 0.3, 0.85, 0],
        scale:   [1, 1, 0.95, 1.03, 1.07, 0.97, 1.01, 1]
      };

      function keyframe(stops, p) {
        const scaled = clamp(p, 0, 1) * (stops.length - 1);
        const i = Math.min(stops.length - 2, Math.floor(scaled));
        const t = smooth(scaled - i);
        return stops[i] + (stops[i + 1] - stops[i]) * t;
      }

      let w = 0, h = 0, dpr = 1, narrow = false;
      let particles = [], stars = [], shards = [];
      let mx = 0, my = 0, tmx = 0, tmy = 0;
      let rot = 0;

      function resize() {
        dpr = Math.min(devicePixelRatio || 1, narrow ? 1.5 : 1.35);
        w = innerWidth;
        h = innerHeight;
        narrow = w < 980;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const count = narrow ? 190 : clamp(Math.round(w * h / 4400), 240, 340);
        particles = Array.from({ length: count }, (_, i) => {
          const a = Math.random() * Math.PI * 2;
          const z = Math.random() * 2 - 1;
          const r = Math.sqrt(1 - z * z);
          return {
            theta: Math.random() * Math.PI * 2,
            phi: Math.acos(2 * Math.random() - 1),
            seed: (i * 0.618033 + Math.random() * 4) % 1,
            size: 0.45 + Math.random() * 1.35,
            orbit: 0.45 + Math.random() * 1.4,
            dx: Math.cos(a) * r,
            dy: Math.sin(a) * r,
            dz: z
          };
        });

        /* 12 fragmentos: agrupa partículas por região e acha o centro de cada uma */
        shards = Array.from({ length: 12 }, () => ({ x: 0, y: 0, z: 0, n: 0, angle: Math.random() * Math.PI * 2 }));
        for (const s of particles) {
          const region = Math.min(3, Math.floor((s.theta / (Math.PI * 2)) * 4)) +
                         4 * Math.min(2, Math.floor((s.phi / Math.PI) * 3));
          s.shard = region;
          const sinPhi = Math.sin(s.phi);
          shards[region].x += sinPhi * Math.cos(s.theta);
          shards[region].y += Math.cos(s.phi);
          shards[region].z += sinPhi * Math.sin(s.theta);
          shards[region].n++;
        }
        for (const sh of shards) {
          if (sh.n) { sh.x /= sh.n; sh.y /= sh.n; sh.z /= sh.n; }
          else { sh.x = 0; sh.y = 1; sh.z = 0; }
        }

        stars = Array.from({ length: narrow ? 34 : 66 }, () => ({
          x: Math.random(),
          y: Math.random(),
          z: 0.2 + Math.random() * 0.8,
          p: Math.random() * Math.PI * 2,
          s: 0.4 + Math.random() * 1
        }));

        measure();
        if (reduced) draw(performance.now());
      }

      function draw(time) {
        const p = clamp(current, 0, 1);
        const ex = keyframe(KEYS.explode, p);
        const shard = keyframe(KEYS.shard, p);
        const ring = keyframe(KEYS.ring, p);
        const rim = keyframe(KEYS.rim, p);
        const glow = keyframe(KEYS.glow, p);
        const spin = keyframe(KEYS.spin, p);
        const glitchV = keyframe(KEYS.glitch, p);
        const scaleK = keyframe(KEYS.scale, p);

        /* tremor de câmera nas explosões */
        const shake = reduced ? 0 : ex * 3.4;
        let cx = w * (narrow ? 0.5 : 0.735) + mx * 14 + Math.sin(time * 0.041) * shake;
        let cy = h * (narrow ? 0.31 : 0.5) + my * 12 + Math.cos(time * 0.049) * shake * 0.7;
        const base = Math.min(w * (narrow ? 0.3 : 0.172), h * (narrow ? 0.22 : 0.27));
        const R = base * scaleK * (1 + Math.sin(time * 0.0007) * 0.006);

        /* giro global do planeta */
        const yaw = rot;
        const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
        const tilt = 0.08 + Math.sin(rot * 0.12) * 0.03;
        const cosT = Math.cos(tilt), sinT = Math.sin(tilt);

        ctx.clearRect(0, 0, w, h);

        /* halo */
        const halo = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * (1.9 + ex * 1.2));
        halo.addColorStop(0, `rgba(120,255,140,${(0.06 + glow * 0.05 + ex * 0.04) * (1 - shard * 0.5)})`);
        halo.addColorStop(0.55, `rgba(64,214,140,${(0.03 + ex * 0.04) * (1 - shard * 0.5)})`);
        halo.addColorStop(1, 'rgba(40,180,120,0)');
        ctx.fillStyle = halo;
        ctx.fillRect(0, 0, w, h);

        /* estrelas distantes */
        for (const s of stars) {
          const tw = 0.45 + Math.sin(time * 0.0012 + s.p) * 0.25;
          ctx.fillStyle = `rgba(226,235,235,${tw * 0.35 * s.z})`;
          ctx.beginPath();
          ctx.arc(s.x * w, s.y * h, s.s * 0.7, 0, Math.PI * 2);
          ctx.fill();
        }

        /* corpo do planeta */
        const bodyFade = (1 - ex * 0.94) * (1 - shard);
        const body = ctx.createRadialGradient(
          cx - R * 0.34, cy - R * 0.38, R * 0.04,
          cx + R * 0.08, cy + R * 0.12, R * 1.02
        );
        body.addColorStop(0, `rgba(206,255,182,${0.95 * bodyFade})`);
        body.addColorStop(0.2, `rgba(104,245,158,${0.92 * bodyFade})`);
        body.addColorStop(0.52, `rgba(19,166,134,${0.9 * bodyFade})`);
        body.addColorStop(0.8, `rgba(10,86,96,${0.92 * bodyFade})`);
        body.addColorStop(1, `rgba(6,28,38,${0.96 * bodyFade})`);
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fill();

        /* faixas da superfície */
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.995, 0, Math.PI * 2);
        ctx.clip();
        for (let i = 0; i < 6; i++) {
          const y = cy - R + i * R * 0.36 + Math.sin(time * 0.0005 + i) * R * 0.03;
          ctx.beginPath();
          ctx.ellipse(
            cx + Math.sin(i * 7 + time * 0.00018) * R * 0.14,
            y,
            R * (0.55 + (i % 3) * 0.16),
            R * (0.03 + (i % 2) * 0.016),
            Math.sin(i + time * 0.0003) * 0.2,
            0, Math.PI * 2
          );
          ctx.fillStyle = i % 2
            ? `rgba(190,255,170,${0.045 * bodyFade * (1 - shard * 0.5)})`
            : `rgba(220,255,190,${0.07 * bodyFade * (1 - shard * 0.5)})`;
          ctx.fill();
        }
        ctx.restore();

        /* blocos da fragmentação: dão volume a cada pedaço */
        if (shard > 0.06) {
          for (const sh of shards) {
            const dist = shard * R * (0.18 + (sh.n % 9) * 0.038);
            const fragAngle = sh.angle + shard * 1.5 + rot * 0.18;
            const shx = (sh.x * Math.cos(fragAngle) - sh.z * Math.sin(fragAngle)) * dist;
            const shz = (sh.x * Math.sin(fragAngle) + sh.z * Math.cos(fragAngle)) * dist;
            const shy = sh.y * dist;

            const bx = sh.x * cosY - sh.z * sinY;
            const bz = sh.x * sinY + sh.z * cosY;
            const by = sh.y * cosT - bz * sinT;
            const bz2 = sh.y * sinT + bz * cosT;

            const X = bx * R + shx;
            const Y = by * R + shy;
            const Z = bz2 * R + shz;
            const scale = (R * 2.8) / (R * 2.8 + Z);
            const px = cx + X * scale;
            const py = cy + Y * scale;
            const radius = R * (0.24 + (sh.n % 5) * 0.035) * scale * (1 - ex * 0.3);
            const alpha = shard * (1 - ex * 0.7) * clamp((Z / R + 1.4) / 2.4, 0.15, 1);
            const outward = Math.atan2(py - cy, px - cx);

            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(outward);
            ctx.scale(1.22, 0.82);
            const blob = ctx.createRadialGradient(-radius * 0.28, -radius * 0.32, radius * 0.04, 0, 0, radius);
            blob.addColorStop(0, `rgba(200,255,180,${0.5 * alpha})`);
            blob.addColorStop(0.5, `rgba(38,182,146,${0.4 * alpha})`);
            blob.addColorStop(0.86, `rgba(9,66,80,${0.42 * alpha})`);
            blob.addColorStop(1, 'rgba(6,30,40,0)');
            ctx.fillStyle = blob;
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = `rgba(201,255,77,${0.28 * alpha})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.arc(0, 0, radius * 0.95, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
        }

        /* partículas / superfície / fragmentos */
        for (let i = 0; i < particles.length; i++) {
          const s = particles[i];
          const twist = shard * (shards[s.shard] ? shards[s.shard].angle : 0) * 0.35 + rot * 0.08;
          const a = s.theta + rot * s.orbit * 0.55 + twist;
          const sinPhi = Math.sin(s.phi);
          const x0 = sinPhi * Math.cos(a);
          const y0 = Math.cos(s.phi);
          const z0 = sinPhi * Math.sin(a);

          /* giro do planeta em torno do próprio eixo */
          const x1 = x0 * cosY - z0 * sinY;
          const z1 = x0 * sinY + z0 * cosY;
          const y1 = y0 * cosT - z1 * sinT;
          const z2 = y0 * sinT + z1 * cosT;

          /* fragmentação: cada bloco se desprende e gira */
          const sh = shards[s.shard] || shards[0];
          const frag = shard * R * (0.18 + (sh.n % 9) * 0.038);
          const fragAngle = sh.angle + shard * 1.5 + rot * 0.18;
          const shx = (sh.x * Math.cos(fragAngle) - sh.z * Math.sin(fragAngle)) * frag;
          const shz = (sh.x * Math.sin(fragAngle) + sh.z * Math.cos(fragAngle)) * frag;
          const shy = sh.y * frag;

          const push = ex * R * (0.5 + s.seed * 2.2);
          const scatter = shard * R * (s.seed - 0.5) * 0.12;
          const drift = (1 - ex) * Math.sin(time * 0.0009 + s.seed * 12) * R * 0.012;
          const X = x1 * R + s.dx * push + shx + scatter;
          const Y = y1 * R + s.dy * push + shy;
          const Z = z2 * R + s.dz * push + shz;

          const scale = (R * 2.8) / (R * 2.8 + Z);
          let px = cx + X * scale;
          let py = cy + Y * scale;

          /* glitch: fatias horizontais deslocadas */
          if (glitchV > 0.02) {
            const band = Math.floor(((py + 40) / h) * 16);
            const noise = Math.sin(band * 91.7 + Math.floor(time * 0.03)) * 0.5 + 0.5;
            px += (noise - 0.5) * glitchV * 26;
          }
          if (px < -10 || px > w + 10 || py < -10 || py > h + 10) continue;

          const front = clamp((Z / R + 1) / 2, 0, 1);
          const visible = (0.3 + front * 0.7) * (1 - ex * 0.15);
          const hot = ex > 0.12 && s.seed > 1 - ex * 0.55;
          const alpha = front * 0.55 * (1 - ex * 0.1) + 0.12;

          if (hot) {
            ctx.strokeStyle = `rgba(214,255,138,${0.18 * ex})`;
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px - s.dx * R * 0.22 * ex, py - s.dy * R * 0.22 * ex);
            ctx.stroke();
            ctx.fillStyle = `rgba(222,255,150,${0.85 * visible})`;
            ctx.beginPath();
            ctx.arc(px, py, s.size * 1.25, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillStyle = `rgba(${Math.round(150 + front * 70)},${Math.round(232 + front * 20)},${Math.round(180 + front * 60)},${alpha})`;
            ctx.beginPath();
            ctx.arc(px + drift, py + drift * 0.6, s.size * (0.45 + front * 0.6), 0, Math.PI * 2);
            ctx.fill();
          }
        }

        /* brilho na borda */
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.002, Math.PI * 1.03, Math.PI * 1.92);
        ctx.strokeStyle = `rgba(201,255,77,${0.16 + rim * 0.5 * (1 - ex)})`;
        ctx.lineWidth = 1.2;
        ctx.shadowColor = 'rgba(201,255,140,.9)';
        ctx.shadowBlur = 16;
        ctx.stroke();
        ctx.restore();

        /* onda de choque */
        if (ex > 0.02) {
          ctx.save();
          ctx.translate(cx, cy);

          /* núcleo luminoso */
          const coreR = R * (0.22 + ex * 0.6);
          const core = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR * 2.2);
          core.addColorStop(0, `rgba(246,255,220,${0.5 * ex})`);
          core.addColorStop(0.3, `rgba(196,255,128,${0.3 * ex})`);
          core.addColorStop(1, 'rgba(150,255,90,0)');
          ctx.fillStyle = core;
          ctx.beginPath();
          ctx.arc(0, 0, coreR * 2.2, 0, Math.PI * 2);
          ctx.fill();

          for (let r = 0; r < 3; r++) {
            const phase = (ex * 1.35 + r * 0.27) % 1;
            const radius = R * (0.35 + phase * 3.6);
            const alpha = ex * (1 - phase) * 0.4;
            if (alpha <= 0.004) continue;
            ctx.beginPath();
            ctx.ellipse(0, 0, radius, radius * (0.34 + r * 0.03), 0, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(${r % 2 ? '192,255,110' : '232,255,196'},${alpha})`;
            ctx.lineWidth = 0.8 + alpha * 2;
            ctx.stroke();
          }
          const rays = 10;
          for (let i = 0; i < rays; i++) {
            const angle = (i / rays) * Math.PI * 2 + rot * 1.6;
            const len = R * (0.1 + (i % 4) * 0.09) * ex;
            ctx.beginPath();
            ctx.moveTo(Math.cos(angle) * R * 0.86, Math.sin(angle) * R * 0.86);
            ctx.lineTo(Math.cos(angle) * (R + len), Math.sin(angle) * (R + len));
            ctx.strokeStyle = `rgba(207,255,136,${ex * (0.1 + (i % 3) * 0.06)})`;
            ctx.lineWidth = 0.7;
            ctx.stroke();
          }
          ctx.restore();
        }

        /* linhas de velocidade no giro rápido */
        if (spin > 1.35) {
          const intensity = Math.min(1, (spin - 1.35) / 1.4);
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(rot * 0.35);
          for (let i = 0; i < 24; i++) {
            const a = (i / 24) * Math.PI * 2;
            const r0 = R * (1.06 + (i % 4) * 0.06);
            const r1 = r0 + R * (0.1 + (i % 3) * 0.07) * intensity;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
            ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
            ctx.strokeStyle = `rgba(201,255,140,${0.2 * intensity})`;
            ctx.lineWidth = 0.7;
            ctx.stroke();
          }
          ctx.restore();
        }

        if (glitchV > 0.05) {
          /* scanlines do glitch */
          for (let i = 0; i < 26; i++) {
            const y = (i / 26) * h;
            const wdt = Math.sin(i * 7.3 + time * 0.003) * 0.5 + 0.5;
            ctx.fillStyle = `rgba(190,255,150,${0.025 * glitchV * wdt})`;
            ctx.fillRect(0, y, w, 1);
          }
        }

        /* anel orbital + satélite */
        if (ring > 0.03) {
          const ringTilt = -0.34 + Math.sin(rot * 0.1) * 0.04;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(ringTilt);
          ctx.beginPath();
          ctx.ellipse(0, 0, R * 1.52, R * 0.37, 0, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(201,255,77,${0.12 + ring * 0.24 * (1 - ex * 0.5)})`;
          ctx.lineWidth = 0.9;
          ctx.stroke();

          /* segundo anel, em outra inclinação */
          ctx.rotate(-1.15);
          ctx.beginPath();
          ctx.ellipse(0, 0, R * 1.3, R * 0.58, 0, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(150,255,160,${0.06 + ring * 0.09})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();
          ctx.rotate(1.15);

          if (ring > 0.25) {
            const angle = rot * 0.7 + p * 2.4;
            const sx = Math.cos(angle) * R * 1.52;
            const sy = Math.sin(angle) * R * 0.37;
            ctx.fillStyle = `rgba(226,255,180,${0.25 + ring * 0.6})`;
            ctx.shadowColor = 'rgba(201,255,120,.9)';
            ctx.shadowBlur = 14;
            ctx.beginPath();
            ctx.arc(sx, sy, 2.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
          }
          ctx.restore();
        }

      }

      /* ==========================================================
         4. LOOP E EVENTOS
         ========================================================== */
      /* barra de progresso, brilho do cursor e botão magnético */
      const railFill = document.querySelector('#railFill');
      const glowEl = document.querySelector('#glow');
      const finePointer = matchMedia('(pointer:fine)').matches;
      let glowX = innerWidth / 2, glowY = innerHeight / 2, glowTX = glowX, glowTY = glowY;

      const magnetic = document.querySelector('.hero .btn');
      if (magnetic && finePointer && !reduced) {
        magnetic.addEventListener('pointermove', event => {
          const rect = magnetic.getBoundingClientRect();
          const dx = (event.clientX - (rect.left + rect.width / 2)) / rect.width;
          const dy = (event.clientY - (rect.top + rect.height / 2)) / rect.height;
          magnetic.style.transform = `translate(${(dx * 6).toFixed(2)}px, ${(dy * 8).toFixed(2)}px)`;
        });
        magnetic.addEventListener('pointerleave', () => { magnetic.style.transform = ''; });
      }

      function syncProgress() {
        railFill.style.transform = `scaleX(${clamp(current, 0, 1).toFixed(4)})`;
      }

      let raf = 0;
      let last = 0;

      function loop(time) {
        raf = 0;
        if (document.hidden) return;
        if (time - last < 32) { raf = requestAnimationFrame(loop); return; }
        const dt = Math.min(48, time - last);
        last = time;

        const ease = 1 - Math.exp(-dt / 72);
        current += (target - current) * ease;
        if (Math.abs(target - current) < 0.0004) current = target;

        const move = 1 - Math.exp(-dt / 180);
        mx += (tmx - mx) * move;
        my += (tmy - my) * move;

        /* mesma posição de scroll = mesma orientação do planeta */
        rot = current * Math.PI * 5;

        draw(time);
        updateHud(false);
        syncProgress();

        if (finePointer && glowEl) {
          glowX += (glowTX - glowX) * move;
          glowY += (glowTY - glowY) * move;
          glowEl.style.transform = `translate3d(${glowX.toFixed(1)}px, ${glowY.toFixed(1)}px, 0)`;
        }

        raf = requestAnimationFrame(loop);
      }

      let ticking = false;
      function onScroll() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          ticking = false;
          onTop();
          target = progressAt(scrollY);
          if (reduced) {
            current = target;
            draw(performance.now());
            updateHud(false);
            syncProgress();
          } else {
            updateHud(false);
            if (!raf) raf = requestAnimationFrame(loop);
          }
        });
      }

      /* navegação interna pousa exatamente no frame da seção */
      const anchorOf = el => {
        const found = anchors.find(a => a.el === el);
        if (found) return found.y;
        const rect = el.getBoundingClientRect();
        return Math.max(0, rect.top + scrollY);
      };
      document.addEventListener('click', event => {
        const link = event.target.closest('a[href^="#"]');
        if (!link) return;
        Sound.click();
        const id = link.getAttribute('href').slice(1);
        const el = id ? document.getElementById(id) : null;
        if (!el) return;
        event.preventDefault();
        const top = id === 'inicio' ? 0 : anchorOf(el);
        scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
        history.replaceState(null, '', `#${id}`);
      });

      /* sons de interface */
      let lastHover = 0;
      document.addEventListener('pointerover', event => {
        const el = event.target.closest('a,button,.project,.clients li,.steps li');
        if (!el) return;
        const now = performance.now();
        if (now - lastHover < 90) return;
        lastHover = now;
        Sound.hover();
      }, { passive: true });

      let lastScrub = 0;
      addEventListener('wheel', () => {
        const now = performance.now();
        if (now - lastScrub < 260) return;
        lastScrub = now;
        Sound.scrub();
      }, { passive: true });

      addEventListener('scroll', onScroll, { passive: true });
      addEventListener('resize', () => { resize(); onScroll(); }, { passive: true });
      addEventListener('pointermove', event => {
        tmx = (event.clientX / w - 0.5) * 2;
        tmy = (event.clientY / h - 0.5) * 2;
        glowTX = event.clientX;
        glowTY = event.clientY;
      }, { passive: true });
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && !reduced && !raf) {
          last = performance.now() - 32;
          raf = requestAnimationFrame(loop);
        }
      });

      /* inicialização */
      resize();
      onTop();
      target = progressAt(scrollY);
      current = target;
      updateHud(true);
      syncProgress();
      draw(performance.now());
      if (!reduced) raf = requestAnimationFrame(loop);
      if (document.fonts?.ready) document.fonts.ready.then(() => { measure(); onScroll(); });
    })();
  