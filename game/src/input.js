// Keyboard + mouse input. Keys are polled every frame by main.js; clicks are
// delivered as {x, y} in logical coordinates for the renderer's button rects.
export function createInput(canvas, toLogical) {
  const keys = new Set();
  const clicks = [];
  let drag = null; // {x, y} logical while the mouse is held down
  let dragStart = null;

  function key(e) {
    return e.key.toLowerCase();
  }
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    keys.add(key(e));
  });
  window.addEventListener('keyup', (e) => keys.delete(key(e)));
  canvas.addEventListener('mousedown', (e) => {
    const p = toLogical(e.clientX, e.clientY);
    drag = p;
    dragStart = p;
    clicks.push(p);
  });
  window.addEventListener('mousemove', (e) => {
    if (drag) drag = toLogical(e.clientX, e.clientY);
  });
  window.addEventListener('mouseup', () => { drag = null; dragStart = null; });

  // Flight controls for this frame: pitch +climb, roll +right, throttle 0..1.
  function flight(currentThrottle) {
    let pitch = 0;
    let roll = 0;
    if (keys.has('arrowup') || keys.has('w')) pitch += 1;
    if (keys.has('arrowdown') || keys.has('s')) pitch -= 1;
    if (keys.has('arrowleft') || keys.has('a')) roll -= 1;
    if (keys.has('arrowright') || keys.has('d')) roll += 1;
    if (drag && dragStart) {
      roll += (drag.x - dragStart.x) / 120;
      pitch -= (drag.y - dragStart.y) / 120;
    }
    let throttle = currentThrottle;
    if (keys.has('shift')) throttle = Math.min(1, throttle + 0.02);
    if (keys.has('control')) throttle = Math.max(0, throttle - 0.02);
    return {
      pitch: Math.max(-1, Math.min(1, pitch)),
      roll: Math.max(-1, Math.min(1, roll)),
      throttle,
      flaps: keys.has(' '),
    };
  }
  function takeClicks() {
    return clicks.splice(0, clicks.length);
  }
  function pressed(k) {
    if (keys.has(k)) {
      keys.delete(k);
      return true;
    }
    return false;
  }
  return { keys, flight, takeClicks, pressed };
}
export function inRect(p, r) {
  return r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}
