/**
 * Gather Embed Script  v1.0
 *
 * Drop this single <script> tag into any website to embed a Gather widget
 * as a responsive iframe with no build step required.
 *
 * Usage:
 *   <script
 *     src="https://your-gather-domain.com/embed.js"
 *     data-gather-widget="visitor-form"
 *     data-gather-church="sample-community"
 *     data-gather-width="100%"
 *     data-gather-height="560px"
 *     data-gather-border-radius="12px">
 *   </script>
 *
 * Widget types:  visitor-form | groups | events
 *
 * Optional attributes:
 *   data-gather-width            Default: "100%"
 *   data-gather-height           Default: "560px"
 *   data-gather-border-radius    Default: "8px"
 *   data-gather-base-url         Override origin (defaults to script src origin)
 */
;(function () {
  'use strict';

  function getScriptOrigin() {
    var scripts = document.getElementsByTagName('script');
    var thisScript = scripts[scripts.length - 1];
    var src = thisScript.src;
    try {
      var url = new URL(src);
      return url.origin;
    } catch (_) {
      return window.location.origin;
    }
  }

  function createWidget(script) {
    var widget  = script.getAttribute('data-gather-widget');
    var church  = script.getAttribute('data-gather-church') || '';
    var width   = script.getAttribute('data-gather-width')  || '100%';
    var height  = script.getAttribute('data-gather-height') || '560px';
    var radius  = script.getAttribute('data-gather-border-radius') || '8px';
    var baseUrl = script.getAttribute('data-gather-base-url') || getScriptOrigin();

    if (!widget) {
      console.warn('[Gather] data-gather-widget is required.');
      return;
    }

    var validWidgets = ['visitor-form', 'groups', 'events'];
    if (validWidgets.indexOf(widget) === -1) {
      console.warn('[Gather] Unknown widget type: ' + widget + '. Valid types: ' + validWidgets.join(', '));
      return;
    }

    var src = baseUrl + '/embed/' + widget;
    if (church) src += '?church=' + encodeURIComponent(church);

    var iframe = document.createElement('iframe');
    iframe.src    = src;
    iframe.title  = 'Gather ' + widget + ' widget';
    iframe.setAttribute('width', width);
    iframe.setAttribute('height', height);
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('scrolling', 'auto');
    iframe.setAttribute('allow', 'clipboard-write');
    iframe.setAttribute('loading', 'lazy');
    iframe.style.cssText = [
      'display:block',
      'width:' + width,
      'height:' + height,
      'border:none',
      'border-radius:' + radius,
      'overflow:hidden',
    ].join(';');

    // Replace the script tag with the iframe (avoids layout shift)
    if (script.parentNode) {
      script.parentNode.insertBefore(iframe, script);
      script.parentNode.removeChild(script);
    } else {
      document.currentScript
        ? document.currentScript.insertAdjacentElement('afterend', iframe)
        : document.body.appendChild(iframe);
    }
  }

  function init() {
    // Find all Gather embed scripts on the page
    var scripts = document.querySelectorAll('script[data-gather-widget]');
    for (var i = 0; i < scripts.length; i++) {
      createWidget(scripts[i]);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
