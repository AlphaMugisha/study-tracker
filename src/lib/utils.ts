import { createCn } from "cn/config";

/**
 * `cn` with StudyFlow's custom font sizes registered.
 *
 * Without this, tailwind-merge has no way to know `text-statement` is a
 * font-size rather than a colour, so it treats it as conflicting with
 * `text-ink` and silently drops one of them -- `cn("text-eyebrow", "text-ink")`
 * was emitting just `text-ink`, which quietly killed the type scale anywhere a
 * size and a colour were merged in the same call.
 *
 * Every custom size in `globals.css` under `--text-*` must be listed here.
 */
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "eyebrow",
            "statement",
            "greeting",
            "count",
            "headline",
            "display",
            "section",
          ],
        },
      ],
    },
  },
});
