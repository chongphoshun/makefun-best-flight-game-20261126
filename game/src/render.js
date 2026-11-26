// Nusantara Sky Courier — all drawing. One 1280x720 logical canvas: a chase
// view over recognisable Indonesian terrain, the plane in frame, a lit cockpit
// panel with live instruments, and a HUD with ALT / SPD / HDG always visible.
import { FIELD, FONT, PALETTE, AIRCRAFT, MISSIONS, UPGRADES } from './config.js';
import { headingDiff } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_SHOP = 'shop';

const W = FIELD.width;
const H = FIELD.height;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let scale = 1;
  let ox = 0;
  let oy = 0;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    scale = Math.min(canvas.width / W, canvas.height / H);
    ox = (canvas.width - W * scale) / 2;
    oy = (canvas.height - H * scale) / 2;
  }
  resize();
  window.addEventListener('resize', resize);
  function toLogical(cx, cy) {
    const r = canvas.getBoundingClientRect();
    return { x: ((cx - r.left) * (canvas.width / r.width) - ox) / scale, y: ((cy - r.top) * (canvas.height / r.height) - oy) / scale };
  }

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function text(s, x, y, size, color, align, bold) {
    ctx.fillStyle = color;
    ctx.font = `${bold ? '700' : '400'} ${size}px ${FONT}`;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(s, x, y);
  }
  function fmt(n) {
    return Math.round(n).toLocaleString('en-US');
  }

  // ---- terrain ----
  function drawSky(state, horizonY) {
    const g = ctx.createLinearGradient(0, 0, 0, horizonY + 40);
    g.addColorStop(0, state.region.sky);
    g.addColorStop(1, '#e8f4fb');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, horizonY + 40);
    // Sun + clouds (drift with distance so the sky feels alive).
    ctx.fillStyle = 'rgba(255, 244, 190, 0.95)';
    ctx.beginPath();
    ctx.arc(1080, 84, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 6; i += 1) {
      const cx = ((i * 260 - state.dist * 90) % 1500 + 1500) % 1500 - 120;
      const cy = 60 + (i % 3) * 52;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 62, 18, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 40, cy + 6, 44, 14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Distant mountain silhouette per region.
    ctx.fillStyle = state.region.accent;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    for (let x = 0; x <= W; x += 80) {
      const hgt = 40 + 46 * Math.abs(Math.sin(x * 0.011 + state.region.name.length));
      ctx.lineTo(x, horizonY - hgt);
    }
    ctx.lineTo(W, horizonY);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawGround(state, horizonY) {
    const g = ctx.createLinearGradient(0, horizonY, 0, H);
    g.addColorStop(0, state.region.groundFar);
    g.addColorStop(1, state.region.ground);
    ctx.fillStyle = g;
    ctx.fillRect(0, horizonY, W, H - horizonY);
    const r = state.region;
    const scroll = (state.dist * 1400) % 90;
    if (r.kind === 'karst' || r.kind === 'lake') {
      // Turquoise water with karst islands / lake shore.
      ctx.fillStyle = r.water;
      ctx.fillRect(0, horizonY, W, H - horizonY);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      for (let i = 0; i < 8; i += 1) {
        const y = horizonY + 30 + ((i * 67 + scroll * 2) % (H - horizonY - 40));
        ctx.fillRect(40 + (i % 4) * 300, y, 120, 3);
      }
      if (r.kind === 'karst') {
        for (let i = 0; i < 5; i += 1) {
          const ix = 120 + i * 240 + Math.sin(state.heading * 0.05 + i) * 30;
          const iy = horizonY + 60 + (i % 2) * 70;
          ctx.fillStyle = '#1d7a5e';
          ctx.beginPath();
          ctx.moveTo(ix - 70, iy + 40);
          ctx.quadraticCurveTo(ix - 20, iy - 60, ix, iy - 70);
          ctx.quadraticCurveTo(ix + 30, iy - 40, ix + 70, iy + 40);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#2fae7a';
          ctx.fillRect(ix - 8, iy - 78, 16, 22);
        }
      } else {
        // Danau Toba: Pulau Samosir in the middle of the lake.
        ctx.fillStyle = '#2e6b34';
        ctx.beginPath();
        ctx.ellipse(640, horizonY + 120, 210, 52, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3f9e4d';
        ctx.beginPath();
        ctx.ellipse(640, horizonY + 108, 150, 34, 0, 0, Math.PI * 2);
        ctx.fill();
        text('PULAU SAMOSIR', 640, horizonY + 116, 15, '#eaf6ff', 'center', true);
      }
    } else if (r.kind === 'terraces') {
      // Stepped rice terraces scrolling toward the viewer.
      for (let i = 0; i < 9; i += 1) {
        const y = horizonY + 18 + i * 42 + (scroll % 42);
        ctx.fillStyle = i % 2 ? '#2e7d32' : '#57b25e';
        ctx.fillRect(0, y, W, 20);
        ctx.fillStyle = 'rgba(46,134,193,0.7)';
        ctx.fillRect(0, y + 20, W, 4);
      }
      ctx.fillStyle = '#2e7d32';
      ctx.beginPath();
      ctx.ellipse(220, horizonY + 130, 120, 40, 0, 0, Math.PI * 2);
      ctx.fill();
      text('TEGALALANG', 220, horizonY + 134, 14, '#fff', 'center', true);
    } else if (r.kind === 'volcano') {
      // Bromo cone + sea of sand + smoke.
      ctx.fillStyle = '#8a7a5a';
      ctx.fillRect(0, horizonY + 90, W, H - horizonY - 90);
      ctx.fillStyle = '#5a4632';
      ctx.beginPath();
      ctx.moveTo(380, horizonY + 120);
      ctx.lineTo(560, horizonY - 30);
      ctx.lineTo(640, horizonY - 30);
      ctx.lineTo(740, horizonY + 30);
      ctx.lineTo(900, horizonY + 120);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#3a2c1e';
      ctx.beginPath();
      ctx.ellipse(600, horizonY - 28, 42, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.arc(600 + Math.sin(state.elapsed * 0.7 + i * 2) * 14, horizonY - 60 - i * 22, 16 + i * 6, 0, Math.PI * 2);
        ctx.fill();
      }
      text('GUNUNG BROMO', 600, horizonY + 150, 16, '#fff', 'center', true);
    } else if (r.kind === 'city') {
      // Jakarta skyline: Monas + towers.
      ctx.fillStyle = '#5d6a76';
      for (let i = 0; i < 14; i += 1) {
        const bx = 30 + i * 90;
        const bh = 60 + ((i * 53) % 110);
        ctx.fillRect(bx, horizonY + 120 - bh, 54, bh);
        ctx.fillStyle = 'rgba(255,240,170,0.8)';
        for (let wy = 0; wy < 4; wy += 1) ctx.fillRect(bx + 8, horizonY + 120 - bh + 10 + wy * 22, 10, 8);
        ctx.fillStyle = '#5d6a76';
      }
      // Monas obelisk.
      ctx.fillStyle = '#e8e2d0';
      ctx.fillRect(596, horizonY - 10, 26, 130);
      ctx.beginPath();
      ctx.moveTo(588, horizonY - 10);
      ctx.lineTo(609, horizonY - 52);
      ctx.lineTo(630, horizonY - 10);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f2c94c';
      ctx.beginPath();
      ctx.moveTo(609, horizonY - 58);
      ctx.lineTo(617, horizonY - 40);
      ctx.lineTo(601, horizonY - 40);
      ctx.closePath();
      ctx.fill();
      text('MONAS — JAKARTA', 609, horizonY + 150, 15, '#fff', 'center', true);
    } else if (r.kind === 'jungle') {
      // Kapuas river winding through jungle.
      ctx.fillStyle = '#1f6b34';
      ctx.fillRect(0, horizonY, W, H - horizonY);
      ctx.strokeStyle = state.region.water;
      ctx.lineWidth = 34;
      ctx.beginPath();
      ctx.moveTo(0, horizonY + 60);
      ctx.bezierCurveTo(300, horizonY + 140, 500, horizonY + 40, 800, horizonY + 150);
      ctx.bezierCurveTo(1000, horizonY + 210, 1150, horizonY + 120, 1280, horizonY + 190);
      ctx.stroke();
      ctx.fillStyle = '#123f1e';
      for (let i = 0; i < 26; i += 1) {
        const tx = (i * 97 + scroll * 3) % W;
        const ty = horizonY + 30 + ((i * 61) % 200);
        ctx.beginPath();
        ctx.arc(tx, ty, 12, 0, Math.PI * 2);
        ctx.fill();
      }
      text('SUNGAI KAPUAS', 640, horizonY + 100, 15, '#eaf6ff', 'center', true);
    } else if (r.kind === 'savanna') {
      // Komodo savanna hills + pink beach strip.
      ctx.fillStyle = '#c9a35a';
      ctx.fillRect(0, horizonY, W, H - horizonY);
      ctx.fillStyle = '#a8823f';
      for (let i = 0; i < 4; i += 1) {
        ctx.beginPath();
        ctx.ellipse(180 + i * 300, horizonY + 90 + (i % 2) * 50, 190, 44, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#f2a0b5';
      ctx.fillRect(0, H - 60, W, 60);
      ctx.fillStyle = '#2e86c1';
      ctx.fillRect(0, H - 24, W, 24);
      // Komodo silhouette on a hill.
      ctx.fillStyle = '#4a3a22';
      ctx.beginPath();
      ctx.ellipse(1020, horizonY + 96, 46, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(1052, horizonY + 88, 26, 8);
      text('PULAU KOMODO', 1020, horizonY + 140, 15, '#fff', 'center', true);
    }
    // Runway strip painted on the ground near the bottom when close.
  }

  function drawRingsAndRunway(state, horizonY) {
    const landing = state.ringIndex >= state.rings.length;
    for (let k = 0; k < 3; k += 1) {
      const ring = state.rings[state.ringIndex + k];
      if (!ring) break;
      const d = ring.dist - state.dist;
      if (d <= 0 || d > 6) continue;
      const size = 26 + 150 / (d + 0.4);
      const x = clamp(640 + headingDiff(ring.heading, state.heading) * 9, 90, 1190);
      const y = clamp(horizonY - 60 - ((ring.alt - state.alt) / 45) * (1.6 / (d + 0.6)), 90, horizonY + 60);
      ctx.save();
      ctx.globalAlpha = k === 0 ? 1 : 0.55;
      ctx.strokeStyle = ring.passed ? PALETTE.ringPass : PALETTE.ring;
      ctx.lineWidth = k === 0 ? 7 : 4;
      ctx.shadowColor = PALETTE.ring;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.ellipse(x, y, size, size * 0.72, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff';
      text(`RING ${state.ringIndex + k + 1}`, x, y - size * 0.72 - 8, 15, '#fff', 'center', true);
      text(`${fmt(ring.alt)} ft · ${d.toFixed(1)} nm`, x, y + size * 0.72 + 18, 13, '#fff', 'center');
      ctx.restore();
    }
    if (landing) {
      const d = state.runwayDist - state.dist;
      if (d > -0.2 && d < 7) {
        const wNear = clamp(560 / (d + 0.25), 60, 560);
        const wFar = wNear * 0.22;
        const cx = clamp(640 - state.lateral * 420, 200, 1080);
        const yTop = horizonY + 30;
        const yBot = Math.min(H - 150, horizonY + 30 + clamp(260 / (d + 0.4), 40, 260));
        ctx.fillStyle = PALETTE.runway;
        ctx.beginPath();
        ctx.moveTo(cx - wFar, yTop);
        ctx.lineTo(cx + wFar, yTop);
        ctx.lineTo(cx + wNear, yBot);
        ctx.lineTo(cx - wNear, yBot);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.setLineDash([14, 12]);
        ctx.beginPath();
        ctx.moveTo(cx, yTop);
        ctx.lineTo(cx, yBot);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = PALETTE.gold;
        for (let i = -3; i <= 3; i += 1) {
          ctx.beginPath();
          ctx.arc(cx + i * (wNear / 3.4), yBot - 6, 5, 0, Math.PI * 2);
          ctx.fill();
        }
        text(`RUNWAY · ${d.toFixed(1)} nm — HDG ${String(Math.round(((state.runwayHeading % 360) + 360) % 360)).padStart(3, '0')}°`, cx, yTop - 12, 16, '#fff', 'center', true);
      }
    }
  }

  function drawPlane(state) {
    const px = 640;
    const py = 300 + state.pitch * 1.2;
    const bank = clamp(state.roll * 0.5, -24, 24);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate((bank * Math.PI) / 180);
    // Shadow on the ground far below.
    ctx.restore();
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate((bank * Math.PI) / 180);
    ctx.fillStyle = '#dfe7ee';
    ctx.beginPath();
    ctx.moveTo(0, -34);
    ctx.quadraticCurveTo(12, -10, 10, 18);
    ctx.lineTo(6, 34);
    ctx.lineTo(-6, 34);
    ctx.lineTo(-10, 18);
    ctx.quadraticCurveTo(-12, -10, 0, -34);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = state.aircraft.color;
    ctx.fillRect(-7, -30, 14, 22);
    // Wings + tailplane.
    ctx.fillStyle = '#b9c6d2';
    ctx.beginPath();
    ctx.moveTo(-8, -2);
    ctx.lineTo(-86, 16);
    ctx.lineTo(-86, 26);
    ctx.lineTo(-8, 12);
    ctx.closePath();
    ctx.moveTo(8, -2);
    ctx.lineTo(86, 16);
    ctx.lineTo(86, 26);
    ctx.lineTo(8, 12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#8fa2b2';
    ctx.fillRect(-26, 30, 52, 7);
    // Cockpit windows + nav lights.
    ctx.fillStyle = '#16324a';
    ctx.beginPath();
    ctx.ellipse(0, -22, 6, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    const blink = Math.floor(state.elapsed * 2) % 2 === 0;
    ctx.fillStyle = blink ? '#ff3b30' : '#7a1d18';
    ctx.beginPath();
    ctx.arc(-88, 20, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = blink ? '#37c25f' : '#1d5c2e';
    ctx.beginPath();
    ctx.arc(88, 20, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Propeller blur for the prop planes.
    if (state.aircraft.id !== 'garuda') {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(px, py - 36, 4, 16, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawWeather(state) {
    if (state.weather.rain) {
      ctx.strokeStyle = 'rgba(200,220,240,0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 60; i += 1) {
        const x = (i * 173 + state.elapsed * 700) % (W + 40) - 20;
        const y = (i * 97 + state.elapsed * 900) % (H - 160);
        ctx.moveTo(x, y);
        ctx.lineTo(x - 8, y + 22);
      }
      ctx.stroke();
    }
    if (state.weather.fog > 0) {
      ctx.fillStyle = `rgba(220,230,235,${state.weather.fog * 0.55})`;
      ctx.fillRect(0, 0, W, 560);
    }
    if (state.weatherId === 'storm' && Math.floor(state.elapsed * 0.7) % 9 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(0, 0, W, 560);
    }
  }

  function gauge(x, y, r, label, value, unit, color) {
    ctx.fillStyle = '#0d1a24';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3a5a72';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = color || '#7dffb0';
    ctx.shadowColor = color || '#7dffb0';
    ctx.shadowBlur = 10;
    text(value, x, y + 2, r > 40 ? 20 : 16, color || '#7dffb0', 'center', true);
    ctx.shadowBlur = 0;
    text(label, x, y + r + 14, 11, '#9db8c9', 'center', true);
    text(unit, x, y + r + 26, 10, '#6b8698', 'center');
  }

  function drawCockpit(state) {
    // Panel.
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(0, 556, W, 164);
    ctx.fillStyle = PALETTE.panelEdge;
    ctx.fillRect(0, 556, W, 3);
    // Artificial horizon.
    const hx = 130;
    const hy = 632;
    ctx.save();
    ctx.beginPath();
    ctx.arc(hx, hy, 52, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#4da3e8';
    ctx.fillRect(hx - 52, hy - 52, 104, 52);
    ctx.fillStyle = '#7a5a34';
    ctx.fillRect(hx - 52, hy, 104, 52);
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate((-state.roll * Math.PI) / 180);
    ctx.translate(0, state.pitch * 1.5);
    ctx.fillStyle = '#4da3e8';
    ctx.fillRect(-60, -60, 120, 60);
    ctx.fillStyle = '#7a5a34';
    ctx.fillRect(-60, 0, 120, 60);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-60, 0);
    ctx.lineTo(60, 0);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#f2c94c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(hx - 26, hy);
    ctx.lineTo(hx + 26, hy);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#3a5a72';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hx, hy, 52, 0, Math.PI * 2);
    ctx.stroke();
    text('ATTITUDE', hx, hy + 70, 11, '#9db8c9', 'center', true);
    // Dials: ALT / SPD / VSI / FUEL.
    gauge(290, 630, 46, 'ALTITUDE', fmt(state.alt), 'ft', '#7dffb0');
    gauge(420, 630, 46, 'AIRSPEED', fmt(state.speed), 'kt', '#7dd7ff');
    gauge(550, 630, 40, 'VERT SPEED', `${state.climb >= 0 ? '+' : ''}${fmt(state.climb)}`, 'fpm', state.climb >= 0 ? '#7dffb0' : '#ffb14d');
    // Compass tape.
    const cx0 = 695;
    ctx.fillStyle = '#0d1a24';
    rr(cx0 - 95, 592, 190, 44, 8);
    ctx.fill();
    ctx.strokeStyle = '#3a5a72';
    ctx.stroke();
    ctx.save();
    rr(cx0 - 95, 592, 190, 44, 8);
    ctx.clip();
    for (let d = -60; d <= 60; d += 10) {
      const hdg = (Math.round(state.heading / 10) * 10 + d + 360) % 360;
      const x = cx0 + d * 3.2 - ((state.heading % 10) * 3.2);
      text(String(hdg).padStart(3, '0'), x, 622, 13, d === 0 ? '#f2c94c' : '#9db8c9', 'center', d === 0);
      ctx.strokeStyle = '#5a7a90';
      ctx.beginPath();
      ctx.moveTo(x, 592);
      ctx.lineTo(x, 602);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#f2c94c';
    ctx.beginPath();
    ctx.moveTo(cx0, 592);
    ctx.lineTo(cx0 - 6, 584);
    ctx.lineTo(cx0 + 6, 584);
    ctx.closePath();
    ctx.fill();
    text('HEADING', cx0, 654, 11, '#9db8c9', 'center', true);
    text(`${String(Math.round(state.heading)).padStart(3, '0')}°`, cx0, 676, 13, '#f2c94c', 'center', true);
    // Fuel gauge + throttle.
    const fx = 860;
    ctx.fillStyle = '#0d1a24';
    rr(fx - 60, 592, 120, 76, 8);
    ctx.fill();
    ctx.strokeStyle = '#3a5a72';
    ctx.stroke();
    const fuelFrac = state.fuel / state.fuelMax;
    ctx.fillStyle = fuelFrac < 0.2 ? '#ff5a4e' : '#37c25f';
    ctx.fillRect(fx - 50, 656, 100 * fuelFrac, 10);
    ctx.strokeStyle = '#3a5a72';
    ctx.strokeRect(fx - 50, 656, 100, 10);
    text('FUEL', fx, 612, 12, '#9db8c9', 'center', true);
    text(`${Math.round(state.fuel)} / ${Math.round(state.fuelMax)}`, fx, 632, 16, fuelFrac < 0.2 ? '#ff5a4e' : '#7dffb0', 'center', true);
    // Throttle lever.
    const tx = 950;
    ctx.fillStyle = '#0d1a24';
    rr(tx - 14, 592, 28, 76, 8);
    ctx.fill();
    ctx.fillStyle = '#f2c94c';
    ctx.fillRect(tx - 8, 660 - state.throttle * 60, 16, 10);
    text('THR', tx, 686, 11, '#9db8c9', 'center', true);
    // Warning lamps.
    const lamps = [
      { on: state.fuel < 20, label: 'LOW FUEL', color: '#ff5a4e' },
      { on: state.stall, label: 'STALL', color: '#ff5a4e' },
      { on: state.flaps, label: 'FLAPS', color: '#7dd7ff' },
      { on: state.weatherId === 'storm', label: 'STORM', color: '#ffb14d' },
    ];
    lamps.forEach((lamp, i) => {
      const lx = 1040 + i * 58;
      ctx.fillStyle = lamp.on ? lamp.color : '#22384a';
      ctx.shadowColor = lamp.on ? lamp.color : 'transparent';
      ctx.shadowBlur = lamp.on ? 12 : 0;
      ctx.beginPath();
      ctx.arc(lx, 622, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      text(lamp.label, lx, 652, 10, lamp.on ? lamp.color : '#5a7a90', 'center', true);
    });
    text(state.aircraft.name, 1150, 700, 13, '#9db8c9', 'center', true);
  }

  function drawHud(state, ui) {
    ctx.fillStyle = 'rgba(11,28,44,0.88)';
    ctx.fillRect(0, 0, W, 64);
    text('ALT', 24, 24, 12, '#9db8c9');
    text(`${fmt(state.alt)} ft`, 24, 50, 24, '#7dffb0', 'left', true);
    text('SPD', 190, 24, 12, '#9db8c9');
    text(`${fmt(state.speed)} kt`, 190, 50, 24, '#7dd7ff', 'left', true);
    text('HDG', 350, 24, 12, '#9db8c9');
    text(`${String(Math.round(state.heading)).padStart(3, '0')}°`, 350, 50, 24, '#f2c94c', 'left', true);
    const region = state.region;
    text(`${region.short} · ${region.note}`, 520, 26, 15, '#eaf6ff', 'left', true);
    const missionName = state.mission ? `M${state.mission.id} ${state.mission.name}` : state.mode === 'free' ? 'FREE FLIGHT' : state.mode === 'race' ? 'RING RACE' : 'LANDING CHALLENGE';
    text(missionName, 520, 50, 14, '#9db8c9');
    const next = state.rings[state.ringIndex];
    text(next ? `NEXT RING ${state.ringIndex + 1}/${state.rings.length} · ${fmt(next.alt)} ft` : state.ringIndex >= state.rings.length && state.rings.length ? 'LAND ON THE RUNWAY' : 'LAND ON THE RUNWAY', 880, 26, 14, '#fff', 'left', true);
    const t = Math.max(0, Math.ceil(state.timeLeft));
    text(state.mode === 'free' ? `TIME ${fmt(state.elapsed)}s` : `TIME ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, 880, 50, 16, t < 30 && state.mode !== 'free' ? '#ff5a4e' : '#eaf6ff', 'left', true);
    text(`🪙 ${state.bank + state.coins}`, 1120, 30, 18, '#f2c94c', 'left', true);
    text(`COMBO x${state.combo} · ${state.weather.label}`, 1120, 52, 13, '#9db8c9');
    if (state.message && state.messageT > 0) {
      ctx.fillStyle = 'rgba(11,28,44,0.85)';
      ctx.font = `700 16px ${FONT}`;
      const mw = ctx.measureText(state.message).width + 36;
      rr(640 - mw / 2, 78, mw, 34, 8);
      ctx.fill();
      text(state.message, 640, 101, 16, '#ffd94d', 'center', true);
    }
    if (ui && ui.best) text(`BEST ${fmt(ui.best)}`, 24, 84, 12, '#9db8c9');
  }

  function button(ui, id, x, y, w, h, label, active) {
    ctx.fillStyle = active ? '#f2c94c' : '#1d3a4f';
    rr(x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = active ? '#f2c94c' : '#3a5a72';
    ctx.lineWidth = 2;
    ctx.stroke();
    text(label, x + w / 2, y + h / 2 + 6, 17, active ? '#1a2a12' : '#eaf6ff', 'center', true);
    ui.rects[id] = { x, y, w, h };
  }

  function drawTitle(state, ui) {
    // Right-side panel so the live chase view stays visible.
    ctx.fillStyle = 'rgba(11,28,44,0.86)';
    rr(830, 76, 420, 568, 14);
    ctx.fill();
    ctx.strokeStyle = '#3a5a72';
    ctx.lineWidth = 2;
    ctx.stroke();
    text('NUSANTARA', 1040, 128, 34, '#f2c94c', 'center', true);
    text('SKY COURIER', 1040, 164, 34, '#eaf6ff', 'center', true);
    text('v1 · 7 islands · 12 missions · 3 aircraft', 1040, 190, 14, '#9db8c9', 'center');
    text('8 upgrades · 4 modes · 4 weather types', 1040, 210, 14, '#9db8c9', 'center');
    text('Fly the rings, deliver the cargo,', 1040, 244, 15, '#eaf6ff', 'center');
    text('land on the runway. Bromo to Raja Ampat.', 1040, 266, 15, '#eaf6ff', 'center');
    button(ui, 'campaign', 860, 292, 360, 46, '▶  CAMPAIGN  (12 missions)', true);
    button(ui, 'free', 860, 346, 175, 42, 'FREE FLIGHT');
    button(ui, 'race', 1045, 346, 175, 42, 'RING RACE');
    button(ui, 'landing', 860, 396, 360, 42, 'LANDING CHALLENGE');
    text('AIRCRAFT', 860, 470, 12, '#9db8c9');
    AIRCRAFT.forEach((ac, i) => {
      const owned = state.ownedAircraft.has(ac.id);
      const short = ac.name.split(' ')[0];
      button(ui, `aircraft:${ac.id}`, 860 + i * 122, 480, 116, 52, owned ? short : `${short} ${ac.cost}c`, state.aircraft.id === ac.id);
    });
    text('↑↓ pitch · ←→ turn · W/S throttle · Space flaps', 1040, 556, 13, '#9db8c9', 'center');
    text('Mouse drag steers · P pause · Enter start', 1040, 576, 13, '#9db8c9', 'center');
    text(`Coins in bank: ${state.bank}  ·  Missions unlocked: ${state.unlocked}/12`, 1040, 612, 13, '#f2c94c', 'center');
  }

  function drawOver(state, ui) {
    const landed = state.phase === 'landed';
    ctx.fillStyle = 'rgba(6,16,26,0.72)';
    ctx.fillRect(0, 0, W, 556);
    ctx.fillStyle = 'rgba(11,28,44,0.95)';
    rr(800, 84, 440, 470, 14);
    ctx.fill();
    ctx.strokeStyle = '#3a5a72';
    ctx.lineWidth = 2;
    ctx.stroke();
    text(landed ? 'MISSION COMPLETE' : state.phase === 'timeout' ? "TIME'S UP" : 'CRASHED', 1020, 132, 28, landed ? '#37c25f' : '#ff5a4e', 'center', true);
    if (landed) {
      const stars = '★'.repeat(state.stars) + '☆'.repeat(3 - state.stars);
      text(stars, 1020, 176, 34, '#f2c94c', 'center');
    }
    const rows = [
      ['Rings', `${state.ringsPassed}/${state.rings.length || '—'}`],
      ['Time', `${fmt(state.elapsed)}s${state.mode === 'campaign' ? ` · ${Math.ceil(state.timeLeft)}s left` : ''}`],
      ['Best combo', `x${state.bestCombo}`],
      ['Coins earned', `+${state.coins}`],
      ['Bank', `${state.bank}`],
      ['Accuracy', state.rings.length ? `${Math.round((state.ringsPassed / state.rings.length) * 100)}%` : '—'],
    ];
    rows.forEach((r, i) => {
      text(r[0], 830, 212 + i * 28, 15, '#9db8c9');
      text(r[1], 1210, 212 + i * 28, 15, '#eaf6ff', 'right', true);
    });
    text('UPGRADE SHOP', 830, 392, 13, '#f2c94c', 'left', true);
    // Shop rows (4 shown here; full shop on the shop screen).
    UPGRADES.slice(0, 4).forEach((up, i) => {
      const owned = state.upgrades.has(up.id);
      const y = 400 + i * 26;
      text(`${owned ? '✓' : '○'} ${up.name} — ${up.desc}`, 830, y + 14, 13, owned ? '#37c25f' : '#eaf6ff');
      if (!owned) text(`${up.cost}c`, 1210, y + 14, 13, state.bank >= up.cost ? '#f2c94c' : '#5a7a90', 'right', true);
    });
    button(ui, 'next', 830, 508, 210, 40, landed ? 'NEXT MISSION ▶' : 'RETRY');
    button(ui, 'menu', 1050, 508, 180, 40, 'MENU');
    if (!landed) text(state.message, 1020, 470, 14, '#ffb14d', 'center');
  }

  function drawShop(state, ui) {
    ctx.fillStyle = 'rgba(6,16,26,0.8)';
    ctx.fillRect(0, 0, W, 556);
    ctx.fillStyle = 'rgba(11,28,44,0.97)';
    rr(300, 60, 680, 440, 14);
    ctx.fill();
    ctx.strokeStyle = '#3a5a72';
    ctx.stroke();
    text('UPGRADE SHOP', 640, 108, 28, '#f2c94c', 'center', true);
    text(`Bank: ${state.bank} coins — upgrades carry across missions`, 640, 134, 14, '#9db8c9', 'center');
    UPGRADES.forEach((up, i) => {
      const y = 156 + i * 38;
      const owned = state.upgrades.has(up.id);
      text(`${owned ? '✓ OWNED' : '○'} ${up.name}`, 330, y + 14, 15, owned ? '#37c25f' : '#eaf6ff', 'left', true);
      text(up.desc, 560, y + 14, 13, '#9db8c9');
      if (!owned) button(ui, `upgrade:${up.id}`, 850, y, 110, 30, `${up.cost} coins`, state.bank >= up.cost);
    });
    button(ui, 'menu', 540, 452, 200, 40, 'BACK TO MENU');
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(6,16,26,0.7)';
    ctx.fillRect(0, 0, W, 556);
    text('PAUSED', 640, 260, 44, '#eaf6ff', 'center', true);
    text('P resume · R restart · Esc menu', 640, 300, 16, '#9db8c9', 'center');
  }

  function draw(state, screen, ui) {
    ui.rects = ui.rects || {};
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b1c2c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    const horizonY = clamp(300 + state.pitch * 3, 190, 430);
    drawSky(state, horizonY);
    drawGround(state, horizonY);
    drawRingsAndRunway(state, horizonY);
    drawPlane(state);
    drawWeather(state);
    if (screen === SCREEN_TITLE) {
      drawHud(state, ui);
      drawCockpit(state);
      drawTitle(state, ui);
    } else if (screen === SCREEN_PAUSED) {
      drawHud(state, ui);
      drawCockpit(state);
      drawPaused();
    } else if (screen === SCREEN_OVER) {
      drawHud(state, ui);
      drawCockpit(state);
      drawOver(state, ui);
    } else if (screen === SCREEN_SHOP) {
      drawHud(state, ui);
      drawCockpit(state);
      drawShop(state, ui);
    } else {
      drawHud(state, ui);
      drawCockpit(state);
    }
  }

  return { draw, toLogical, resize };
}
