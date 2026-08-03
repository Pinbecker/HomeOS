export function navigateInApp(to: string) {
  window.dispatchEvent(new CustomEvent<string>('homeos:navigate', { detail: to }))
}
