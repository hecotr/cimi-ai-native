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
  <header><a href="/">CimiLoop Workbench</a></header>
  <main>${body}</main>
</body>
</html>
`;
