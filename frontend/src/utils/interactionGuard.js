const DEFAULT_CLICK_COOLDOWN_MS = 650;
const DEFAULT_SUBMIT_COOLDOWN_MS = 1000;

let cleanupFn = null;

export function installInteractionGuard({
  clickCooldownMs = DEFAULT_CLICK_COOLDOWN_MS,
  submitCooldownMs = DEFAULT_SUBMIT_COOLDOWN_MS,
} = {}) {
  if (cleanupFn) {
    return cleanupFn;
  }

  if (window.__sgcgInteractionGuardInstalled) {
    return () => {};
  }

  const lastClickByElement = new WeakMap();
  const lastSubmitByForm = new WeakMap();

  const clickHandler = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const button = target.closest('button');
    if (!button) return;
    if (button.disabled) return;

    const now = Date.now();
    const last = lastClickByElement.get(button) || 0;
    if (now - last < clickCooldownMs) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    lastClickByElement.set(button, now);
  };

  const submitHandler = (event) => {
    const form = event.target instanceof HTMLFormElement ? event.target : null;
    if (!form) return;

    const now = Date.now();
    const last = lastSubmitByForm.get(form) || 0;
    if (now - last < submitCooldownMs) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    lastSubmitByForm.set(form, now);
  };

  document.addEventListener('click', clickHandler, true);
  document.addEventListener('submit', submitHandler, true);

  window.__sgcgInteractionGuardInstalled = true;

  cleanupFn = () => {
    document.removeEventListener('click', clickHandler, true);
    document.removeEventListener('submit', submitHandler, true);
    window.__sgcgInteractionGuardInstalled = false;
    cleanupFn = null;
  };

  return cleanupFn;
}
