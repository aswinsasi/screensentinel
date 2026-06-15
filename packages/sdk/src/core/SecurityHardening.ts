export class SecurityHardening {
  private styleElement: HTMLStyleElement | null = null;

  activate(): void {
    const css = `
      @media print {
        [data-ss-protected] {
          opacity: 1 !important;
          visibility: visible !important;
          display: block !important;
        }
      }
    `;
    this.styleElement = document.createElement('style');
    this.styleElement.textContent = css;
    this.styleElement.setAttribute('data-ss-security', '1');
    document.head.appendChild(this.styleElement);
  }

  deactivate(): void {
    this.styleElement?.remove();
    this.styleElement = null;
  }
}
