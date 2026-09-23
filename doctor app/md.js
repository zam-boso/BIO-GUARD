/* ================================================================
   Minimal Markdown renderer for AI replies.

   Builds real DOM nodes instead of setting innerHTML, so model output
   can never inject markup into the app.

   Supports: headings, bullet and numbered lists, pipe tables,
   **bold**, *italic*, `code`, and blank-line paragraphs.
   ================================================================ */

(function (global) {
  const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|`[^`\n]+`)/g;

  // Turns "**bold** and `code`" into text/strong/em/code nodes.
  function inline(text) {
    const frag = document.createDocumentFragment();

    text.split(INLINE).forEach((part) => {
      if (!part) return;

      if ((part.startsWith("**") && part.endsWith("**") && part.length > 4) ||
          (part.startsWith("__") && part.endsWith("__") && part.length > 4)) {
        const b = document.createElement("strong");
        b.textContent = part.slice(2, -2);
        frag.appendChild(b);
      } else if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
        const i = document.createElement("em");
        i.textContent = part.slice(1, -1);
        frag.appendChild(i);
      } else if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
        const c = document.createElement("code");
        c.textContent = part.slice(1, -1);
        frag.appendChild(c);
      } else {
        frag.appendChild(document.createTextNode(part));
      }
    });

    return frag;
  }

  const isTableRow = (line) => line.trim().startsWith("|") && line.includes("|", 1);
  const isTableDivider = (line) => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes("-");

  function cells(line) {
    let row = line.trim();
    if (row.startsWith("|")) row = row.slice(1);
    if (row.endsWith("|")) row = row.slice(0, -1);
    // <br> inside a cell is a line break in many model outputs
    return row.split("|").map((c) => c.trim().replace(/<br\s*\/?>/gi, " "));
  }

  function renderMarkdown(text) {
    const out = document.createDocumentFragment();
    const lines = String(text == null ? "" : text).replace(/\r\n/g, "\n").split("\n");
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (!line.trim()) {
        i++;
        continue;
      }

      // Table: header row, divider, then body rows
      if (isTableRow(line) && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
        const table = document.createElement("table");
        table.className = "md-table";

        const thead = document.createElement("thead");
        const headRow = document.createElement("tr");
        cells(line).forEach((c) => {
          const th = document.createElement("th");
          th.appendChild(inline(c));
          headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");
        i += 2;
        while (i < lines.length && isTableRow(lines[i])) {
          const tr = document.createElement("tr");
          cells(lines[i]).forEach((c) => {
            const td = document.createElement("td");
            td.appendChild(inline(c));
            tr.appendChild(td);
          });
          tbody.appendChild(tr);
          i++;
        }
        table.appendChild(tbody);
        out.appendChild(table);
        continue;
      }

      // Heading
      const heading = /^(#{1,6})\s+(.*)$/.exec(line);
      if (heading) {
        const h = document.createElement("div");
        h.className = "md-heading md-h" + heading[1].length;
        h.appendChild(inline(heading[2]));
        out.appendChild(h);
        i++;
        continue;
      }

      // Horizontal rule
      if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
        out.appendChild(document.createElement("hr"));
        i++;
        continue;
      }

      // Lists
      const bullet = /^\s*[-*+]\s+(.*)$/;
      const numbered = /^\s*\d+[.)]\s+(.*)$/;
      if (bullet.test(line) || numbered.test(line)) {
        const ordered = !bullet.test(line);
        const list = document.createElement(ordered ? "ol" : "ul");
        list.className = "md-list";

        while (i < lines.length) {
          const m = ordered ? numbered.exec(lines[i]) : bullet.exec(lines[i]);
          if (!m) break;
          const li = document.createElement("li");
          li.appendChild(inline(m[1]));
          list.appendChild(li);
          i++;
        }
        out.appendChild(list);
        continue;
      }

      // Paragraph: consecutive non-blank, non-structural lines
      const para = document.createElement("p");
      para.className = "md-p";
      let first = true;
      while (
        i < lines.length &&
        lines[i].trim() &&
        !isTableRow(lines[i]) &&
        !/^(#{1,6})\s+/.test(lines[i]) &&
        !bullet.test(lines[i]) &&
        !numbered.test(lines[i])
      ) {
        if (!first) para.appendChild(document.createElement("br"));
        para.appendChild(inline(lines[i]));
        first = false;
        i++;
      }
      out.appendChild(para);
    }

    return out;
  }

  global.renderMarkdown = renderMarkdown;
})(window);
