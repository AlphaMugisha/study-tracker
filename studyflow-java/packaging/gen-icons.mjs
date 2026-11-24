/**
 * Turn the website's icons into Java.
 *
 *   node packaging/gen-icons.mjs
 *
 * ---------------------------------------------------------------------------
 * The desktop app and the website should be wearing the same icons, and there
 * are only three ways to arrange that.
 *
 *   An icon-pack library.  Ikonli ships feather and FontAwesome. Neither is
 *                          lucide, and a pack that tracks upstream at its own
 *                          pace is a slow drift away from the thing it is
 *                          supposed to match.
 *
 *   An icon font.          Works, but a glyph cannot be stroked at a chosen
 *                          width, and lucide is a stroke set -- the weight is
 *                          the look.
 *
 *   This.                  lucide-react already ships every icon as a plain
 *                          data object: a name, a 24x24 box, and a list of
 *                          SVG primitives. Reading that and emitting Java is
 *                          twenty lines, adds no dependency to the app, and
 *                          is exactly the same geometry the browser draws.
 *
 * The output is committed, so a Gradle build never needs node_modules. Re-run
 * this only when the icon list below changes or lucide is upgraded.
 * ---------------------------------------------------------------------------
 */

import { readFileSync, writeFileSync } from "node:fs";

/**
 * Resolved from the repo root, where node_modules actually is.
 *
 * The per-icon files exist only in the ESM build -- lucide's CJS output is one
 * bundle -- so these are imported as modules by URL rather than required.
 */
const ICON_DIR = new URL("../../node_modules/lucide-react/dist/esm/icons/", import.meta.url);

/**
 * What the app uses. Kebab-case, exactly as lucide names them.
 *
 * Deliberately a list rather than "every icon lucide has": the generated file
 * is read by people, and a thousand methods nobody calls is not a convenience.
 */
const ICONS = [
    // Navigation
    "sun", "calendar-days", "clipboard-list", "list-checks", "circle-help", "settings",
    // Chrome
    "plus", "refresh-cw", "wifi-off", "chevron-right", "chevron-left",
    // Today and the plan
    "graduation-cap", "clock", "play", "coffee", "circle-check", "sparkles",
    // Homework
    "pencil", "trash-2", "square-arrow-out-up-right", "check", "circle-plus",
    // Timetable
    "image-up", "list-plus", "clipboard-copy", "calendar-plus", "book-open-text",
    // Settings and status
    "lock", "shield", "log-out", "info", "triangle-alert",
];

/** kebab-case to the Java method name. `trash-2` becomes `trash2`. */
const methodName = (name) =>
    name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

/**
 * One lucide primitive becomes one line of Java.
 *
 * lucide uses five shapes. Everything is stroked and nothing is filled, which
 * is the whole reason this cannot be a font: the stroke width is the design.
 */
function shapeOf(tag, attrs) {
    const n = (key) => Number(attrs[key]);
    switch (tag) {
        case "path":
            return `path(${JSON.stringify(attrs.d)})`;
        case "circle":
            return `circle(${n("cx")}, ${n("cy")}, ${n("r")})`;
        case "line":
            return `line(${n("x1")}, ${n("y1")}, ${n("x2")}, ${n("y2")})`;
        case "rect":
            return `rect(${n("x")}, ${n("y")}, ${n("width")}, ${n("height")}, `
                + `${Number(attrs.rx ?? 0)})`;
        case "polyline":
            return `polyline(${JSON.stringify(attrs.points)})`;
        case "polygon":
            return `polygon(${JSON.stringify(attrs.points)})`;
        case "ellipse":
            return `ellipse(${n("cx")}, ${n("cy")}, ${n("rx")}, ${n("ry")})`;
        default:
            throw new Error(`lucide grew a new primitive: <${tag}>`);
    }
}

/**
 * The icon's drawing data, following renames.
 *
 * Some names are aliases: `circle-help.mjs` is one line re-exporting
 * `circle-question-mark.mjs`, and re-exports only the component, not the
 * data. Following the alias keeps the list above written in the names the
 * website's imports use rather than in whatever lucide renamed them to.
 */
