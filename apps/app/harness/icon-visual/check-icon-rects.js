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
    { label: 'header history', selector: '[data-testid="main-history-button"] [data-icon-name="history"]' },
    { label: 'header settings', selector: '[data-testid="main-providers-button"] [data-icon-name="settings"]' },
    { label: 'composer add', selector: '.cmp-add [data-icon-name="add"]' },
    { label: 'composer model chevron', selector: '.cmp-chip [data-icon-name="chevron-down"]' },
    { label: 'composer send', selector: '.cmp-send [data-icon-name="send"]' },
    { label: 'provider card place-ps', selector: '.prov-actions .act-ico:first-child [data-icon-name="place-ps"]' },
    { label: 'provider card regenerate', selector: '.prov-actions .act-ico:nth-child(2) [data-icon-name="regenerate"]' },
    { label: 'provider card copy', selector: '.prov-actions .act-ico:nth-child(3) [data-icon-name="copy"]' },
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
