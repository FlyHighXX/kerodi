type ScrollToTopHandler = () => void;

let handler: ScrollToTopHandler | null = null;

/** Lets the Freerider tab bar listener ask the active screen to scroll to top. */
export function registerFreeriderScrollToTop(nextHandler: ScrollToTopHandler) {
  handler = nextHandler;
  return () => {
    if (handler === nextHandler) handler = null;
  };
}

export function scrollFreeriderToTop() {
  handler?.();
}
