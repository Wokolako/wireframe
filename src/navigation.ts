export function navigate(path:string) {
  if (typeof window !== 'undefined') {
    window.history.pushState(null,'',path);
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.scrollTo(0,0);
  }
}