async function loadIconData(name, seen = new Set()) {
    if (seen.has(name)) throw new Error(`lucide alias loop at "${name}"`);
    seen.add(name);

    const file = new URL(`${name}.mjs`, ICON_DIR);
    const module = await import(file);
    if (module.__iconData) return module.__iconData;

    const alias = readFileSync(file, "utf8").match(/from '\.\/([a-z0-9-]+)\.mjs'/);
    if (!alias) throw new Error(`no __iconData and no alias in lucide icon "${name}"`);
    return loadIconData(alias[1], seen);
}

const methods = [];

for (const name of ICONS) {
    const data = await loadIconData(name);

    const shapes = data.node.map(([tag, attrs]) => shapeOf(tag, attrs));

    methods.push(
        `    /** lucide ${name} */\n`
        + `    public static Node ${methodName(name)}() {\n`
        + `        return icon(\n`
        + shapes.map((s) => `                ${s}`).join(",\n")
        + `);\n`
        + `    }`);
}

const out = `package flow.study.ui.kit;

import javafx.scene.Group;
import javafx.scene.Node;
import javafx.scene.shape.Circle;
import javafx.scene.shape.Ellipse;
import javafx.scene.shape.Line;
import javafx.scene.shape.Polygon;
import javafx.scene.shape.Polyline;
import javafx.scene.shape.Rectangle;
import javafx.scene.shape.SVGPath;
import javafx.scene.shape.Shape;
import javafx.scene.shape.StrokeLineCap;
import javafx.scene.shape.StrokeLineJoin;

/**
 * The website's icons, as JavaFX shapes.
 *
 * GENERATED by packaging/gen-icons.mjs from the lucide data in node_modules.
 * Do not edit by hand -- add the name to the list in that script and re-run it.
 *
 * Every icon is a 24x24 group of STROKED outlines. Rendering lucide's paths
 * as fills turns each one into a blob, because the set is drawn as lines and
 * the stroke weight is the design. The colour comes from CSS: the group
 * carries the \`icon\` style class, so a hover state can recolour it the same
 * way it recolours the label beside it.
 */
public final class Icons {

    /** lucide's own canvas. Everything below is drawn in this box. */
    public static final double BOX = 24;

    private Icons() {
    }

${methods.join("\n\n")}

    // -----------------------------------------------------------------------
    // The primitives lucide draws with
    // -----------------------------------------------------------------------

    private static Node icon(Shape... parts) {
        for (Shape part : parts) {
            part.setFill(null);
            part.setStrokeWidth(2);
            part.setStrokeLineCap(StrokeLineCap.ROUND);
            part.setStrokeLineJoin(StrokeLineJoin.ROUND);
            part.getStyleClass().add("icon-stroke");
        }
        Group group = new Group(parts);
        group.getStyleClass().add("icon");
        return group;
    }

    private static Shape path(String d) {
        SVGPath shape = new SVGPath();
        shape.setContent(d);
        return shape;
    }

    private static Shape circle(double cx, double cy, double r) {
        return new Circle(cx, cy, r);
    }

    private static Shape ellipse(double cx, double cy, double rx, double ry) {
        return new Ellipse(cx, cy, rx, ry);
    }

    private static Shape line(double x1, double y1, double x2, double y2) {
        return new Line(x1, y1, x2, y2);
    }

    private static Shape rect(double x, double y, double w, double h, double r) {
        Rectangle shape = new Rectangle(x, y, w, h);
        shape.setArcWidth(r * 2);
        shape.setArcHeight(r * 2);
        return shape;
    }

    private static Shape polyline(String points) {
        Polyline shape = new Polyline();
        shape.getPoints().setAll(numbers(points));
        return shape;
    }

    private static Shape polygon(String points) {
        Polygon shape = new Polygon();
        shape.getPoints().setAll(numbers(points));
        return shape;
    }

    private static java.util.List<Double> numbers(String points) {
        java.util.List<Double> values = new java.util.ArrayList<>();
        for (String token : points.trim().split("[\\\\s,]+")) {
            if (!token.isEmpty()) values.add(Double.valueOf(token));
        }
        return values;
    }
}
`;

const target = "ui/src/main/java/flow/study/ui/kit/Icons.java";
writeFileSync(target, out, "utf8");
console.log(`wrote ${target} — ${ICONS.length} icons`);
