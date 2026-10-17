export function navigate(path:string) {
  // Next App Router integrates native history updates with usePathname.
  window.history.pushState(null,'',path);
  window.scrollTo(0,0);
}
