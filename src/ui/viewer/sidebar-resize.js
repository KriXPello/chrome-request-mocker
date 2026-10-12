const SIDEBAR_WIDTH_KEY = "response-viewer-sidebar-width";

export function initializeSidebarResize({ layout, sidebar, handle, onResize }) {
  let drag = null;

  try {
    const savedWidth = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    if (Number.isFinite(savedWidth) && savedWidth > 0) {
      layout.style.setProperty("--sidebar-width", `${savedWidth}px`);
    }
  } catch (error) {
    console.warn("Could not restore the response viewer sidebar width.", error);
  }

  function widthLimits() {
    const style = getComputedStyle(layout);
    const min = parseFloat(style.getPropertyValue("--sidebar-min-width"));
    const responseWidth = parseFloat(style.getPropertyValue("--response-min-width"));
    const handleWidth = parseFloat(style.getPropertyValue("--resize-handle-width"));
    return { min, max: Math.max(min, layout.clientWidth - responseWidth - handleWidth) };
  }

  function setWidth(width) {
    const { min, max } = widthLimits();
    layout.style.setProperty("--sidebar-width", `${Math.min(max, Math.max(min, width))}px`);
  }

  function updateHandle() {
    const { min, max } = widthLimits();
    handle.setAttribute("aria-valuemin", String(min));
    handle.setAttribute("aria-valuemax", String(max));
    handle.setAttribute("aria-valuenow", String(Math.round(sidebar.getBoundingClientRect().width)));
  }

  function saveWidth() {
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(Math.round(sidebar.getBoundingClientRect().width)));
    } catch (error) {
      console.warn("Could not save the response viewer sidebar width.", error);
    }
  }

  handle.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0 || drag) return;
    event.preventDefault();
    handle.focus({ preventScroll: true });
    drag = { pointerId: event.pointerId, x: event.clientX, width: sidebar.getBoundingClientRect().width };
    handle.setPointerCapture(event.pointerId);
    layout.classList.add("resizing");
  });

  handle.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    setWidth(drag.width + event.clientX - drag.x);
  });

  function endDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const widthChanged = Math.round(sidebar.getBoundingClientRect().width) !== Math.round(drag.width);
    drag = null;
    layout.classList.remove("resizing");
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    if (widthChanged) saveWidth();
  }

  handle.addEventListener("pointerup", endDrag);
  handle.addEventListener("pointercancel", endDrag);
  handle.addEventListener("lostpointercapture", endDrag);
  handle.addEventListener("keydown", (event) => {
    const width = sidebar.getBoundingClientRect().width;
    switch (event.key) {
      case "ArrowLeft":
        setWidth(width - 20);
        break;
      case "ArrowRight":
        setWidth(width + 20);
        break;
      case "Home":
        setWidth(widthLimits().min);
        break;
      case "End":
        setWidth(widthLimits().max);
        break;
      default:
        return;
    }
    event.preventDefault();
    saveWidth();
  });

  const observer = new ResizeObserver(() => {
    updateHandle();
    onResize();
  });
  observer.observe(layout);
  observer.observe(sidebar);
  updateHandle();
}
