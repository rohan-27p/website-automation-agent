// The Set-of-Marks routine runs INSIDE the page. We ship it as a string (an IIFE
// expression) rather than a function reference so the tsx/esbuild bundler does
// not inject its `__name` keep-names helper into the serialized code — that
// helper is undefined in the browser and would throw `__name is not defined`.
//
// It: clears any previous marks/overlay, finds visible interactive elements,
// numbers them, draws a numbered pink overlay (visible in the screenshot), and
// returns one record per element.

export const SET_OF_MARKS_SCRIPT = `(() => {
  var OVERLAY_ID = "__som_overlay__";
  var prev = document.getElementById(OVERLAY_ID);
  if (prev) prev.remove();
  var marked = document.querySelectorAll("[data-mark]");
  for (var m = 0; m < marked.length; m++) marked[m].removeAttribute("data-mark");

  var overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647;";
  document.body.appendChild(overlay);

  var selector = [
    "a[href]","button","input","textarea","select",
    "[role=button]","[role=link]","[role=textbox]","[role=checkbox]",
    "[role=radio]","[role=combobox]","[role=menuitem]","[role=tab]",
    "[contenteditable='']","[contenteditable='true']","[onclick]","[tabindex]"
  ].join(",");

  function isVisible(el) {
    var style = window.getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    return r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
  }

  function labelFor(el) {
    var fromLabels = el.labels && el.labels[0] && el.labels[0].textContent ? el.labels[0].textContent : "";
    var raw = el.getAttribute("aria-label") || fromLabels || el.placeholder || el.innerText ||
      el.getAttribute("name") || el.getAttribute("alt") || el.getAttribute("title") || el.getAttribute("value") || "";
    return String(raw).replace(/\\s+/g, " ").trim().slice(0, 120);
  }

  var results = [];
  var seen = [];
  var id = 1;
  var nodes = document.querySelectorAll(selector);
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    if (seen.indexOf(el) !== -1 || !isVisible(el)) continue;
    seen.push(el);
    if (el.disabled) continue;
    var type = (el.getAttribute("type") || el.tagName.toLowerCase()).toLowerCase();
    if (type === "hidden") continue;

    var rect = el.getBoundingClientRect();
    el.setAttribute("data-mark", String(id));

    var badge = document.createElement("div");
    badge.style.cssText = "position:absolute;left:" + rect.left + "px;top:" + rect.top + "px;width:" +
      rect.width + "px;height:" + rect.height + "px;outline:2px solid #ff007f;background:rgba(255,0,127,0.08);box-sizing:border-box;";
    var tag = document.createElement("span");
    tag.textContent = String(id);
    tag.style.cssText = "position:absolute;left:0;top:-2px;transform:translateY(-100%);background:#ff007f;color:#fff;font:bold 11px monospace;padding:0 3px;border-radius:2px;";
    badge.appendChild(tag);
    overlay.appendChild(badge);

    results.push({
      id: id,
      tag: el.tagName.toLowerCase(),
      type: type,
      label: labelFor(el),
      value: el.value || undefined,
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
      box: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    });
    id++;
  }
  return results;
})()`;
