/**
 * UXP panel icon rect check.
 *
 * Paste this snippet into the UXP Developer Tool console for the loaded
 * com.imagen-ps.panel plugin. It asserts that key icons have non-zero
 * bounding rects, which catches the "inline SVG invisible in Photoshop"
 * class of bug.
 */

(function checkIconRects() {
  const checks = [
    { label: 'header history', selector: '.hdr .hdr-btn img' },
    { label: 'header settings', selector: '.hdr .hdr-btn:nth-child(3) img' },
    { label: 'composer add', selector: '.cmp-add img' },
    { label: 'composer model chevron', selector: '.cmp-chip img' },
    { label: 'composer send', selector: '.cmp-send img' },
    { label: 'provider card place-ps', selector: '.prov-actions .act-ico:first-child img' },
    { label: 'provider card regenerate', selector: '.prov-actions .act-ico:nth-child(2) img' },
    { label: 'provider card copy', selector: '.prov-actions .act-ico:nth-child(3) img' },
  ];

  const failures = [];
  const results = [];

  for (const check of checks) {
    const element = document.querySelector(check.selector);
    if (!element) {
      failures.push(`${check.label}: element not found (${check.selector})`);
      continue;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      failures.push(`${check.label}: rect ${rect.width}x${rect.height}`);
    }
    results.push(`${check.label}: ${rect.width}x${rect.height}`);
  }

  console.log('[icon-rect-check] results:');
  for (const result of results) {
    console.log(`  ${result}`);
  }

  if (failures.length > 0) {
    console.error('[icon-rect-check] failures:');
    for (const failure of failures) {
      console.error(`  ${failure}`);
    }
    return { ok: false, failures };
  }

  console.log('[icon-rect-check] all icons have non-zero rects');
  return { ok: true, results };
})();
