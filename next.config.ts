import type { NextConfig } from "next";

import { MAX_UPLOAD_BYTES } from "./src/lib/timetable/import-constants";

const nextConfig: NextConfig = {
  experimental: {
    /*
      A Server Action's request body is capped at 1MB by default, and a photo
      of a timetable is routinely bigger than that. The cap is checked before
      the action runs, so `analyseTimetableAction` never saw the request and
      never got to say "that image is too big" — the upload page crashed with
      "Body exceeded 1 MB limit" instead, which names no file and suggests no
      fix to the person holding the phone.

      Derived from MAX_UPLOAD_BYTES rather than written as "4mb" so the two
      cannot drift apart. The limit applies to the raw body, so it has to
      clear the image plus the multipart boundaries, part headers and the
      other fields; the docs suggest 10–20KB for that, and 256KB is cheap
      insurance against a long filename or a verbose boundary.
    */
    serverActions: { bodySizeLimit: MAX_UPLOAD_BYTES + 256_000 },
  },
};

export default nextConfig;
