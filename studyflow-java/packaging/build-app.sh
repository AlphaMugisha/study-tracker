#!/usr/bin/env bash
#
# Build StudyFlow into a double-clickable Windows app, and put a shortcut on
# the Desktop.
#
#   bash packaging/build-app.sh
#
# Produces dist/StudyFlow/StudyFlow.exe with a trimmed Java runtime inside it,
# so the machine it runs on needs no JDK.
#
# Three things worth knowing:
#
#   --type app-image, not msi.   An installer would need the WiX toolset
#                                installed first. An app-image is a directory
#                                with an .exe in it and needs nothing, which
#                                is the right trade for one machine.
#
#   The anon key is baked in.    Same key the website inlines into its own
#                                bundle. It is public by design and bounded
#                                entirely by RLS. The service role key is
#                                never read by this script.
#
#   The Desktop is read from     It is OneDrive-redirected on this machine,
#   the shell, not assumed.      so guessing $HOME/Desktop would put the
#                                shortcut somewhere she never looks.

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
ENV_FILE="$ROOT/../.env.local"
STAGE="$ROOT/ui/build/stage"
DIST="$ROOT/dist"
APP_NAME="StudyFlow"

say() { printf '\n==> %s\n' "$1"; }

# ---------------------------------------------------------------------------
say "Baking the Supabase project into the app"
# ---------------------------------------------------------------------------
# Only ever the two values the browser already gets.

SYNC_RES="$ROOT/sync/src/main/resources/flow/study/sync"
mkdir -p "$SYNC_RES"

if [ -f "$ENV_FILE" ]; then
    URL=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '\r')
    ANON=$(grep -E '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '\r')
else
    URL=""
    ANON=""
fi

{
    echo "# Written by packaging/build-app.sh from .env.local."
    echo "# The anon key is public by design: it is inlined into the web bundle"
    echo "# too, and every table it can reach is bounded by Row Level Security."
    echo "NEXT_PUBLIC_SUPABASE_URL=$URL"
    echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON"
} > "$SYNC_RES/supabase.properties"

if [ -z "$URL" ] || [ -z "$ANON" ]; then
    echo "    WARNING: no Supabase values found in $ENV_FILE."
    echo "    The app will still build, open and work offline, but it cannot sync."
else
    echo "    Project: ${URL:0:28}... (anon key baked in)"
fi

# ---------------------------------------------------------------------------
say "Drawing the icon"
# ---------------------------------------------------------------------------
java tools/MakeIcon.java

# ---------------------------------------------------------------------------
say "Building and testing"
# ---------------------------------------------------------------------------
# The tests run here on purpose. Packaging an app whose planner disagrees with
# the one it was ported from is the failure this whole exercise exists to
# avoid, so the build refuses rather than warns.

./gradlew test :ui:stageRuntime --console=plain -q

MAIN_JAR=$(cd "$STAGE" && ls ui-*.jar | head -1)
echo "    main jar: $MAIN_JAR"

# ---------------------------------------------------------------------------
say "Packaging"
# ---------------------------------------------------------------------------
rm -rf "$DIST/$APP_NAME"
mkdir -p "$DIST"

# JavaFX sits on the classpath rather than the module path, so the runtime
# image is built from an explicit module list instead of being inferred.
# java.net.http is the sync layer, java.sql is H2, jdk.crypto.ec is TLS --
# leaving that one out produces a handshake failure at the first sync and
# nothing that points at the cause.
jpackage \
    --type app-image \
    --name "$APP_NAME" \
    --app-version "0.1.0" \
    --vendor "StudyFlow" \
    --description "Your school day, your homework, and tonight's plan - offline." \
    --input "$STAGE" \
    --main-jar "$MAIN_JAR" \
    --main-class flow.study.ui.Launcher \
    --icon packaging/studyflow.ico \
    --dest "$DIST" \
    --java-options "-Xmx512m" \
    --java-options "-Dfile.encoding=UTF-8" \
    --add-modules java.base,java.desktop,java.logging,java.management,java.naming,java.net.http,java.scripting,java.sql,java.xml,jdk.crypto.ec,jdk.unsupported

echo "    built $DIST/$APP_NAME/$APP_NAME.exe"

# ---------------------------------------------------------------------------
say "Putting a shortcut on the Desktop"
# ---------------------------------------------------------------------------
# Read the Desktop location from the shell rather than assuming $HOME/Desktop:
# it is redirected into OneDrive on this machine.

EXE_WIN=$(cygpath -w "$DIST/$APP_NAME/$APP_NAME.exe")
ICO_WIN=$(cygpath -w "$ROOT/packaging/studyflow.ico")

powershell.exe -NoProfile -Command "
    \$desktop = [Environment]::GetFolderPath('Desktop')
    \$link = Join-Path \$desktop 'StudyFlow.lnk'
    \$shell = New-Object -ComObject WScript.Shell
    \$shortcut = \$shell.CreateShortcut(\$link)
    \$shortcut.TargetPath = '$EXE_WIN'
    \$shortcut.IconLocation = '$ICO_WIN'
    \$shortcut.WorkingDirectory = Split-Path '$EXE_WIN'
    \$shortcut.Description = 'StudyFlow'
    \$shortcut.Save()
    Write-Output (\"    shortcut: \" + \$link)
"

say "Done. Double-click StudyFlow on your Desktop."
