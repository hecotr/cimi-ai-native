export const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const page = (title: string, body: string, styles: string): string =>
  `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>${styles}</style>
</head>
<body>
  <a class="skip" href="#content">Skip to content</a>
  <header>
    <a href="/">CimiLoop Workbench</a>
    <nav aria-label="Workbench">
      <a href="/">Home</a>
    </nav>
  </header>
  <main id="content" role="main">${body}</main>
</body>
</html>
`;
