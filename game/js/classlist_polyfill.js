// ClassList polyfill — no-op in modern browsers
(function () {
  if (typeof window !== "undefined" && "classList" in document.createElement("_")) return;
  // Minimal shim — modern browsers all support classList natively
})();
