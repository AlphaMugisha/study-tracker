import javax.imageio.ImageIO;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.Arc2D;
import java.awt.geom.Ellipse2D;
import java.awt.geom.RoundRectangle2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Draws the StudyFlow icon, as a PNG for the window and an ICO for the
 * Desktop shortcut.
 *
 * Run with:  java tools/MakeIcon.java
 *
 * No image library and no design tool. ImageIO cannot write ICO, so the ICO
 * is assembled by hand -- which is reasonable rather than heroic, because an
 * icon directory is six bytes of header, sixteen per entry, and since Vista
 * each entry may be a PNG rather than a bitmap. So the same PNGs are embedded
 * and nothing has to encode a DIB.
 *
 * The mark is the progress ring: the app answers "where am I in my day", and
 * an arc with time still to run is that question in one shape. It also stays
 * legible at 16 pixels, which a book or a pencil does not.
 */
public final class MakeIcon {

    /* Lifted from src/app/globals.css, same as the stylesheet. */
    private static final Color BG = new Color(0x10, 0x13, 0x18);
    private static final Color BRAND = new Color(0x6c, 0x8c, 0xff);
    private static final Color MINT = new Color(0x55, 0xd6, 0xbe);

    /** Windows asks for all of these; a shortcut uses 32 and the taskbar 16. */
    private static final int[] SIZES = {16, 24, 32, 48, 64, 128, 256};

    public static void main(String[] args) throws IOException {
        Path resources = Path.of("ui/src/main/resources/flow/study/ui");
        Path distribution = Path.of("packaging");
        Files.createDirectories(resources);
        Files.createDirectories(distribution);

        ImageIO.write(draw(256), "png", resources.resolve("icon.png").toFile());

        BufferedImage[] frames = new BufferedImage[SIZES.length];
        for (int i = 0; i < SIZES.length; i++) frames[i] = draw(SIZES[i]);
        writeIco(distribution.resolve("studyflow.ico"), frames);

        System.out.println("wrote " + resources.resolve("icon.png"));
        System.out.println("wrote " + distribution.resolve("studyflow.ico"));
    }

    private static BufferedImage draw(int size) {
        BufferedImage image = new BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = image.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_STROKE_CONTROL,
                RenderingHints.VALUE_STROKE_PURE);

        double s = size;
        double radius = s * 0.22;

        g.setColor(BG);
        g.fill(new RoundRectangle2D.Double(0, 0, s, s, radius, radius));

        /*
         * The ring. Inset generously: at 16px a ring that reaches the edge
         * merges with the rounded corners and reads as a blob.
         */
        double inset = s * 0.22;
        double diameter = s - inset * 2;
        double stroke = Math.max(1.5, s * 0.11);

        g.setStroke(new BasicStroke((float) stroke, BasicStroke.CAP_ROUND,
                BasicStroke.JOIN_ROUND));

        // The part of the day already gone, kept dim so the arc reads as
        // progress rather than as a plain circle.
        g.setColor(new Color(BRAND.getRed(), BRAND.getGreen(), BRAND.getBlue(), 70));
        g.draw(new Ellipse2D.Double(inset, inset, diameter, diameter));

        // Two thirds elapsed: enough arc to be obviously partial at any size.
        g.setColor(MINT);
        g.draw(new Arc2D.Double(inset, inset, diameter, diameter, 90, -240, Arc2D.OPEN));

        // The centre dot only survives above 24px; below that it closes up the
        // ring and the shape stops reading.
        if (size >= 32) {
            double dot = s * 0.11;
            g.setColor(BRAND);
            g.fill(new Ellipse2D.Double(s / 2 - dot / 2, s / 2 - dot / 2, dot, dot));
        }

        g.dispose();
        return image;
    }

    /**
     * ICONDIR, then one ICONDIRENTRY per frame, then the PNG payloads.
     *
     * Everything is little-endian. A dimension of 256 is written as 0, which
     * is the format convention rather than a bug.
     */
    private static void writeIco(Path path, BufferedImage[] frames) throws IOException {
        byte[][] payloads = new byte[frames.length][];
        for (int i = 0; i < frames.length; i++) {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            ImageIO.write(frames[i], "png", buffer);
            payloads[i] = buffer.toByteArray();
        }

        int headerSize = 6 + 16 * frames.length;
        int offset = headerSize;

        try (OutputStream out = Files.newOutputStream(path)) {
            writeShort(out, 0);               // reserved
            writeShort(out, 1);               // type 1 = icon
            writeShort(out, frames.length);

            for (int i = 0; i < frames.length; i++) {
                int width = frames[i].getWidth();
                int height = frames[i].getHeight();

                out.write(width >= 256 ? 0 : width);
                out.write(height >= 256 ? 0 : height);
                out.write(0);                 // palette count, 0 for truecolour
                out.write(0);                 // reserved
                writeShort(out, 1);           // colour planes
                writeShort(out, 32);          // bits per pixel
                writeInt(out, payloads[i].length);
                writeInt(out, offset);

                offset += payloads[i].length;
            }

            for (byte[] payload : payloads) out.write(payload);
        }
    }

    private static void writeShort(OutputStream out, int value) throws IOException {
        out.write(value & 0xff);
        out.write((value >> 8) & 0xff);
    }

    private static void writeInt(OutputStream out, int value) throws IOException {
        out.write(value & 0xff);
        out.write((value >> 8) & 0xff);
        out.write((value >> 16) & 0xff);
        out.write((value >> 24) & 0xff);
    }
}
