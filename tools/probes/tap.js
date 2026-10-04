// Tap probe: drives a real pointer sequence on the map and checks the country screen opens.
//   python tools/smoke.py --eval-file tools/probes/tap.js

var $ = function (id) { return document.getElementById(id); }, out = {};
function isOpen() { return $("countryModal").classList.contains("open"); }
function closeIt() { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); }
$("viewMap").click();
var svg = $("mapSvg"), el = document.querySelector('#mapSvg .country[data-iso="FR"]');
var b = el.getBoundingClientRect(), x = b.left + b.width / 2, y = b.top + b.height / 2;
// a real mouse under pointer capture: down on the shape, up and click delivered to the svg
el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y, pointerId: 1, button: 0, isPrimary: true }));
svg.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: x + 1, clientY: y, pointerId: 1, button: 0, isPrimary: true }));
svg.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: x + 1, clientY: y }));
out.realTap = { open: isOpen(), name: $("cmName").textContent }; closeIt();
// a drag: down on the shape, up far away
el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y, pointerId: 1, button: 0, isPrimary: true }));
svg.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: x + 40, clientY: y + 30, pointerId: 1, button: 0, isPrimary: true }));
svg.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: x + 40, clientY: y + 30, pointerId: 1, button: 0, isPrimary: true }));
svg.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: x + 40, clientY: y + 30 }));
out.dragOpens = isOpen(); closeIt(); var t0 = performance.now(); while (performance.now() - t0 < 600) {}
// a synthetic click straight on the shape (tests, keyboard) still works, once
el.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: x, clientY: y }));
out.directClick = isOpen(); closeIt();
// a marker tap
var m = document.querySelector('#mapSvg .marker[data-iso="SG"]') || document.querySelector('#mapSvg .marker[data-iso]'), mb = m.getBoundingClientRect(), mx = mb.left + 2, my = mb.top + 2;
m.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: mx, clientY: my, pointerId: 1, button: 0, isPrimary: true }));
svg.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: mx, clientY: my, pointerId: 1, button: 0, isPrimary: true }));
svg.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: mx, clientY: my }));
out.markerTap = { open: isOpen(), name: $("cmName").textContent }; closeIt();
out.errors = window.__smoke.errors;
return out;
